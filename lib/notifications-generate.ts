import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  biDailyDedupeDateAR,
  currentPeriodoAR,
  dayOfMonthAR,
  isDayOfMonthAR,
  nextMonthNameFromPeriodo,
  nowInArgentina,
  periodoLabel,
  periodoMonthName,
  previousPeriodoAR,
} from '@/lib/dates-ar';
import {
  insertNotificationOnce,
  isNotificationsEnabledForUser,
  upsertNotification,
  upsertOrInsertNotificationWithPushOnFirst,
} from '@/lib/notifications';
import { isDemoUser } from '@/lib/demo-user';
import { getProfileFromDB } from '@/lib/profile-db';
import { isFiscalProfileComplete } from '@/lib/profile-fiscal-ui';
import { userHasArcaCerts } from '@/lib/arca/profile-certs';
import { fetchActiveSubmissions } from '@/lib/active-submissions';
import { filterSubmissionsWithLiveLiquidaciones } from '@/lib/monthlySubmissions';
import type { NotificationTipo } from '@/lib/notifications';

const OBRA_SOCIAL = 'swiss_medical';
const HOURS_24_MS = 24 * 60 * 60 * 1000;
const HOURS_48_MS = 48 * 60 * 60 * 1000;
const WIZARD_TERMINAL_ESTADOS = new Set(['aprobado', 'excepcion_enviada', 'descartado']);

// TODO: quitar logs temporales de sync_debug cuando termine el diagnóstico
function syncDebug(clerkUserId: string, fn: string, detail: Record<string, unknown>) {
  console.log('[TRAZA] notifications:sync_debug', {
    fn,
    clerkUserId,
    now_ar: nowInArgentina().toISOString(),
    ...detail,
  });
}

function logInsertResult(
  clerkUserId: string,
  fn: string,
  tipo: string,
  dedupeKey: string,
  result: { inserted: boolean; blockedBy?: string; errorMessage?: string },
  extra?: Record<string, unknown>,
) {
  syncDebug(clerkUserId, fn, {
    tipo,
    dedupeKey,
    insert: result.inserted ? 'ok' : result.blockedBy ?? 'skipped',
    ...(result.errorMessage ? { dbError: result.errorMessage } : {}),
    ...extra,
  });
}

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

async function hasPlanillaEnviadaSwiss(clerkUserId: string, periodo: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('monthly_submissions')
    .select('id')
    .eq('clerk_user_id', clerkUserId)
    .eq('obra_social', OBRA_SOCIAL)
    .eq('periodo', periodo)
    .eq('status', 'enviado')
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn('[TRAZA] notifications:envio_check_error', error.message);
    return true;
  }
  return Boolean(data);
}

async function maybeInsertRecordatorioEnvio(input: {
  clerkUserId: string;
  fn: string;
  tipo: Extract<
    NotificationTipo,
    'recordatorio_envio_29' | 'recordatorio_envio_5' | 'recordatorio_envio_8'
  >;
  titulo: string;
  mensaje: string;
  dedupeKey: string;
  periodo: string;
}): Promise<void> {
  const planillaEnviada = await hasPlanillaEnviadaSwiss(input.clerkUserId, input.periodo);
  syncDebug(input.clerkUserId, input.fn, {
    periodo: input.periodo,
    planillaEnviada,
    dedupeKey: input.dedupeKey,
    skipReason: planillaEnviada ? 'planilla_ya_enviada' : null,
  });
  if (planillaEnviada) return;

  const result = await insertNotificationOnce({
    clerkUserId: input.clerkUserId,
    tipo: input.tipo,
    titulo: input.titulo,
    mensaje: input.mensaje,
    dedupeKey: input.dedupeKey,
    metadata: {
      periodo: input.periodo,
      navigate_to: 'documents',
    },
  });
  logInsertResult(input.clerkUserId, input.fn, input.tipo, input.dedupeKey, result);
}

export async function syncRecordatorioEnvio(clerkUserId: string): Promise<void> {
  const fn = 'syncRecordatorioEnvio';
  syncDebug(clerkUserId, fn, {
    entered: true,
    dayOfMonthAR: dayOfMonthAR(),
    periodoActual: currentPeriodoAR(),
    isDay29: isDayOfMonthAR(29),
    isDay5: isDayOfMonthAR(5),
    isDay8: isDayOfMonthAR(8),
  });
  if (!isNotificationsEnabledForUser(clerkUserId)) {
    syncDebug(clerkUserId, fn, { skipped: 'demo_or_disabled' });
    return;
  }

  if (isDayOfMonthAR(29)) {
    const periodo = currentPeriodoAR();
    await maybeInsertRecordatorioEnvio({
      clerkUserId,
      fn,
      tipo: 'recordatorio_envio_29',
      titulo: 'Recordá enviar la planilla a Swiss Medical',
      mensaje: `El período de ${periodoLabel(periodo)} está por cerrar. Enviá tu planilla para cobrar a tiempo. Tenés hasta el 8 de ${nextMonthNameFromPeriodo(periodo)}.`,
      dedupeKey: `recordatorio_envio_29:${periodo}`,
      periodo,
    });
  }

  if (isDayOfMonthAR(5)) {
    const periodo = previousPeriodoAR();
    const mes = periodoMonthName(periodo);
    await maybeInsertRecordatorioEnvio({
      clerkUserId,
      fn,
      tipo: 'recordatorio_envio_5',
      titulo: `Todavía no enviaste la planilla de ${mes}`,
      mensaje: `Tenés hasta el 8 para enviar la planilla de ${periodoLabel(periodo)} y cobrar a tiempo.`,
      dedupeKey: `recordatorio_envio_5:${periodo}`,
      periodo,
    });
  }

  if (isDayOfMonthAR(8)) {
    const periodo = previousPeriodoAR();
    const mes = periodoMonthName(periodo);
    await maybeInsertRecordatorioEnvio({
      clerkUserId,
      fn,
      tipo: 'recordatorio_envio_8',
      titulo: `Último día para enviar la planilla de ${mes}`,
      mensaje: `Hoy vence el plazo para enviar la planilla de ${periodoLabel(periodo)} a Swiss Medical y cobrar a tiempo.`,
      dedupeKey: `recordatorio_envio_8:${periodo}`,
      periodo,
    });
  }

  if (!isDayOfMonthAR(29) && !isDayOfMonthAR(5) && !isDayOfMonthAR(8)) {
    syncDebug(clerkUserId, fn, { skipReason: 'no_es_dia_29_5_ni_8' });
  }
}

async function countPartesPendientesRevision(clerkUserId: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from('liquidaciones')
    .select('id', { count: 'exact', head: true })
    .eq('clerk_user_id', clerkUserId)
    .in('estado', ['pendiente', 'vencido'])
    .in('estado_revision', ['bloqueado', 'en_revision']);

  if (error) {
    console.warn('[TRAZA] notifications:partes_revision_count_error', error.message);
    return 0;
  }
  return count ?? 0;
}

/** Cada 2 días si hay liquidaciones bloqueadas o en revisión (motor pre-envío). */
export async function syncPartesConErrores(clerkUserId: string): Promise<void> {
  const fn = 'syncPartesConErrores';
  syncDebug(clerkUserId, fn, { entered: true });
  if (!isNotificationsEnabledForUser(clerkUserId)) {
    syncDebug(clerkUserId, fn, { skipped: 'demo_or_disabled' });
    return;
  }

  const cantidad = await countPartesPendientesRevision(clerkUserId);
  if (cantidad <= 0) {
    syncDebug(clerkUserId, fn, { skipReason: 'sin_partes_pendientes_revision', cantidad });
    return;
  }

  const bucketDate = biDailyDedupeDateAR();
  const dedupeKey = `partes_con_errores:${bucketDate}`;

  const result = await insertNotificationOnce({
    clerkUserId,
    tipo: 'partes_con_errores',
    titulo: 'Tenés partes pendientes de revisión',
    mensaje: `Hay ${cantidad} parte${cantidad === 1 ? '' : 's'} con errores o advertencias. Revisalos antes de enviar la planilla.`,
    dedupeKey,
    metadata: {
      cantidad_pendientes: cantidad,
      navigate_to: 'errors',
      bi_daily_bucket: bucketDate,
    },
  });
  logInsertResult(clerkUserId, fn, 'partes_con_errores', dedupeKey, result, { cantidad, bucketDate });
}

/** Cada 2 días si faltan datos fiscales o certificado ARCA. */
export async function syncPerfilFiscalIncompleto(clerkUserId: string): Promise<void> {
  const fn = 'syncPerfilFiscalIncompleto';
  syncDebug(clerkUserId, fn, { entered: true });
  if (!isNotificationsEnabledForUser(clerkUserId)) {
    syncDebug(clerkUserId, fn, { skipped: 'demo_or_disabled' });
    return;
  }

  const profile = await getProfileFromDB(clerkUserId);
  const fiscalComplete = isFiscalProfileComplete(profile);
  const hasCerts = fiscalComplete ? await userHasArcaCerts(clerkUserId) : false;
  const completo = fiscalComplete && hasCerts;

  if (completo) {
    syncDebug(clerkUserId, fn, {
      skipReason: 'perfil_fiscal_completo',
      fiscalComplete,
      hasCerts,
    });
    return;
  }

  const bucketDate = biDailyDedupeDateAR();
  const dedupeKey = `perfil_fiscal_incompleto:${bucketDate}`;

  const result = await insertNotificationOnce({
    clerkUserId,
    tipo: 'perfil_fiscal_incompleto',
    titulo: 'Completá tus datos de facturación',
    mensaje:
      'Para poder emitir facturas desde Trazá, necesitás tener completos tus datos fiscales y el certificado de ARCA. Revisá tu perfil.',
    dedupeKey,
    metadata: {
      navigate_to: 'profile',
      bi_daily_bucket: bucketDate,
    },
  });
  logInsertResult(clerkUserId, fn, 'perfil_fiscal_incompleto', dedupeKey, result, {
    fiscalComplete,
    hasCerts,
    bucketDate,
  });
}

/** Wizard iniciado (paso 4+) sin actividad en las últimas 24 h. */
export async function syncWizardAbandonado(clerkUserId: string): Promise<void> {
  const fn = 'syncWizardAbandonado';
  syncDebug(clerkUserId, fn, { entered: true });
  if (!isNotificationsEnabledForUser(clerkUserId)) {
    syncDebug(clerkUserId, fn, { skipped: 'demo_or_disabled' });
    return;
  }

  const cutoffMs = Date.now() - HOURS_24_MS;

  const { data, error } = await supabaseAdmin
    .from('monthly_submissions')
    .select(
      'id, periodo, wizard_paso, wizard_estado, updated_at, enviado_en, wizard_completado_en, partes_incluidos',
    )
    .eq('clerk_user_id', clerkUserId)
    .eq('obra_social', OBRA_SOCIAL)
    .eq('status', 'enviado')
    .eq('tipo_comprobante', 11)
    .is('anulada_at', null)
    .gte('wizard_paso', 4)
    .is('wizard_completado_en', null);

  if (error) {
    syncDebug(clerkUserId, fn, { queryError: error.message });
    console.warn('[TRAZA] notifications:wizard_abandonado_query_error', error.message);
    return;
  }

  const stale = (data ?? []).filter((sub) => {
    if (!sub.wizard_estado || WIZARD_TERMINAL_ESTADOS.has(sub.wizard_estado)) return false;
    const lastAt = sub.updated_at ?? sub.enviado_en;
    if (!lastAt) return false;
    return new Date(lastAt).getTime() < cutoffMs;
  });

  syncDebug(clerkUserId, fn, {
    candidatosWizardPaso4Plus: data?.length ?? 0,
    staleSinActividad24h: stale.length,
    submissionIds: stale.map((s) => s.id),
  });

  const subs = await filterSubmissionsWithLiveLiquidaciones(clerkUserId, stale);

  if (subs.length === 0) {
    syncDebug(clerkUserId, fn, { skipReason: 'sin_submissions_abandonadas_vivas' });
    return;
  }

  for (const sub of subs) {
    const dedupeKey = `wizard_abandonado:${sub.id}`;
    const result = await insertNotificationOnce({
      clerkUserId,
      tipo: 'wizard_abandonado',
      titulo: 'Tenés un cobro sin completar',
      mensaje: `Iniciaste el proceso de cobro de ${periodoLabel(sub.periodo)} pero no lo terminaste. Continuá desde donde lo dejaste.`,
      dedupeKey,
      metadata: {
        submission_id: sub.id,
        periodo: sub.periodo,
        wizard_paso: sub.wizard_paso,
        navigate_to: 'documents',
      },
    });
    logInsertResult(clerkUserId, fn, 'wizard_abandonado', dedupeKey, result, {
      submissionId: sub.id,
      wizard_paso: sub.wizard_paso,
    });
  }
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
  syncDebug(clerkUserId, 'syncAllNotificationsForUser', {
    entered: true,
    enabled: isNotificationsEnabledForUser(clerkUserId),
    dayOfMonthAR: dayOfMonthAR(),
    periodoActual: currentPeriodoAR(),
  });

  if (!isNotificationsEnabledForUser(clerkUserId)) {
    syncDebug(clerkUserId, 'syncAllNotificationsForUser', { skipped: 'demo_or_disabled' });
    return;
  }

  const planillaActualEnviada = await hasPlanillaEnviadaSwiss(clerkUserId, currentPeriodoAR());
  syncDebug(clerkUserId, 'syncAllNotificationsForUser', {
    planillaEnviadaPeriodoActual: planillaActualEnviada,
    periodoActual: currentPeriodoAR(),
  });

  syncDebug(clerkUserId, 'syncAllNotificationsForUser', { running: 'syncRecordatorioEnvio' });
  await syncRecordatorioEnvio(clerkUserId);

  syncDebug(clerkUserId, 'syncAllNotificationsForUser', { running: 'syncPartesConErrores' });
  await syncPartesConErrores(clerkUserId);

  syncDebug(clerkUserId, 'syncAllNotificationsForUser', { running: 'syncPerfilFiscalIncompleto' });
  await syncPerfilFiscalIncompleto(clerkUserId);

  syncDebug(clerkUserId, 'syncAllNotificationsForUser', { running: 'syncWizardAbandonado' });
  await syncWizardAbandonado(clerkUserId);

  syncDebug(clerkUserId, 'syncAllNotificationsForUser', { running: 'sync48hCumplidas' });
  await sync48hCumplidas(clerkUserId);

  syncDebug(clerkUserId, 'syncAllNotificationsForUser', { running: 'syncAccionCobros' });
  await syncAccionCobros(clerkUserId);

  syncDebug(clerkUserId, 'syncAllNotificationsForUser', { done: true });
}

/** Cron diario: sync para todos los usuarios con perfil (excluye demo). */
export async function syncAllNotificationsForAllUsers(): Promise<{
  processed: number;
  errors: number;
}> {
  const { data, error } = await supabaseAdmin.from('profiles').select('clerk_user_id');

  if (error) {
    console.warn('[TRAZA] notifications:profiles_list_error', error.message);
    return { processed: 0, errors: 1 };
  }

  let processed = 0;
  let errors = 0;

  for (const row of data ?? []) {
    const clerkUserId = row.clerk_user_id;
    if (!clerkUserId || isDemoUser(clerkUserId)) continue;

    try {
      await syncAllNotificationsForUser(clerkUserId);
      processed += 1;
    } catch (e) {
      errors += 1;
      console.warn('[TRAZA] notifications:sync_user_error', clerkUserId, e);
    }
  }

  return { processed, errors };
}
