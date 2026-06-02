import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  applyCobradoMontos,
  applyComprobanteMontos,
  applyFacturadoMontos,
  montoFiscalPrincipal,
  type MontosCobroRow,
} from '@/lib/cobros-montos';

/** Replica montos de monthly_submissions a la cirugía OSDE vinculada. */
export async function syncOsdeCirugiaMontosFromSubmission(
  submissionId: string,
  clerkUserId: string,
  fields: Partial<{
    monto_comprobante: number;
    monto_facturado: number;
    monto_cobrado: number;
  }>,
): Promise<void> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (fields.monto_comprobante != null) patch.monto_comprobante = fields.monto_comprobante;
  if (fields.monto_facturado != null) patch.monto_facturado = fields.monto_facturado;
  if (fields.monto_cobrado != null) patch.monto_cobrado = fields.monto_cobrado;
  if (Object.keys(patch).length <= 1) return;

  const { error } = await supabaseAdmin
    .from('osde_cirugias')
    .update(patch)
    .eq('monthly_submission_id', submissionId)
    .eq('clerk_user_id', clerkUserId);

  if (error) {
    console.warn('[TRAZA] osde:sync_montos_from_submission', error.message);
  }
}

export function buildSubmissionMontosFromComprobante(amount: number): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  applyComprobanteMontos(update, amount);
  return update;
}

export function buildSubmissionMontosFromFacturado(amount: number): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  applyFacturadoMontos(update, amount);
  return update;
}

export function buildSubmissionMontosFromCobrado(row: MontosCobroRow): Record<string, unknown> {
  const amount = montoFiscalPrincipal(row);
  if (amount == null) return {};
  const update: Record<string, unknown> = {};
  applyCobradoMontos(update, amount);
  return update;
}
