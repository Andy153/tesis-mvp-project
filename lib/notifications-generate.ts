import { supabaseAdmin } from '@/lib/supabase-admin';
import { isSwissMedicalPrepaga } from '@/lib/swissCxBuild';
import {
  currentPeriodoAR,
  isLastFiveDaysOfMonthAR,
  periodoLabel,
} from '@/lib/dates-ar';
import {
  insertNotificationOnce,
  isNotificationsEnabledForUser,
  upsertNotification,
  upsertOrInsertNotificationWithPushOnFirst,
} from '@/lib/notifications';
import { fetchActiveSubmissions } from '@/lib/active-submissions';
import { filterSubmissionsWithLiveLiquidaciones } from '@/lib/monthlySubmissions';

const OBRA_SOCIAL = 'swiss_medical';
const HOURS_48_MS = 48 * 60 * 60 * 1000;

function accionCobrosCopy(
  wizardEstado: string | null,
  wizardPaso: number | null,
  periodo: string,
): { titulo: string; mensaje: string } {
  const pl = periodoLabel(periodo);
  const paso = wizardPaso ?? 1;
  switch (wizardEstado) {
    case 'esperando_comprobante':
      return {
        titulo: 'Seguimiento de cobro Swiss Medical',
        mensaje: `Liquidación ${pl}: esperá el procesamiento de Swiss Medical y continuá el paso ${paso} del cobro.`,
      };
    case 'comprobante_disponible':
      return {
        titulo: 'Revisá el portal de Swiss Medical',
        mensaje: `Liquidación ${pl}: ingresá al portal y confirmá que aparece el comprobante (paso ${paso}).`,
      };
    case 'comprobante_subido':
      return {
        titulo: 'Emití la factura en ARCA',
        mensaje: `Liquidación ${pl}: el comprobante está registrado. Emití la factura C en ARCA (paso ${paso}).`,
      };
    case 'factura_instrucciones':
      return {
        titulo: 'Adjuntá la factura en Swiss Medical',
        mensaje: `Liquidación ${pl}: subí la factura en el portal de prestadores y confirmá el CAE (paso ${paso}).`,
      };
    case 'factura_adjuntada':
      return {
        titulo: 'Verificá la aprobación',
        mensaje: `Liquidación ${pl}: revisá si figura aprobado en el portal de Swiss Medical (paso ${paso}).`,
      };
    default:
      return {
        titulo: 'Acción requerida en cobros',
        mensaje: `Liquidación ${pl}: tenés un seguimiento de cobro pendiente (paso ${paso}).`,
      };
  }
}

async function countPendingSwissPartesForPeriodo(
  clerkUserId: string,
  periodo: string,
): Promise<number> {
  const { data: rows, error } = await supabaseAdmin
    .from('liquidaciones')
    .select(
      `
      periodo,
      prepaga,
      ai_extractions!inner (
        id,
        documents!inner ( id )
      )
    `,
    )
    .eq('clerk_user_id', clerkUserId)
    .eq('estado', 'pendiente')
    .eq('estado_revision', 'confirmado')
    .eq('periodo', periodo)
    .not('periodo', 'is', null);

  if (error) {
    console.warn('[TRAZA] notifications:pending_liq_error', error.message);
    return 0;
  }

  let count = 0;
  for (const l of rows ?? []) {
    if (l.periodo === periodo && isSwissMedicalPrepaga(l.prepaga)) count += 1;
  }
  return count;
}

export async function syncRecordatorioEnvio(clerkUserId: string): Promise<void> {
  if (!isNotificationsEnabledForUser(clerkUserId)) return;
  if (!isLastFiveDaysOfMonthAR()) return;

  const periodo = currentPeriodoAR();
  const cantidad = await countPendingSwissPartesForPeriodo(clerkUserId, periodo);
  if (cantidad <= 0) return;

  await insertNotificationOnce({
    clerkUserId,
    tipo: 'recordatorio_envio',
    titulo: 'Cierre de mes próximo',
    mensaje: `Tenés ${cantidad} parte${cantidad === 1 ? '' : 's'} confirmado${cantidad === 1 ? '' : 's'} sin enviar para ${periodoLabel(periodo)}. Cerrá la liquidación antes de fin de mes.`,
    dedupeKey: `recordatorio_envio:${periodo}`,
    metadata: {
      periodo,
      cantidad_pendientes: cantidad,
      navigate_to: 'documents',
    },
  });
}

export async function sync48hCumplidas(clerkUserId: string): Promise<void> {
  if (!isNotificationsEnabledForUser(clerkUserId)) return;

  const cutoff = new Date(Date.now() - HOURS_48_MS).toISOString();

  const { data, error } = await supabaseAdmin
    .from('monthly_submissions')
    .select('id, periodo, enviado_en, wizard_estado, partes_incluidos, cantidad_partes')
    .eq('clerk_user_id', clerkUserId)
    .eq('obra_social', OBRA_SOCIAL)
    .eq('status', 'enviado')
    .eq('wizard_estado', 'esperando_comprobante')
    .eq('tipo_comprobante', 11)
    .is('anulada_at', null)
    .lt('enviado_en', cutoff);

  if (error) {
    console.warn('[TRAZA] notifications:48h_query_error', error.message);
    return;
  }

  const subs = await filterSubmissionsWithLiveLiquidaciones(clerkUserId, data ?? []);

  for (const sub of subs) {
    await insertNotificationOnce({
      clerkUserId,
      tipo: '48h_cumplidas',
      titulo: 'Podés revisar el comprobante en Swiss Medical',
      mensaje: `Pasaron 48 horas desde el envío de ${periodoLabel(sub.periodo)}. Revisá el portal y continuá el cobro.`,
      dedupeKey: `48h_cumplidas:${sub.id}`,
      metadata: {
        submission_id: sub.id,
        periodo: sub.periodo,
        wizard_paso: 1,
        navigate_to: 'documents',
      },
    });
  }
}

export async function syncAccionCobros(clerkUserId: string): Promise<void> {
  if (!isNotificationsEnabledForUser(clerkUserId)) return;

  const active = await fetchActiveSubmissions(clerkUserId);
  const activeIds = new Set(active.map((s) => s.id));

  for (const sub of active) {
    const { titulo, mensaje } = accionCobrosCopy(sub.wizard_estado, sub.wizard_paso, sub.periodo);
    await upsertNotification({
      clerkUserId,
      tipo: 'accion_cobros',
      titulo,
      mensaje,
      dedupeKey: `accion_cobros:${sub.id}`,
      resetUnreadOnUpsert: true,
      metadata: {
        submission_id: sub.id,
        periodo: sub.periodo,
        wizard_estado: sub.wizard_estado,
        wizard_paso: sub.wizard_paso,
        navigate_to: 'documents',
      },
    });
  }

  // Quitar avisos de cobro obsoletos (submission ya no activa)
  const { data: stale, error } = await supabaseAdmin
    .from('notifications')
    .select('id, dedupe_key, metadata')
    .eq('clerk_user_id', clerkUserId)
    .eq('tipo', 'accion_cobros')
    .eq('leida', false);

  if (error || !stale?.length) return;

  for (const row of stale) {
    const meta = row.metadata as { submission_id?: string } | null;
    const sid = meta?.submission_id;
    const fromKey = typeof row.dedupe_key === 'string' ? row.dedupe_key.replace(/^accion_cobros:/, '') : '';
    const submissionId = sid ?? fromKey;
    if (submissionId && !activeIds.has(submissionId)) {
      await supabaseAdmin.from('notifications').delete().eq('id', row.id);
    }
  }
}

export async function notifyFacturaEmitida(input: {
  clerkUserId: string;
  submissionId: string;
  periodo: string;
  cae: string;
  nroComprobante?: number | null;
}): Promise<void> {
  if (!isNotificationsEnabledForUser(input.clerkUserId)) return;

  const caeTail = input.cae.length > 4 ? input.cae.slice(-4) : input.cae;

  await insertNotificationOnce({
    clerkUserId: input.clerkUserId,
    tipo: 'factura_emitida',
    titulo: 'Factura emitida',
    mensaje: `Factura C emitida para ${periodoLabel(input.periodo)} (CAE …${caeTail}). Continuá con el paso 5 del cobro en Mis documentos.`,
    dedupeKey: `factura_emitida:${input.submissionId}`,
    metadata: {
      submission_id: input.submissionId,
      periodo: input.periodo,
      cae: input.cae,
      nro_comprobante: input.nroComprobante ?? null,
      navigate_to: 'documents',
    },
  });
}

export async function notifyFacturaError(input: {
  clerkUserId: string;
  submissionId: string;
  periodo: string;
  errorMessage: string;
}): Promise<void> {
  if (!isNotificationsEnabledForUser(input.clerkUserId)) return;

  const msg =
    input.errorMessage.length > 200
      ? `${input.errorMessage.slice(0, 197)}…`
      : input.errorMessage;

  await upsertOrInsertNotificationWithPushOnFirst({
    clerkUserId: input.clerkUserId,
    tipo: 'error_critico',
    titulo: 'Error al emitir factura',
    mensaje: msg,
    dedupeKey: `error_critico:factura:${input.submissionId}`,
    resetUnreadOnUpsert: true,
    metadata: {
      submission_id: input.submissionId,
      periodo: input.periodo,
      navigate_to: 'documents',
    },
  });
}

/** Sync-on-read: ejecutar antes de listar avisos. */
export async function syncAllNotificationsForUser(clerkUserId: string): Promise<void> {
  if (!isNotificationsEnabledForUser(clerkUserId)) return;

  await Promise.all([
    syncRecordatorioEnvio(clerkUserId),
    sync48hCumplidas(clerkUserId),
    syncAccionCobros(clerkUserId),
  ]);
}
