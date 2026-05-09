// lib/swissCxBuild.ts
// Helper compartido entre /api/submissions/swiss-medical/build y /send.
// Encapsula la query de liquidaciones pendientes + filtro Swiss + mapeo a SwissCxRow.

import { supabaseAdmin } from '@/lib/supabase-admin'
import type { SwissCxRow } from '@/lib/types'

export type ParteInfo = {
  extraction_id: string
  document_id: string
  liquidacion_id: string
  paciente: string | null
  fecha_practica: string | null
  storage_path: string | null
  nombre_archivo: string | null
}

export type BuildSwissRowsResult =
  | { ok: true; rows: SwissCxRow[]; partes: ParteInfo[]; encontradosTotal: number }
  | { ok: false; status: 404; error: string; encontradosTotal: number }
  | { ok: false; status: 500; error: string }

function toDDMMYYYY(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return ''
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = String(d.getFullYear())
  return `${dd}/${mm}/${yyyy}`
}

/** Swiss Medical / SMG — mismo criterio que en períodos y filtros de liquidación. */
export function isSwissMedicalPrepaga(prepaga: string | null | undefined): boolean {
  if (!prepaga) return false
  const p = prepaga.toLowerCase().trim()
  return p.includes('swiss') || p.includes('smg') || p === 'sm'
}

/**
 * Trae las liquidaciones pendientes de Swiss Medical para un usuario+periodo,
 * y devuelve las filas listas para `generateSwissCxFiles` + info de los partes
 * (con storage_path para descargar PDFs después).
 */
export async function buildSwissRowsForPeriod(
  userId: string,
  periodo: string,
): Promise<BuildSwissRowsResult> {
  const { data: liquidaciones, error: extErr } = await supabaseAdmin
    .from('liquidaciones')
    .select(`
      id,
      periodo,
      estado,
      prepaga,
      ai_extractions!inner (
        id,
        document_id,
        paciente,
        codigo_nomenclador,
        descripcion_practica,
        fecha_practica,
        sanatorio,
        prepaga,
        datos_extras,
        documents!inner (
          id,
          nombre_archivo,
          storage_path,
          clerk_user_id
        )
      )
    `)
    .eq('clerk_user_id', userId)
    .eq('periodo', periodo)
    .eq('estado', 'pendiente')

  if (extErr) {
    console.error('[TRAZA] swissCxBuild:fetch_liquidaciones error:', extErr)
    return { ok: false, status: 500, error: extErr.message }
  }

  if (!liquidaciones || liquidaciones.length === 0) {
    return {
      ok: false,
      status: 404,
      error: 'No hay partes pendientes para ese período.',
      encontradosTotal: 0,
    }
  }

  const flattened = liquidaciones
    .map((l) => {
      const ext = l.ai_extractions as any
      return ext ? { liquidacionId: l.id, ...ext } : null
    })
    .filter((e): e is NonNullable<typeof e> => e !== null)

  const swissOnly = flattened.filter((e) => isSwissMedicalPrepaga(e.prepaga))

  if (swissOnly.length === 0) {
    return {
      ok: false,
      status: 404,
      error: 'No hay partes de Swiss Medical pendientes para ese período.',
      encontradosTotal: liquidaciones.length,
    }
  }

  const rows: SwissCxRow[] = swissOnly.map((e) => {
    const datos = (e.datos_extras as any) || {}
    const numeroAfiliado = datos?.cobertura?.numero_afiliado ?? ''
    const dni = datos?.paciente?.dni ?? ''
    const nroAutorizacion = datos?.autorizacion?.numero ?? ''
    const sanatorioRaw = e.sanatorio || ''

    return {
      fecha: toDDMMYYYY(e.fecha_practica),
      socio: String(numeroAfiliado || dni || ''),
      socioDesc: e.paciente || '',
      codigo: e.codigo_nomenclador || '',
      cant: '1',
      detalle: e.descripcion_practica || '',
      institucion: sanatorioRaw,
      cir: 'X',
      ayud: '',
      inst: '',
      urgencia: '',
      gastos: '',
      nroAutorizacion: String(nroAutorizacion || ''),
    }
  })

  const partes: ParteInfo[] = swissOnly.map((e) => ({
    extraction_id: e.id,
    document_id: e.document_id,
    liquidacion_id: e.liquidacionId,
    paciente: e.paciente,
    fecha_practica: e.fecha_practica,
    storage_path: (e.documents as any)?.storage_path ?? null,
    nombre_archivo: (e.documents as any)?.nombre_archivo ?? null,
  }))

  return { ok: true, rows, partes, encontradosTotal: liquidaciones.length }
}

