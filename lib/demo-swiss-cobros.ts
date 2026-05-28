import { supabaseAdmin } from '@/lib/supabase-admin';
import { DEMO_CAE, DEMO_MONTO } from '@/lib/demo-swiss-cobros-shared';

const OBRA_SOCIAL = 'swiss_medical';
const MAIL_TO = 'tesisgrupo2026@gmail.com';
const MAIL_FROM = 'onboarding@resend.dev';

export const DEMO_COMPROBANTE_PATH =
  'user_3EKOXB9Y8W3DFAyIbTGvOOTAJsu_2026-05_comprobante_swiss_medical_demo.pdf';

export const DEMO_COMPROBANTE_BUCKET = 'user_3EKOXB9Y8W3DFAyIbTGvOOTAJsu_2026-05_';

export const DEMO_FACTURA_BUCKET = 'user_3EKOXB9Y8W3DFAyIbTGvOOTAJsu_2026-05_';
export const DEMO_FACTURA_PATH =
  'user_3EKOXB9Y8W3DFAyIbTGvOOTAJsu_2026-05_factura_demo_traza.pdf';

const DEMO_MONTO_NUM = Number(DEMO_MONTO);
const DEMO_NUMERO_COMPROBANTE = 1;
const DEMO_FACTURA_PATH_SUFFIX = '_factura_demo.pdf';

export type DemoWizardSubmission = {
  id: string;
  periodo: string;
  obra_social: string;
  status: string;
  wizard_estado: string | null;
  wizard_paso: number | null;
  enviado_en: string;
  cantidad_partes: number | null;
  monto_total: number | null;
  comprobante_smg_path: string | null;
  factura_path: string | null;
  cae_numero: string | null;
  cae_vencimiento: string | null;
  numero_comprobante: number | null;
  factura_adjuntada_en: string | null;
  wizard_completado_en: string | null;
  partes_incluidos?: unknown;
  anulada_at?: string | null;
};

type WizardPatchInput = {
  wizard_estado: string | null;
  wizard_paso: number | null;
  periodo: string;
};

function demoFacturaPath(userId: string, periodo: string): string {
  return `${userId}/${periodo}${DEMO_FACTURA_PATH_SUFFIX}`;
}

function demoComprobantePath(userId: string, periodo: string): string {
  return `${userId}/${periodo}_comprobante_smg_demo.pdf`;
}

function defaultCaeVencimiento(): string {
  const d = new Date();
  d.setDate(d.getDate() + 10);
  return d.toISOString().slice(0, 10);
}

export async function upsertDemoMonthlySubmission(
  userId: string,
  periodo: string,
): Promise<{ submission_id: string; cantidad_partes: number }> {
  const now = new Date().toISOString();

  const { data: existing, error: existingErr } = await supabaseAdmin
    .from('monthly_submissions')
    .select('id')
    .eq('clerk_user_id', userId)
    .eq('periodo', periodo)
    .eq('obra_social', OBRA_SOCIAL)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingErr) {
    throw new Error(existingErr.message);
  }

  const resetFields = {
    status: 'enviado',
    enviado_en: now,
    cantidad_partes: 1,
    wizard_estado: 'esperando_comprobante',
    wizard_paso: 1,
    wizard_completado_en: null,
    comprobante_smg_path: null,
    factura_path: null,
    cae_numero: null,
    cae_vencimiento: null,
    factura_adjuntada_en: null,
    monto_total: null,
    numero_comprobante: null,
    error_message: null,
    tipo_comprobante: 11,
    updated_at: now,
  };

  if (existing?.id) {
    const { error: updErr } = await supabaseAdmin
      .from('monthly_submissions')
      .update(resetFields)
      .eq('id', existing.id)
      .eq('clerk_user_id', userId);

    if (updErr) throw new Error(updErr.message);
    return { submission_id: existing.id, cantidad_partes: 1 };
  }

  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from('monthly_submissions')
    .insert({
      clerk_user_id: userId,
      obra_social: OBRA_SOCIAL,
      periodo,
      mail_destinatario: MAIL_TO,
      mail_remitente: MAIL_FROM,
      ...resetFields,
    })
    .select('id')
    .single();

  if (insertErr || !inserted) {
    throw new Error(insertErr?.message ?? 'No se pudo crear el envío demo');
  }

  return { submission_id: inserted.id, cantidad_partes: 1 };
}

export async function fetchDemoWizardSubmission(
  submissionId: string,
  userId: string,
): Promise<DemoWizardSubmission | null> {
  const { data, error } = await supabaseAdmin
    .from('monthly_submissions')
    .select(
      `
      id, periodo, obra_social, status,
      wizard_estado, wizard_paso,
      enviado_en, cantidad_partes, monto_total,
      comprobante_smg_path, factura_path,
      cae_numero, cae_vencimiento, numero_comprobante,
      factura_adjuntada_en, wizard_completado_en,
      partes_incluidos, anulada_at
    `,
    )
    .eq('id', submissionId)
    .eq('clerk_user_id', userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as DemoWizardSubmission | null;
}

export function applyDemoWizardPatch(
  sub: DemoWizardSubmission,
  action: string,
  body: Record<string, unknown>,
  userId: string,
): { submission: DemoWizardSubmission; wizard_estado: string | null } | { error: string } {
  const next: DemoWizardSubmission = { ...sub };

  if (action === 'comprobante_disponible') {
    const estadoPrev = sub.wizard_estado;
    const pasoPrev = Number(sub.wizard_paso ?? 1);
    if (estadoPrev === 'comprobante_disponible' && pasoPrev >= 2) {
      next.wizard_paso = 3;
      next.wizard_estado = 'comprobante_disponible';
      next.comprobante_smg_path = demoComprobantePath(userId, sub.periodo);
      next.monto_total = DEMO_MONTO_NUM;
    } else {
      next.wizard_estado = 'comprobante_disponible';
      next.wizard_paso = 2;
    }
  } else if (action === 'subir_comprobante') {
    next.comprobante_smg_path =
      sub.comprobante_smg_path ?? demoComprobantePath(userId, sub.periodo);
    next.monto_total = sub.monto_total ?? DEMO_MONTO_NUM;
    next.wizard_estado = 'comprobante_subido';
    next.wizard_paso = 4;
  } else if (action === 'factura_instrucciones_ok') {
    next.wizard_estado = 'factura_instrucciones';
    next.wizard_paso = 5;
  } else if (action === 'factura_emitida') {
    next.cae_numero = DEMO_CAE;
    next.cae_vencimiento = defaultCaeVencimiento();
    next.numero_comprobante = DEMO_NUMERO_COMPROBANTE;
    next.factura_path = demoFacturaPath(userId, sub.periodo);
    next.wizard_estado = 'factura_instrucciones';
    next.wizard_paso = 5;
  } else if (action === 'adjuntar_factura') {
    const caeNumero = (body.cae_numero as string | null)?.trim();
    const caeVencimiento = (body.cae_vencimiento as string | null)?.trim();
    if (!caeNumero) return { error: 'Falta el número de CAE' };
    if (!caeVencimiento) return { error: 'Falta la fecha de vencimiento del CAE' };
    next.cae_numero = caeNumero;
    next.cae_vencimiento = caeVencimiento;
    next.factura_adjuntada_en = new Date().toISOString();
    next.wizard_estado = 'factura_adjuntada';
    next.wizard_paso = 6;
  } else if (action === 'marcar_aprobado') {
    next.wizard_estado = 'aprobado';
    next.wizard_paso = 6;
    next.wizard_completado_en = new Date().toISOString();
  } else if (action === 'descartar_seguimiento') {
    next.wizard_estado = 'descartado';
    next.wizard_completado_en = new Date().toISOString();
  } else if (action === 'reiniciar_cobro') {
    next.wizard_estado = 'esperando_comprobante';
    next.wizard_paso = 1;
    next.wizard_completado_en = null;
    next.comprobante_smg_path = null;
    next.factura_path = null;
    next.cae_numero = null;
    next.cae_vencimiento = null;
    next.factura_adjuntada_en = null;
    next.monto_total = null;
    next.numero_comprobante = null;
  } else if (action === 'go_back') {
    const nuevoPaso = Math.max(1, (sub.wizard_paso ?? 1) - 1);
    const estadosPorPaso: Record<number, string> = {
      1: 'esperando_comprobante',
      2: 'comprobante_disponible',
      3: 'comprobante_subido',
      4: 'factura_instrucciones',
      5: 'factura_adjuntada',
      6: 'factura_adjuntada',
    };
    next.wizard_paso = nuevoPaso;
    next.wizard_estado = estadosPorPaso[nuevoPaso] ?? 'esperando_comprobante';
  } else {
    return { error: 'Acción no reconocida' };
  }

  return { submission: next, wizard_estado: next.wizard_estado };
}

export function applyDemoWizardException(
  sub: DemoWizardSubmission,
): DemoWizardSubmission {
  return {
    ...sub,
    wizard_estado: 'excepcion_enviada',
    wizard_paso: 6,
  };
}
