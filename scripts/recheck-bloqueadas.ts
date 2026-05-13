#!/usr/bin/env -S npx tsx
// scripts/recheck-bloqueadas.ts
//
// Re-corre runChecks sobre todas las liquidaciones con estado_revision='bloqueado'
// y, si la inferencia mejorada encuentra un código que antes no encontraba,
// actualiza:
//   - ai_extractions.codigo_nomenclador  ← nuevo código inferido
//   - ai_extractions.edited_fields       ← añade 'codigo_nomenclador_auto'
//   - liquidaciones.motivos_revision     ← saca CODIGO_AUSENTE de la lista
//   - liquidaciones.estado_revision      ← si ya no quedan blockers, pasa a 'en_revision'
//
// Uso:
//   npx tsx scripts/recheck-bloqueadas.ts                       (dry-run; reporta cambios sin tocar)
//   npx tsx scripts/recheck-bloqueadas.ts --apply               (aplica los UPDATEs)
//   npx tsx scripts/recheck-bloqueadas.ts --reinferir-auto      (también re-infiere códigos
//                                                                 que ya están seteados PERO
//                                                                 vinieron del fallback automático,
//                                                                 nunca pisa códigos editados por
//                                                                 el médico)
//
// No requiere Clerk auth: usa supabaseAdmin (service_role).

import { createClient } from '@supabase/supabase-js'
import { runChecks, type CheckInputs, type CheckIssue } from '../lib/checks'

const APPLY = process.argv.includes('--apply')
const REINFERIR_AUTO = process.argv.includes('--reinferir-auto')

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en el env.')
  process.exit(1)
}
const supabase = createClient(url, key, { auth: { persistSession: false } })

type LiqRow = {
  id: string
  clerk_user_id: string
  estado_revision: string | null
  motivos_revision: unknown
  extraction_id: string | null
  ai_extractions: {
    id: string
    codigo_nomenclador: string | null
    descripcion_practica: string | null
    datos_extras: Record<string, any> | null
    edited_fields: unknown
    fecha_practica: string | null
  } | null
}

function parseDateToISO(s: string | null | undefined): string | null {
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  const d = new Date(s)
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  return null
}

async function main() {
  console.log(`[recheck] mode=${APPLY ? 'APPLY' : 'DRY-RUN'}`)
  const { data: liqs, error } = await supabase
    .from('liquidaciones')
    .select(
      `
      id,
      clerk_user_id,
      estado_revision,
      motivos_revision,
      extraction_id,
      ai_extractions!inner (
        id, codigo_nomenclador, descripcion_practica, datos_extras, edited_fields, fecha_practica
      )
    `,
    )
    .eq('estado_revision', 'bloqueado')
    .returns<LiqRow[]>()

  if (error) {
    console.error('Error fetching liquidaciones:', error)
    process.exit(1)
  }
  console.log(`[recheck] Liquidaciones bloqueadas: ${liqs?.length ?? 0}`)

  let cambiadas = 0
  let sinCambios = 0
  let errores = 0

  for (const liq of liqs ?? []) {
    const ext = liq.ai_extractions
    if (!ext) continue

    const ds = ext.datos_extras ?? {}
    const fechaISO =
      parseDateToISO(ext.fecha_practica) ?? parseDateToISO(ds?.cirugia?.fecha)

    const inputs: CheckInputs = {
      prepaga: ds?.cobertura?.prepaga ?? null,
      numeroAfiliado: ds?.cobertura?.numero_afiliado
        ? String(ds.cobertura.numero_afiliado)
        : null,
      sanatorio: ds?.sanatorio ?? ext.descripcion_practica ?? null,
      codigoNomenclador: ext.codigo_nomenclador ?? null,
      descripcionPractica:
        ds?.procedimiento?.descripcion_tecnica ??
        ds?.procedimiento?.tipo_realizado ??
        ext.descripcion_practica ??
        null,
      tipoRealizado: ds?.procedimiento?.tipo_realizado ?? null,
      diagnosticoOperatorio: ds?.procedimiento?.diagnostico_operatorio ?? null,
      fechaPracticaISO: fechaISO,
    }

    // Si queremos re-inferir códigos que ya vienen del auto-fill, le pasamos
    // null como codigoNomenclador a runChecks para forzar la inferencia nueva.
    const editedFields = Array.isArray(ext.edited_fields)
      ? (ext.edited_fields as string[])
      : []
    const codigoFueAutoFill = editedFields.includes('codigo_nomenclador_auto')
    const inputsParaInferir: CheckInputs =
      REINFERIR_AUTO && codigoFueAutoFill
        ? { ...inputs, codigoNomenclador: null }
        : inputs

    const r = runChecks(inputsParaInferir)

    const motivosNuevos = [...r.blockers, ...r.warnings] as CheckIssue[]
    const estadoNuevo = r.estado_revision

    // Casos en los que actualizamos el código:
    //  A) estaba vacío y la inferencia encontró algo nuevo.
    //  B) ya tenía valor PERO venía del auto-fill anterior y la inferencia
    //     mejorada propone uno distinto (sólo si --reinferir-auto).
    const codigoCambia =
      (!ext.codigo_nomenclador && !!r.autoFilledCode) ||
      (REINFERIR_AUTO &&
        codigoFueAutoFill &&
        !!r.autoFilledCode &&
        r.autoFilledCode !== ext.codigo_nomenclador)

    const motivosActuales = Array.isArray(liq.motivos_revision)
      ? (liq.motivos_revision as CheckIssue[])
      : []
    const motivosCambian =
      JSON.stringify(motivosActuales.map((m) => m.code).sort()) !==
      JSON.stringify(motivosNuevos.map((m) => m.code).sort())
    const estadoCambia = estadoNuevo !== liq.estado_revision

    if (!codigoCambia && !motivosCambian && !estadoCambia) {
      sinCambios += 1
      continue
    }

    console.log(`\n[recheck] liq=${liq.id} user=${liq.clerk_user_id}`)
    if (codigoCambia) {
      const prev = ext.codigo_nomenclador ?? 'null'
      console.log(`  + codigo_nomenclador: ${prev} → ${r.autoFilledCode}`)
    }
    if (motivosCambian) {
      const prevCodes = motivosActuales.map((m) => m.code).join(',') || '(ninguno)'
      const nextCodes = motivosNuevos.map((m) => m.code).join(',') || '(ninguno)'
      console.log(`  ~ motivos_revision: [${prevCodes}] → [${nextCodes}]`)
    }
    if (estadoCambia) {
      console.log(`  ~ estado_revision: ${liq.estado_revision} → ${estadoNuevo}`)
    }

    if (!APPLY) {
      cambiadas += 1
      continue
    }

    if (codigoCambia) {
      const editedNuevos = Array.from(
        new Set([...editedFields, 'codigo_nomenclador_auto']),
      )
      const { error: e1 } = await supabase
        .from('ai_extractions')
        .update({
          codigo_nomenclador: r.autoFilledCode,
          edited_fields: editedNuevos,
        })
        .eq('id', ext.id)
      if (e1) {
        console.error('  ERROR ai_extractions update:', e1)
        errores += 1
        continue
      }
    }

    const { error: e2 } = await supabase
      .from('liquidaciones')
      .update({
        motivos_revision: motivosNuevos,
        estado_revision: estadoNuevo,
      })
      .eq('id', liq.id)
    if (e2) {
      console.error('  ERROR liquidaciones update:', e2)
      errores += 1
      continue
    }

    cambiadas += 1
  }

  console.log(`\n[recheck] Resumen:`)
  console.log(`  Cambiadas: ${cambiadas}`)
  console.log(`  Sin cambios: ${sinCambios}`)
  console.log(`  Errores: ${errores}`)
  if (!APPLY) {
    console.log(`\n(Esto fue un dry-run. Para aplicar: npx tsx scripts/recheck-bloqueadas.ts --apply)`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
