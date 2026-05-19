import { supabaseAdmin } from '@/lib/supabase-admin'

export const BUCKET_SUBMISSIONS = 'submissions'
export const FACTURA_SIGNED_URL_TTL_SEC = 3600

export function facturaStoragePath(clerkUserId: string, periodo: string): string {
  return `${clerkUserId}/${periodo}_factura.pdf`
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

export async function persistFacturaEmitidaToSubmission(params: {
  submissionId: string
  clerkUserId: string
  facturaPath: string
  caeNumero: string
  caeVencimiento: string
}): Promise<void> {
  const { error } = await supabaseAdmin
    .from('monthly_submissions')
    .update({
      factura_path: params.facturaPath,
      cae_numero: params.caeNumero,
      cae_vencimiento: params.caeVencimiento,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.submissionId)
    .eq('clerk_user_id', params.clerkUserId)

  if (error) {
    throw new Error(`No se pudo actualizar la liquidación: ${error.message}`)
  }
}
