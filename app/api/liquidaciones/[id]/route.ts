// app/api/liquidaciones/[id]/route.ts
//
// PATCH: actualiza una liquidación con datos editados por el médico.
// Re-corre los chequeos en el servidor (defensa en profundidad).
// GET: devuelve la liquidación con los datos editables para mostrar en el modal.

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { runChecks, type CheckInputs } from '@/lib/checks'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ============================================================================
// GET: traer datos para el modal
// ============================================================================
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabaseAdmin
    .from('liquidaciones')
    .select(`
      id,
      periodo,
      estado,
      estado_revision,
      motivos_revision,
      prepaga,
      ai_extractions!inner (
        id,
        paciente,
        codigo_nomenclador,
        descripcion_practica,
        fecha_practica,
        sanatorio,
        prepaga,
        datos_extras,
        edited_by_user,
        edited_fields
      ),
      documents!inner (
        id,
        nombre_archivo,
        storage_path
      )
    `)
    .eq('id', params.id)
    .eq('clerk_user_id', userId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ liquidacion: data })
}

// ============================================================================
// PATCH: aplicar edición + re-correr chequeos
// ============================================================================
type PatchBody = {
  paciente?: string | null
  numero_afiliado?: string | null
  sanatorio?: string | null
  codigo_nomenclador?: string | null
  descripcion_practica?: string | null
  fecha_practica_iso?: string | null // 'YYYY-MM-DD'
  // Action: si es 'confirm', el médico apretó Confirmar (estado_revision pasa a confirmado).
  // Si es 'save_draft', solo guarda los cambios sin confirmar.
  action: 'confirm' | 'save_draft'
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: PatchBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (body.action !== 'confirm' && body.action !== 'save_draft') {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  // 1. Traer la liquidación + extraction actuales
  const { data: liq, error: liqErr } = await supabaseAdmin
    .from('liquidaciones')
    .select(`
      id,
      extraction_id,
      ai_extractions!inner (
        id,
        datos_extras,
        edited_fields
      )
    `)
    .eq('id', params.id)
    .eq('clerk_user_id', userId)
    .maybeSingle()

  if (liqErr) return NextResponse.json({ error: liqErr.message }, { status: 500 })
  if (!liq) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const ext = (liq.ai_extractions as any)
  const datosExtras = (ext?.datos_extras ?? {}) as any
  const prevEditedFields: string[] = Array.isArray(ext?.edited_fields) ? ext.edited_fields : []

  // 2. Aplicar las ediciones sobre datos_extras (deep merge mínimo de los campos relevantes)
  const newDatosExtras = { ...datosExtras }
  if (body.numero_afiliado !== undefined) {
    newDatosExtras.cobertura = {
      ...(newDatosExtras.cobertura ?? {}),
      numero_afiliado: body.numero_afiliado,
    }
  }

  // 3. Determinar qué campos cambiaron (para edited_fields)
  const editedFields = new Set(prevEditedFields)
  const setIf = (cond: boolean, field: string) => { if (cond) editedFields.add(field) }
  setIf(body.paciente !== undefined, 'paciente')
  setIf(body.numero_afiliado !== undefined, 'numero_afiliado')
  setIf(body.sanatorio !== undefined, 'sanatorio')
  setIf(body.codigo_nomenclador !== undefined, 'codigo_nomenclador')
  setIf(body.descripcion_practica !== undefined, 'descripcion_practica')
  setIf(body.fecha_practica_iso !== undefined, 'fecha_practica')

  // 4. Re-correr chequeos con los valores nuevos
  const checkInputs: CheckInputs = {
    prepaga: datosExtras?.cobertura?.prepaga ?? null,
    numeroAfiliado:
      body.numero_afiliado !== undefined
        ? body.numero_afiliado
        : (datosExtras?.cobertura?.numero_afiliado
            ? String(datosExtras.cobertura.numero_afiliado)
            : null),
    sanatorio: body.sanatorio !== undefined ? body.sanatorio : null,
    codigoNomenclador: body.codigo_nomenclador !== undefined ? body.codigo_nomenclador : null,
    descripcionPractica: body.descripcion_practica !== undefined ? body.descripcion_practica : null,
    fechaPracticaISO: body.fecha_practica_iso !== undefined ? body.fecha_practica_iso : null,
  }
  const checks = runChecks(checkInputs)

  // 5. Si action='confirm' y hay blockers → rechazar
  if (body.action === 'confirm' && checks.blockers.length > 0) {
    return NextResponse.json(
      {
        error: 'No se puede confirmar: hay datos faltantes o inválidos.',
        blockers: checks.blockers,
        warnings: checks.warnings,
      },
      { status: 400 },
    )
  }

  // 6. Calcular el estado_revision final
  let nuevoEstadoRevision: 'bloqueado' | 'en_revision' | 'confirmado' | null
  if (body.action === 'confirm') {
    nuevoEstadoRevision = 'confirmado'
  } else {
    // save_draft: usar lo que dice el motor (puede seguir bloqueado o pasar a en_revision)
    nuevoEstadoRevision = checks.estado_revision
  }

  // 7. UPDATE ai_extractions con los campos editados
  const extractionUpdate: any = {
    edited_by_user: editedFields.size > 0,
    edited_fields: Array.from(editedFields),
    datos_extras: newDatosExtras,
  }
  if (body.paciente !== undefined) extractionUpdate.paciente = body.paciente
  if (body.sanatorio !== undefined) extractionUpdate.sanatorio = body.sanatorio
  if (body.codigo_nomenclador !== undefined)
    extractionUpdate.codigo_nomenclador = body.codigo_nomenclador
  if (body.descripcion_practica !== undefined)
    extractionUpdate.descripcion_practica = body.descripcion_practica
  if (body.fecha_practica_iso !== undefined)
    extractionUpdate.fecha_practica = body.fecha_practica_iso

  const { error: updExtErr } = await supabaseAdmin
    .from('ai_extractions')
    .update(extractionUpdate)
    .eq('id', ext.id)
    .eq('clerk_user_id', userId)

  if (updExtErr) {
    console.error('[TRAZA] checks:update_extraction_error', updExtErr)
    return NextResponse.json({ error: updExtErr.message }, { status: 500 })
  }

  // 8. Recalcular periodo si cambió la fecha (solo si confirmamos o si está en flujo Swiss)
  let nuevoPeriodo: string | null | undefined = undefined
  let nuevoEstado: string | undefined = undefined
  if (body.fecha_practica_iso !== undefined) {
    // Reusamos calcularPeriodoYEstado de history-db importándola dinámicamente
    const { calcularPeriodoYEstadoExport } = await import('@/lib/checks-period')
    const calc = calcularPeriodoYEstadoExport(body.fecha_practica_iso)
    nuevoPeriodo = calc.periodo
    nuevoEstado = calc.estado
  }

  // 9. UPDATE liquidaciones
  const liquidacionUpdate: any = {
    estado_revision: nuevoEstadoRevision,
    motivos_revision: [...checks.blockers, ...checks.warnings],
    updated_at: new Date().toISOString(),
  }
  if (nuevoPeriodo !== undefined) liquidacionUpdate.periodo = nuevoPeriodo
  if (nuevoEstado !== undefined) liquidacionUpdate.estado = nuevoEstado

  const { error: updLiqErr } = await supabaseAdmin
    .from('liquidaciones')
    .update(liquidacionUpdate)
    .eq('id', params.id)
    .eq('clerk_user_id', userId)

  if (updLiqErr) {
    console.error('[TRAZA] checks:update_liquidacion_error', updLiqErr)
    return NextResponse.json({ error: updLiqErr.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    estado_revision: nuevoEstadoRevision,
    blockers: checks.blockers,
    warnings: checks.warnings,
    autoFilledCode: checks.autoFilledCode,
  })
}

// ============================================================================
// DELETE: cancelar (borra documento + extracción + liquidación + archivo)
// ============================================================================
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Traer document_id y storage_path
  const { data: liq, error: liqErr } = await supabaseAdmin
    .from('liquidaciones')
    .select('id, document_id, extraction_id, documents!inner(storage_path)')
    .eq('id', params.id)
    .eq('clerk_user_id', userId)
    .maybeSingle()

  if (liqErr) return NextResponse.json({ error: liqErr.message }, { status: 500 })
  if (!liq) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const storagePath = (liq.documents as any)?.storage_path
  const documentId = liq.document_id
  const extractionId = liq.extraction_id

  // Borrar archivo del bucket (graceful, no bloquea)
  if (storagePath && !storagePath.startsWith('TEST_FAKE_PATH/')) {
    const { error: storageErr } = await supabaseAdmin.storage
      .from('documentos-medicos')
      .remove([storagePath])
    if (storageErr) console.warn('[TRAZA] delete:storage_warn', storageErr.message)
  }

  // Borrar liquidación (primero, porque tiene FKs)
  await supabaseAdmin.from('liquidaciones').delete().eq('id', params.id).eq('clerk_user_id', userId)
  if (extractionId) {
    await supabaseAdmin.from('ai_extractions').delete().eq('id', extractionId).eq('clerk_user_id', userId)
  }
  if (documentId) {
    await supabaseAdmin.from('documents').delete().eq('id', documentId).eq('clerk_user_id', userId)
  }

  return NextResponse.json({ ok: true })
}
