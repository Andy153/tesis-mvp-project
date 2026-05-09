import { supabaseAdmin } from './supabase-admin'
import type { PersistedFileEntry, TrackingCobro } from './history'

function parseDateToISO(dateStr: string | null | undefined): string | null {
  if (!dateStr || typeof dateStr !== 'string') return null
  const trimmed = dateStr.trim()
  if (!trimmed) return null

  // Formato ISO: "YYYY-MM-DD" (ya está bien)
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`
  }

  // Formato argentino: "DD/MM/YYYY" o "DD-MM-YYYY"
  const arMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (arMatch) {
    const dd = arMatch[1].padStart(2, '0')
    const mm = arMatch[2].padStart(2, '0')
    const yyyy = arMatch[3]
    // Validar que el día y mes sean válidos
    const day = Number(dd)
    const month = Number(mm)
    if (day < 1 || day > 31 || month < 1 || month > 12) return null
    return `${yyyy}-${mm}-${dd}`
  }

  // Último intento: parsear con Date()
  const d = new Date(trimmed)
  if (Number.isNaN(d.getTime())) return null
  const yyyy = String(d.getFullYear())
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/**
 * Calcula a qué período (cierre mensual) pertenece un parte y si está vencido.
 *
 * Reglas (en orden):
 * 1. Si fecha_practica es null o del futuro → estado='pendiente', periodo=null
 * 2. Si pasaron más de 60 días desde la operación → estado='vencido', periodo=null
 * 3. Si la fecha del cierre natural (1° del mes siguiente, 9:00 AM) todavía no llegó → ese es el período
 * 4. Si ya pasó el cierre natural pero estamos dentro de 60 días → próximo cierre disponible
 *
 * @param fechaPracticaISO Fecha de operación en formato "YYYY-MM-DD" (o null)
 * @param ahora Momento de carga (default: now)
 * @returns { periodo: "YYYY-MM" | null, estado: 'pendiente' | 'vencido' }
 */
function calcularPeriodoYEstado(
  fechaPracticaISO: string | null,
  ahora: Date = new Date(),
): { periodo: string | null; estado: 'pendiente' | 'vencido' } {
  if (!fechaPracticaISO) {
    return { periodo: null, estado: 'pendiente' }
  }

  const fechaPractica = new Date(fechaPracticaISO + 'T00:00:00')
  if (Number.isNaN(fechaPractica.getTime())) {
    return { periodo: null, estado: 'pendiente' }
  }

  if (fechaPractica.getTime() > ahora.getTime()) {
    return { periodo: null, estado: 'pendiente' }
  }

  const msPorDia = 24 * 60 * 60 * 1000
  const diasTranscurridos = Math.floor(
    (ahora.getTime() - fechaPractica.getTime()) / msPorDia,
  )
  if (diasTranscurridos > 60) {
    return { periodo: null, estado: 'vencido' }
  }

  function cierreDeMes(year: number, month1to12: number): Date {
    return new Date(year, month1to12 - 1, 1, 9, 0, 0, 0)
  }

  function toYYYYMM(year: number, month1to12: number): string {
    return `${year}-${String(month1to12).padStart(2, '0')}`
  }

  const yearOp = fechaPractica.getFullYear()
  const monthOp = fechaPractica.getMonth() + 1
  let cierreYear = monthOp === 12 ? yearOp + 1 : yearOp
  let cierreMonth = monthOp === 12 ? 1 : monthOp + 1
  let cierre = cierreDeMes(cierreYear, cierreMonth)

  while (ahora.getTime() >= cierre.getTime()) {
    cierreMonth = cierreMonth === 12 ? 1 : cierreMonth + 1
    cierreYear = cierreMonth === 1 ? cierreYear + 1 : cierreYear
    cierre = cierreDeMes(cierreYear, cierreMonth)
  }

  return {
    periodo: toYYYYMM(cierreYear, cierreMonth),
    estado: 'pendiente',
  }
}

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
      fecha_practica: parseDateToISO(ext?.cirugia?.fecha),
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

  // 3. Insertar liquidación con periodo y estado calculados
  // Si falla, logueamos pero NO rompemos el flujo: el doc y la extraction
  // ya se crearon correctamente. La liquidación se puede crear después.
  const fechaPracticaISO = parseDateToISO(ext?.cirugia?.fecha)
  const { periodo, estado } = calcularPeriodoYEstado(fechaPracticaISO)

  const { error: liquidacionErr } = await supabaseAdmin
    .from('liquidaciones')
    .insert({
      clerk_user_id: clerkUserId,
      document_id: doc.id,
      extraction_id: extraction.id,
      prepaga: ext?.cobertura?.prepaga ?? opts.prepaga ?? 'desconocida',
      periodo,
      estado,
    })

  if (liquidacionErr) {
    console.error('[TRAZA] Error inserting liquidacion (non-blocking):', liquidacionErr)
  } else {
    console.log(`[TRAZA] Liquidación creada: periodo=${periodo}, estado=${estado}`)
  }

  return { documentId: doc.id, extractionId: extraction.id, storagePath: opts.storagePath }
}
