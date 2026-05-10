// app/api/submissions/[id]/wizard/route.ts
//
// GET: traer el estado actual del wizard para un submission
// PATCH: avanzar el wizard (cambiar estado, subir archivos, etc.)
// POST: mandar mail de excepción

import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { Resend } from 'resend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BUCKET_SUBMISSIONS = 'submissions';
const MAIL_TO = 'tesisgrupo2026@gmail.com';
const MAIL_FROM = 'onboarding@resend.dev';

type WizardEstado =
  | 'esperando_comprobante'
  | 'comprobante_disponible'
  | 'comprobante_subido'
  | 'factura_instrucciones'
  | 'factura_adjuntada'
  | 'aprobado'
  | 'excepcion_enviada';

// ============================================================================
// GET: traer submission con datos del wizard
// ============================================================================
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from('monthly_submissions')
    .select(
      `
      id, periodo, obra_social, status,
      wizard_estado, wizard_paso,
      enviado_en, cantidad_partes, monto_total,
      comprobante_smg_path, factura_path,
      cai_numero, cai_vencimiento,
      factura_adjuntada_en, wizard_completado_en,
      partes_incluidos
    `,
    )
    .eq('id', params.id)
    .eq('clerk_user_id', userId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ submission: data });
}

// ============================================================================
// PATCH: avanzar el wizard
// ============================================================================
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Verificar que el submission pertenece al usuario
  const { data: sub, error: subErr } = await supabaseAdmin
    .from('monthly_submissions')
    .select('id, wizard_estado, periodo, wizard_paso')
    .eq('id', params.id)
    .eq('clerk_user_id', userId)
    .maybeSingle();

  if (subErr) return NextResponse.json({ error: subErr.message }, { status: 500 });
  if (!sub) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    const contentType = req.headers.get('content-type') || '';
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      body = Object.fromEntries(formData.entries()) as Record<string, unknown>;
    } else {
      body = await req.json();
    }
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const action = body.action as string | undefined;
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (action === 'comprobante_disponible') {
    const estadoPrev = sub.wizard_estado as WizardEstado | null;
    const pasoPrev = Number(sub.wizard_paso ?? 1);
    // Paso 1 → 2: primer clic. Paso 2 ("Sí, aparece el comprobante"): mismo action, avanza a paso 3.
    if (estadoPrev === 'comprobante_disponible' && pasoPrev >= 2) {
      update.wizard_paso = 3;
    } else {
      update.wizard_estado = 'comprobante_disponible';
      update.wizard_paso = 2;
    }
  } else if (action === 'subir_comprobante') {
    const file = body.file as File | null;
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'Falta el archivo del comprobante' }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const path = `${userId}/${sub.periodo}_comprobante_smg.pdf`;
    const { error: upErr } = await supabaseAdmin.storage
      .from(BUCKET_SUBMISSIONS)
      .upload(path, buffer, { contentType: 'application/pdf', upsert: true });
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    update.comprobante_smg_path = path;
    update.wizard_estado = 'comprobante_subido';
    update.wizard_paso = 4;
  } else if (action === 'factura_instrucciones_ok') {
    update.wizard_estado = 'factura_instrucciones';
    update.wizard_paso = 5;
  } else if (action === 'adjuntar_factura') {
    const facturaFile = body.factura as File | null;
    const caiNumero = body.cai_numero as string | null;
    const caiVencimiento = body.cai_vencimiento as string | null;

    if (!facturaFile || !(facturaFile instanceof File)) {
      return NextResponse.json({ error: 'Falta el archivo de la factura' }, { status: 400 });
    }
    if (!caiNumero?.trim()) {
      return NextResponse.json({ error: 'Falta el número de CAI' }, { status: 400 });
    }
    if (!caiVencimiento?.trim()) {
      return NextResponse.json({ error: 'Falta la fecha de vencimiento del CAI' }, { status: 400 });
    }

    const buffer = Buffer.from(await facturaFile.arrayBuffer());
    const path = `${userId}/${sub.periodo}_factura.pdf`;
    const { error: upErr } = await supabaseAdmin.storage
      .from(BUCKET_SUBMISSIONS)
      .upload(path, buffer, { contentType: 'application/pdf', upsert: true });
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    update.factura_path = path;
    update.cai_numero = caiNumero.trim();
    update.cai_vencimiento = caiVencimiento.trim();
    update.factura_adjuntada_en = new Date().toISOString();
    update.wizard_estado = 'factura_adjuntada';
    update.wizard_paso = 6;
  } else if (action === 'marcar_aprobado') {
    update.wizard_estado = 'aprobado';
    update.wizard_paso = 6;
    update.wizard_completado_en = new Date().toISOString();
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
    update.wizard_paso = nuevoPaso;
    update.wizard_estado = estadosPorPaso[nuevoPaso] ?? 'esperando_comprobante';
  } else {
    return NextResponse.json({ error: 'Acción no reconocida' }, { status: 400 });
  }

  const { error: updErr } = await supabaseAdmin
    .from('monthly_submissions')
    .update(update)
    .eq('id', params.id)
    .eq('clerk_user_id', userId);

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, wizard_estado: update.wizard_estado });
}

// ============================================================================
// POST: mandar mail de excepción cuando no fue aprobado
// ============================================================================
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: sub, error: subErr } = await supabaseAdmin
    .from('monthly_submissions')
    .select(
      `
      id, periodo, obra_social,
      factura_path, cai_numero, cai_vencimiento,
      cantidad_partes, partes_incluidos
    `,
    )
    .eq('id', params.id)
    .eq('clerk_user_id', userId)
    .maybeSingle();

  if (subErr) return NextResponse.json({ error: subErr.message }, { status: 500 });
  if (!sub) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) return NextResponse.json({ error: 'RESEND_API_KEY no configurado' }, { status: 500 });

  function periodoLabel(p: string): string {
    const [y, m] = p.split('-').map((n: string) => parseInt(n, 10));
    const meses = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre',
      'Noviembre', 'Diciembre',
    ];
    if (!y || !m || m < 1 || m > 12) return p;
    return `${meses[m - 1]} ${y}`;
  }

  const label = periodoLabel(sub.periodo);
  const attachments: { filename: string; content: Buffer }[] = [];

  // Adjuntar la factura si existe
  if (sub.factura_path) {
    const { data: facturaBlob, error: dlErr } = await supabaseAdmin.storage
      .from(BUCKET_SUBMISSIONS)
      .download(sub.factura_path);
    if (!dlErr && facturaBlob) {
      const buf = Buffer.from(await facturaBlob.arrayBuffer());
      attachments.push({ filename: `factura_${sub.periodo}.pdf`, content: buf });
    }
  }

  const resend = new Resend(resendApiKey);
  const sendResult = await resend.emails.send({
    from: MAIL_FROM,
    to: [MAIL_TO],
    replyTo: MAIL_TO,
    subject: `[Trazá] Solicitud de excepción Swiss Medical - ${label}`,
    html: `<!doctype html>
<html><body style="font-family:Arial,sans-serif;color:#1c1c1c;">
  <h2 style="color:#1f5d3a;">Solicitud de excepción — ${label}</h2>
  <p>La liquidación del período <strong>${label}</strong> no fue aprobada por Swiss Medical.</p>
  <p>Adjuntamos la factura correspondiente y solicitamos la revisión del caso.</p>
  <table style="border-collapse:collapse;font-size:14px;margin-top:8px;">
    <tr><td style="padding:6px 12px;border:1px solid #e0e0e0;font-weight:600;">Período</td><td style="padding:6px 12px;border:1px solid #e0e0e0;">${label}</td></tr>
    <tr><td style="padding:6px 12px;border:1px solid #e0e0e0;font-weight:600;">Cantidad de partes</td><td style="padding:6px 12px;border:1px solid #e0e0e0;">${sub.cantidad_partes ?? '—'}</td></tr>
    ${sub.cai_numero ? `<tr><td style="padding:6px 12px;border:1px solid #e0e0e0;font-weight:600;">CAI</td><td style="padding:6px 12px;border:1px solid #e0e0e0;">${sub.cai_numero}</td></tr>` : ''}
    ${sub.cai_vencimiento ? `<tr><td style="padding:6px 12px;border:1px solid #e0e0e0;font-weight:600;">Vencimiento CAI</td><td style="padding:6px 12px;border:1px solid #e0e0e0;">${sub.cai_vencimiento}</td></tr>` : ''}
  </table>
  <p style="color:#666;font-size:12px;margin-top:24px;">Enviado automáticamente por Trazá.</p>
</body></html>`,
    attachments,
  });

  if (sendResult.error) {
    return NextResponse.json({ error: sendResult.error.message }, { status: 500 });
  }

  // Marcar como excepcion_enviada
  await supabaseAdmin
    .from('monthly_submissions')
    .update({
      wizard_estado: 'excepcion_enviada',
      wizard_paso: 6,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.id)
    .eq('clerk_user_id', userId);

  return NextResponse.json({ ok: true, resend_message_id: sendResult.data?.id });
}
