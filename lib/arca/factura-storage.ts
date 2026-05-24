import { supabaseAdmin } from '@/lib/supabase-admin'

export const BUCKET_SUBMISSIONS = 'submissions'
export const FACTURA_SIGNED_URL_TTL_SEC = 3600

export function facturaStoragePath(clerkUserId: string, periodo: string): string {
  return `${clerkUserId}/${periodo}_factura.pdf`
}

/**
 * Path donde se guarda el PDF de una Nota de Crédito.
 * Distinto del de factura para no pisar nada.
 */
export function notaCreditoStoragePath(
  clerkUserId: string,
  periodo: string,
  numeroNc: number,
): string {
  const numStr = String(numeroNc).padStart(8, '0')
  return `${clerkUserId}/${periodo}_nc_${numStr}.pdf`
}

export function formatCaeVencimientoForDb(caeFechaVto: string): string {
  const digits = String(caeFechaVto).replace(/\D/g, '')
  if (digits.length === 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`
  }
  return String(caeFechaVto)
}

export function assertFacturaPathOwnedByUser(path: string, clerkUserId: string): void {
  const expectedPrefix = `${clerkUserId}/`
  if (!path.startsWith(expectedPrefix) || path.includes('..')) {
    throw new Error('Ruta de factura no válida')
  }
}

export async function uploadFacturaPdf(path: string, buffer: Buffer): Promise<void> {
  const { error } = await supabaseAdmin.storage
    .from(BUCKET_SUBMISSIONS)
    .upload(path, buffer, { contentType: 'application/pdf', upsert: true })
  if (error) {
    throw new Error(`No se pudo guardar el PDF de la factura: ${error.message}`)
  }
}

export async function createFacturaSignedUrl(path: string): Promise<string> {
  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET_SUBMISSIONS)
    .createSignedUrl(path, FACTURA_SIGNED_URL_TTL_SEC)
  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? 'No se pudo generar el enlace de descarga')
  }
  return data.signedUrl
}

/**
 * Datos del receptor del comprobante.
 * `cuit` puede ser null cuando se factura a Consumidor Final sin CUIT.
 */
export interface ReceptorPersistible {
  cuit: string | null
  razonSocial: string
  condicionIVAId: number
}

export async function persistFacturaEmitidaToSubmission(params: {
  submissionId: string
  clerkUserId: string
  facturaPath: string
  caeNumero: string
  caeVencimiento: string
  numeroComprobante: number
  receptor: ReceptorPersistible
}): Promise<void> {
  const { error } = await supabaseAdmin
    .from('monthly_submissions')
    .update({
      factura_path: params.facturaPath,
      cae_numero: params.caeNumero,
      cae_vencimiento: params.caeVencimiento,
      numero_comprobante: params.numeroComprobante,
      receptor_cuit: params.receptor.cuit,
      receptor_razon_social: params.receptor.razonSocial,
      receptor_condicion_iva_id: params.receptor.condicionIVAId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.submissionId)
    .eq('clerk_user_id', params.clerkUserId)

  if (error) {
    throw new Error(`No se pudo actualizar la liquidación: ${error.message}`)
  }
}

/**
 * Inserta una nueva fila en monthly_submissions para una Nota de Crédito emitida.
 *
 * A diferencia de la factura (donde el wizard de cobros crea la fila vacía
 * antes de emitir y nosotros la UPDATEamos), la NC nace ya como un
 * comprobante fiscal autorizado: la creamos completa en un solo INSERT.
 *
 * Hereda obra_social, periodo, monto_total, mail_destinatario de la factura
 * original para mantener consistencia en reportes.
 */
export async function insertNotaCreditoSubmission(params: {
  clerkUserId: string
  submissionAnuladaId: string
  motivoAnulacion: string | null
  obraSocial: string
  periodo: string
  montoTotal: number
  mailDestinatario: string
  caeNumero: string
  caeVencimiento: string
  numeroComprobante: number
  ncPath: string
  receptor: ReceptorPersistible
}): Promise<{ id: string }> {
  const { data, error } = await supabaseAdmin
    .from('monthly_submissions')
    .insert({
      clerk_user_id: params.clerkUserId,
      tipo_comprobante: 13,
      submission_anulada_id: params.submissionAnuladaId,
      motivo_anulacion: params.motivoAnulacion,
      obra_social: params.obraSocial,
      periodo: params.periodo,
      monto_total: params.montoTotal,
      mail_destinatario: params.mailDestinatario,
      cantidad_partes: 0,
      status: 'emitido',
      partes_incluidos: [],
      cae_numero: params.caeNumero,
      cae_vencimiento: params.caeVencimiento,
      numero_comprobante: params.numeroComprobante,
      factura_path: params.ncPath,
      receptor_cuit: params.receptor.cuit,
      receptor_razon_social: params.receptor.razonSocial,
      receptor_condicion_iva_id: params.receptor.condicionIVAId,
    })
    .select('id')
    .single()

  if (error) {
    throw new Error(`No se pudo crear la nota de crédito: ${error.message}`)
  }
  if (!data) {
    throw new Error('No se pudo crear la nota de crédito: respuesta vacía')
  }
  return { id: data.id as string }
}
