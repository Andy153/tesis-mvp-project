import { supabaseAdmin } from './supabase'
import type { PersistedFileEntry, TrackingCobro } from './history'

export type LiquidacionDB = {
  id: string
  clerk_user_id: string
  document_id: string | null
  extraction_id: string | null
  prepaga: string
  periodo: string | null
  estado: 'pendiente' | 'presentado' | 'aprobado' | 'rechazado'
  monto_galenos: number | null
  motivo_rechazo: string | null
  fecha_presentacion: string | null
  fecha_resolucion: string | null
  notas: string | null
  created_at: string
  updated_at: string
  // campos joined de documents y ai_extractions
  documents?: {
    nombre_archivo: string | null
    tipo: string
    prepaga: string | null
    storage_path: string
    estado_proceso: string
    created_at: string
    ai_extractions?: {
      id: string
      paciente: string | null
      codigo_nomenclador: string | null
      descripcion_practica: string | null
      cirujano: string | null
      fecha_practica: string | null
      sanatorio: string | null
      anestesia: string | null
      datos_extras: Record<string, unknown>
    }[]
  } | null
}

export async function getLiquidacionesFromDB(clerkUserId: string): Promise<LiquidacionDB[]> {
  const { data, error } = await supabaseAdmin
    .from('liquidaciones')
    .select(`
      *,
      documents (
        nombre_archivo,
        tipo,
        prepaga,
        storage_path,
        estado_proceso,
        created_at,
        ai_extractions (
          id,
          paciente,
          codigo_nomenclador,
          descripcion_practica,
          cirujano,
          fecha_practica,
          sanatorio,
          anestesia,
          datos_extras
        )
      )
    `)
    .eq('clerk_user_id', clerkUserId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching liquidaciones:', error)
    return []
  }
  return (data || []) as LiquidacionDB[]
}

export async function upsertLiquidacionToDB(
  clerkUserId: string,
  liquidacion: {
    id?: string
    document_id?: string
    extraction_id?: string
    prepaga: string
    periodo?: string
    estado?: 'pendiente' | 'presentado' | 'aprobado' | 'rechazado'
    monto_galenos?: number
    motivo_rechazo?: string
    fecha_presentacion?: string
    notas?: string
  }
): Promise<LiquidacionDB | null> {
  const { data, error } = await supabaseAdmin
    .from('liquidaciones')
    .upsert({
      ...liquidacion,
      clerk_user_id: clerkUserId,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' })
    .select()
    .single()

  if (error) {
    console.error('Error upserting liquidacion:', error)
    return null
  }
  return data as LiquidacionDB
}

export async function saveDocumentAndExtraction(
  clerkUserId: string,
  opts: {
    storagePath: string
    nombreArchivo: string
    tipo: string
    prepaga: string
    aiExtraction: Record<string, unknown>
  }
): Promise<{ documentId: string; extractionId: string; storagePath: string } | null> {
  // 1. Insertar documento
  const { data: doc, error: docError } = await supabaseAdmin
    .from('documents')
    .insert({
      clerk_user_id: clerkUserId,
      tipo: opts.tipo,
      prepaga: opts.prepaga,
      storage_path: opts.storagePath,
      nombre_archivo: opts.nombreArchivo,
      estado_proceso: 'completado',
    })
    .select()
    .single()

  if (docError || !doc) {
    console.error('Error inserting document:', docError)
    return null
  }

  // 2. Insertar extracción IA
  const ext = opts.aiExtraction as any
  const { data: extraction, error: extError } = await supabaseAdmin
    .from('ai_extractions')
    .insert({
      document_id: doc.id,
      clerk_user_id: clerkUserId,
      paciente: ext?.paciente?.apellido_nombre ?? null,
      codigo_nomenclador: ext?.procedimiento?.codigo_nomenclador ?? null,
      descripcion_practica: ext?.procedimiento?.tipo_realizado ?? null,
      cirujano: ext?.equipo_quirurgico?.cirujano ?? null,
      fecha_practica: ext?.cirugia?.fecha ?? null,
      sanatorio: ext?.sanatorio ?? null,
      prepaga: ext?.cobertura?.prepaga ?? null,
      anestesia: ext?.anestesia?.tipo ?? null,
      datos_extras: ext ?? {},
      raw_response: ext ?? {},
    })
    .select()
    .single()

  if (extError || !extraction) {
    console.error('Error inserting extraction:', extError)
    return null
  }

  return { documentId: doc.id, extractionId: extraction.id, storagePath: opts.storagePath }
}
