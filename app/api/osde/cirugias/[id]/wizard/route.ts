import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { montoFiscalPrincipal } from '@/lib/cobros-montos';
import {
  buildSubmissionMontosFromComprobante,
  buildSubmissionMontosFromCobrado,
  buildSubmissionMontosFromFacturado,
} from '@/lib/osde-cirugias-montos';

const ALLOWED: ReadonlyArray<string> = [
  'wizard_paso',
  'wizard_estado',
  'numero_tramite_apligem',
  'numero_registracion_protocolo',
  'resultado_consulta',
  'monto_extranet',
  'monto_comprobante',
  'monto_facturado',
  'monto_cobrado',
  'nro_tramite_osde',
  'fecha_corte_estimada',
  'factura_emitida_en',
  'comprobante_cargado_en',
  'cobrado_en',
  'tiene_debito',
  'pdf_anexo_id',
  'nro_autorizacion_osde',
  'cod_prestacion',
];

function sanitize(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object') return {};
  const out: Record<string, unknown> = {};
  for (const k of ALLOWED) {
    if (k in (body as Record<string, unknown>)) {
      out[k] = (body as Record<string, unknown>)[k];
    }
  }
  return out;
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await supabase
    .from('osde_cirugias')
    .select('*')
    .eq('id', params.id)
    .eq('clerk_user_id', userId)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'cirugia_no_encontrada' }, { status: 404 });
  return NextResponse.json({ cirugia: data });
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const patch = sanitize(await request.json().catch(() => ({})));
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'empty_patch' }, { status: 400 });
  }

  if (patch.wizard_paso !== undefined && (Number(patch.wizard_paso) < 1 || Number(patch.wizard_paso) > 7)) {
    return NextResponse.json({ error: 'invalid_step' }, { status: 400 });
  }
  if (patch.nro_tramite_osde !== undefined && patch.nro_tramite_osde !== null && !/^\d{10}$/.test(String(patch.nro_tramite_osde))) {
    return NextResponse.json({ error: 'invalid_nro_tramite_osde' }, { status: 400 });
  }
  if (
    patch.monto_extranet !== undefined &&
    (!Number.isFinite(Number(patch.monto_extranet)) || Number(patch.monto_extranet) <= 0)
  ) {
    return NextResponse.json({ error: 'invalid_monto' }, { status: 400 });
  }

  if (patch.monto_facturado !== undefined) {
    const montoFact = Number(patch.monto_facturado);
    if (!Number.isFinite(montoFact) || montoFact <= 0) {
      return NextResponse.json({ error: 'invalid_monto_facturado' }, { status: 400 });
    }
    patch.monto_facturado = montoFact;

    const { data: cirFact, error: factReadErr } = await supabase
      .from('osde_cirugias')
      .select('monthly_submission_id')
      .eq('id', params.id)
      .eq('clerk_user_id', userId)
      .single();

    if (!factReadErr && cirFact?.monthly_submission_id) {
      const { error: subFactErr } = await supabase
        .from('monthly_submissions')
        .update({
          ...buildSubmissionMontosFromFacturado(montoFact),
          updated_at: new Date().toISOString(),
        })
        .eq('id', cirFact.monthly_submission_id)
        .eq('clerk_user_id', userId);
      if (subFactErr) {
        console.error('[OSDE] update_submission_facturado_failed:', subFactErr);
      }
    }
  }

  if (patch.cobrado_en != null && String(patch.cobrado_en).trim() !== '') {
    const { data: cirCobro, error: cobroReadErr } = await supabase
      .from('osde_cirugias')
      .select(
        'monto_facturado, monto_comprobante, monto_extranet, monto_total, monthly_submission_id',
      )
      .eq('id', params.id)
      .eq('clerk_user_id', userId)
      .single();

    if (!cobroReadErr && cirCobro) {
      const montoCobrado = montoFiscalPrincipal(cirCobro);
      if (montoCobrado != null) {
        patch.monto_cobrado = montoCobrado;
        if (cirCobro.monthly_submission_id) {
          const { error: subCobroErr } = await supabase
            .from('monthly_submissions')
            .update({
              ...buildSubmissionMontosFromCobrado(cirCobro),
              updated_at: new Date().toISOString(),
            })
            .eq('id', cirCobro.monthly_submission_id)
            .eq('clerk_user_id', userId);
          if (subCobroErr) {
            console.error('[OSDE] update_submission_cobrado_failed:', subCobroErr);
          }
        }
      }
    }
  }

  const tocaSubmission = patch.monto_extranet !== undefined || patch.nro_tramite_osde !== undefined;

  if (tocaSubmission) {
    const { data: existing, error: readErr } = await supabase
      .from('osde_cirugias')
      .select('id, paciente, document_id, fecha_cirugia, monto_extranet, nro_tramite_osde, monthly_submission_id')
      .eq('id', params.id)
      .eq('clerk_user_id', userId)
      .single();

    if (readErr || !existing) {
      return NextResponse.json({ error: 'cirugia_no_encontrada' }, { status: 404 });
    }

    const finalMonto = (patch.monto_extranet ?? existing.monto_extranet) as number | null;
    const finalTramite = (patch.nro_tramite_osde ?? existing.nro_tramite_osde) as string | null;

    if (finalMonto != null && finalTramite != null) {
      const periodo = (existing.fecha_cirugia ?? new Date().toISOString()).slice(0, 7);
      (patch as Record<string, unknown>).monto_comprobante = finalMonto;

      if (existing.monthly_submission_id) {
        const { error: upErr } = await supabase
          .from('monthly_submissions')
          .update({
            ...buildSubmissionMontosFromComprobante(finalMonto),
            nro_tramite_osde: finalTramite,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.monthly_submission_id)
          .eq('clerk_user_id', userId);

        if (upErr) {
          console.error('[OSDE] update_submission_failed:', upErr);
          return NextResponse.json({ error: 'update_submission_failed: ' + upErr.message }, { status: 500 });
        }
      } else {
        const { data: existingSub } = await supabase
          .from('monthly_submissions')
          .select('id')
          .eq('clerk_user_id', userId)
          .eq('obra_social', 'osde')
          .eq('periodo', periodo)
          .maybeSingle();

        if (existingSub) {
          const { error: upExistErr } = await supabase
            .from('monthly_submissions')
            .update({
              ...buildSubmissionMontosFromComprobante(finalMonto),
              nro_tramite_osde: finalTramite,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingSub.id)
            .eq('clerk_user_id', userId);

          if (upExistErr) {
            console.error('[OSDE] update_existing_submission_failed:', upExistErr);
            return NextResponse.json({ error: 'update_submission_failed: ' + upExistErr.message }, { status: 500 });
          }
          (patch as Record<string, unknown>).monthly_submission_id = existingSub.id;

        } else {
          const { data: sub, error: insErr } = await supabase
            .from('monthly_submissions')
            .insert({
              clerk_user_id: userId,
              obra_social: 'osde',
              periodo,
              tipo_comprobante: 11,
              status: 'enviado',
              cantidad_partes: 1,
              ...buildSubmissionMontosFromComprobante(finalMonto),
              nro_tramite_osde: finalTramite,
              receptor_cuit: '30687313272',
              receptor_razon_social: 'OSDE',
              partes_incluidos: [
                {
                  paciente: existing.paciente,
                  document_id: existing.document_id,
                  fecha_practica: existing.fecha_cirugia,
                  nro_tramite_osde: finalTramite,
                  monto: finalMonto,
                },
              ],
              wizard_estado: 'esperando_comprobante',
            })
            .select('id')
            .single();

          if (insErr) console.error('[OSDE] insert_submission_failed:', insErr);
          if (insErr || !sub) {
            return NextResponse.json(
              { error: 'create_submission_failed: ' + (insErr?.message ?? 'unknown') },
              { status: 500 }
            );
          }
          (patch as Record<string, unknown>).monthly_submission_id = sub.id;
        }
      }
    }
  }

  const { data, error } = await supabase
    .from('osde_cirugias')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .eq('clerk_user_id', userId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cirugia: data });
}
