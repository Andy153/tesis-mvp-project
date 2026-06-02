import { applyFacturadoMontos } from '@/lib/cobros-montos'
import { syncOsdeCirugiaMontosFromSubmission } from '@/lib/osde-cirugias-montos'
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
  montoFacturado: number
  facturaPath: string
  caeNumero: string
  caeVencimiento: string
  numeroComprobante: number
  receptor: ReceptorPersistible
}): Promise<void> {
  // Defensa: chequear que el target sea una factura activa (tipo=11, no anulada).
  // Sin esto, una llamada con submissionId apuntando a una NC o a una factura
  // anulada sobrescribe la fila, generando estado inconsistente. Pasó en test
  // E2E Sprint 6.
  const { data: target, error: readErr } = await supabaseAdmin
    .from('monthly_submissions')
    .select('id, tipo_comprobante, anulada_at, cae_numero')
    .eq('id', params.submissionId)
    .eq('clerk_user_id', params.clerkUserId)
    .maybeSingle()

  if (readErr) {
    throw new Error(`No se pudo verificar la submission: ${readErr.message}`)
  }
  if (!target) {
    throw new Error('Submission no encontrada para persistir factura')
  }
  if (target.tipo_comprobante !== 11) {
    throw new Error(
      `No se puede persistir factura sobre una submission tipo ${target.tipo_comprobante}. Solo se permite sobre Facturas C (tipo=11).`,
    )
  }
  if (target.anulada_at != null) {
    throw new Error(
      'No se puede persistir factura sobre una submission anulada. Debe crearse una nueva submission para re-emitir.',
    )
  }
  if (target.cae_numero != null) {
    throw new Error(
      `La submission ya tiene factura emitida (CAE ${target.cae_numero}). Para emitir otra factura, crear una nueva submission.`,
    )
  }

  const montosUpdate: Record<string, unknown> = {
    factura_path: params.facturaPath,
    cae_numero: params.caeNumero,
    cae_vencimiento: params.caeVencimiento,
    numero_comprobante: params.numeroComprobante,
    receptor_cuit: params.receptor.cuit,
    receptor_razon_social: params.receptor.razonSocial,
    receptor_condicion_iva_id: params.receptor.condicionIVAId,
    wizard_estado: 'factura_instrucciones',
    wizard_paso: 5,
    updated_at: new Date().toISOString(),
  }
  applyFacturadoMontos(montosUpdate, params.montoFacturado)

  const { error } = await supabaseAdmin
    .from('monthly_submissions')
    .update(montosUpdate)
    .eq('id', params.submissionId)
    .eq('clerk_user_id', params.clerkUserId)

  if (error) {
    throw new Error(`No se pudo actualizar la liquidación: ${error.message}`)
  }

  await syncOsdeCirugiaMontosFromSubmission(params.submissionId, params.clerkUserId, {
    monto_facturado: params.montoFacturado,
  })
}

/**
 * Tras anular la factura con NC, crea una NUEVA submission factura (tipo=11)
 * lista para re-emisión, en lugar de "renacer" la factura original.
 *
 * Diseño (decisión Sprint 7, opción 2a):
 *   - La factura original queda intacta: con su CAE, número, factura_path,
 *     anulada_at populado. Es histórico inmutable.
 *   - Se crea una fila nueva, mismo período/obra_social/comprobante_smg_path,
 *     en paso 4 con estado 'comprobante_subido', sin datos fiscales.
 *   - El wizard del médico apunta a la submission nueva via leerSubmissionActiva.
 *
 * Razones:
 *   - Antes (Sprint 6), la fila de factura se "renombraba" reusándola: limpiaba
 *     cae/numero/path. Eso creaba estado contradictorio (anulada_at populado pero
 *     cae_numero también, post re-emisión). Y abría la puerta al bug del test E2E
 *     donde un submissionId del wizard apuntando mal sobrescribía la fila NC.
 *   - Submissions separadas → historial limpio, cada CAE en una fila distinta,
 *     auditable.
 *
 * Retorna el ID de la submission nueva (la que el wizard debería usar de ahora
 * en más), o null si algo falla en la lectura.
 */
export async function crearSubmissionParaReemisionPostNC(params: {
  submissionAnuladaId: string
  clerkUserId: string
}): Promise<string | null> {
  // Leer la factura anulada para heredar campos
  const { data: facturaAnulada, error: readErr } = await supabaseAdmin
    .from('monthly_submissions')
    .select(
      `obra_social, periodo, mail_destinatario,
       comprobante_smg_path, cantidad_partes, partes_incluidos,
       monto_total, enviado_en, wizard_estado, wizard_paso`,
    )
    .eq('id', params.submissionAnuladaId)
    .eq('clerk_user_id', params.clerkUserId)
    .maybeSingle()

  if (readErr || !facturaAnulada) return null

  // No crear submission nueva si la factura está descartada o aprobada
  const estado = facturaAnulada.wizard_estado as string | null
  if (!estado || estado === 'descartado' || estado === 'aprobado') return null

  // Crear nueva submission tipo=11 en paso 4
  // - Hereda obra_social, periodo, comprobante_smg_path, monto_total, etc.
  // - status='enviando' (igual que las submissions de wizard de cobros)
  // - wizard_paso=4, wizard_estado='comprobante_subido': lista para emitir factura
  // - Sin datos fiscales: cae_numero, factura_path, numero_comprobante = NULL
  const { data: nueva, error: insErr } = await supabaseAdmin
    .from('monthly_submissions')
    .insert({
      clerk_user_id: params.clerkUserId,
      tipo_comprobante: 11,
      obra_social: facturaAnulada.obra_social,
      periodo: facturaAnulada.periodo,
      mail_destinatario: facturaAnulada.mail_destinatario,
      comprobante_smg_path: facturaAnulada.comprobante_smg_path,
      cantidad_partes: facturaAnulada.cantidad_partes ?? 0,
      partes_incluidos: facturaAnulada.partes_incluidos ?? [],
      monto_total: facturaAnulada.monto_total,
      enviado_en: facturaAnulada.enviado_en ?? new Date().toISOString(),
      status: 'enviando',
      wizard_paso: 4,
      wizard_estado: 'comprobante_subido',
    })
    .select('id')
    .single()

  if (insErr) {
    throw new Error(`No se pudo crear submission para re-emisión: ${insErr.message}`)
  }
  return (nueva?.id as string) ?? null
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
      status: 'enviado',
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

/**
 * Marca una factura como anulada seteando `anulada_at = NOW()`.
 *
 * Se llama desde `emitirNotaCreditoC` después de persistir la NC exitosamente.
 * Es metadato de auditoría: la factura sigue existiendo con su CAE original,
 * este flag solo señala "esta factura tiene una NC asociada".
 *
 * Ortogonal a `revertirWizardAPasoFacturaTrasNotaCredito`:
 *   - `anulada_at`: señal permanente para listados/reportes/auditoría.
 *   - `revertirWizard...`: rollback operativo del wizard de cobros.
 *
 * Best-effort: si el UPDATE falla, loggea y devuelve false. La NC ya está
 * autorizada en ARCA y persistida, no hay rollback posible — perder el flag
 * no debe romper el flujo.
 */
export async function marcarFacturaComoAnulada(params: {
  submissionId: string
  clerkUserId: string
}): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('monthly_submissions')
    .update({
      anulada_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.submissionId)
    .eq('clerk_user_id', params.clerkUserId)

  if (error) {
    console.error(
      '[marcarFacturaComoAnulada] No se pudo setear anulada_at en factura',
      params.submissionId,
      ':',
      error.message,
    )
    return false
  }
  return true
}
