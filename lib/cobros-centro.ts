import { estimarFechaCobro } from '@/data/cobros-estimaciones';
import type { CobroCentroItemDTO } from '@/lib/cobros-centro-types';
import { montoFiscalPrincipal, type MontosCobroRow } from '@/lib/cobros-montos';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { EstadoCobro } from '@/lib/history';

const OBRA_SWISS = 'swiss_medical';

type ParteIncluido = {
  paciente?: string | null;
  fecha_practica?: string | null;
  liquidacion_id?: string | null;
};

function parseIso(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function addDays(iso: string, days: number): Date | null {
  const base = parseIso(iso);
  if (!base) return null;
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function formatMontoHint(row: MontosCobroRow & { monto_extranet?: number | null }): string | null {
  const parts: string[] = [];
  if (row.monto_comprobante != null) {
    parts.push(`Comprobante: $${row.monto_comprobante.toLocaleString('es-AR')}`);
  }
  if (row.monto_facturado != null) {
    parts.push(`Facturado: $${row.monto_facturado.toLocaleString('es-AR')}`);
  }
  if (row.monto_cobrado != null) {
    parts.push(`Cobrado: $${row.monto_cobrado.toLocaleString('es-AR')}`);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

function swissEstadoFromWizard(wizardEstado: string | null): EstadoCobro {
  if (wizardEstado === 'aprobado') return 'cobrado';
  if (wizardEstado === 'descartado') return 'rechazado';
  return 'presentado';
}

function osdeEstadoFromWizard(row: {
  wizard_estado: string;
  cobrado_en: string | null;
  resultado_consulta: string | null;
}): EstadoCobro {
  if (row.cobrado_en || row.wizard_estado === 'cobrado' || row.wizard_estado === 'completado') {
    return 'cobrado';
  }
  if (row.wizard_estado === 'rechazado' || row.resultado_consulta === 'rechazado') return 'rechazado';
  return 'presentado';
}

function swissPacientePractica(partes: unknown, periodo: string, cantidad: number | null): {
  paciente: string;
  practica: string;
  fechaPractica: string | null;
} {
  const arr = Array.isArray(partes) ? (partes as ParteIncluido[]) : [];
  const n = cantidad ?? arr.length;
  const first = arr.find((p) => p?.paciente?.trim());
  const paciente =
    first?.paciente?.trim() ??
    (n > 1 ? `Planilla ${periodo}` : 'Liquidación Swiss Medical');
  const practica =
    n > 1 ? `Planilla Swiss Medical · ${n} parte${n === 1 ? '' : 's'}` : 'Planilla Swiss Medical';
  const fechaPractica =
    first?.fecha_practica ??
    arr.find((p) => p?.fecha_practica)?.fecha_practica ??
    null;
  return { paciente, practica, fechaPractica };
}

function mapSwissSubmission(
  sub: Record<string, unknown>,
  mes: string,
): CobroCentroItemDTO | null {
  const periodo = String(sub.periodo ?? '');
  if (periodo !== mes) return null;

  const wizardEstado = (sub.wizard_estado as string | null) ?? null;
  if (wizardEstado === 'descartado') return null;

  const montos = sub as MontosCobroRow;
  const monto =
    montos.monto_cobrado ?? montos.monto_facturado ?? montos.monto_comprobante ?? montos.monto_total;
  const montoNum = monto != null ? Number(monto) : null;

  const enviadoEn = String(sub.enviado_en ?? '');
  const { paciente, practica, fechaPractica } = swissPacientePractica(
    sub.partes_incluidos,
    periodo,
    sub.cantidad_partes != null ? Number(sub.cantidad_partes) : null,
  );

  const estado = swissEstadoFromWizard(wizardEstado);
  const fechaPresentacion = enviadoEn || null;
  const fechaCobroEstimada =
    estimarFechaCobro(parseIso(fechaPresentacion) ?? new Date(), 'Swiss Medical') ??
    addDays(enviadoEn, 60);

  const wizardCompletado = sub.wizard_completado_en as string | null;
  const fechaCobroReal =
    estado === 'cobrado' && wizardCompletado ? wizardCompletado : null;

  return {
    id: `swiss:${sub.id}`,
    source: 'swiss_submission',
    prepaga: 'Swiss Medical',
    paciente,
    practica,
    codigo: null,
    plan: null,
    tipo: 'Int',
    monto: montoNum,
    montoComprobante: montos.monto_comprobante != null ? Number(montos.monto_comprobante) : null,
    montoFacturado: montos.monto_facturado != null ? Number(montos.monto_facturado) : null,
    montoCobrado: montos.monto_cobrado != null ? Number(montos.monto_cobrado) : null,
    esEstimado: montoNum == null,
    motivo: montoNum != null ? null : 'Sin monto en wizard',
    montoHint: formatMontoHint(montos),
    estado,
    fechaPractica,
    fechaCobroEstimada: fechaCobroEstimada?.toISOString() ?? null,
    fechaCobroReal,
    periodo,
    wizardEstado,
    submissionId: String(sub.id),
    cirugiaId: null,
  };
}

function mapOsdeCirugia(cir: Record<string, unknown>, mes: string): CobroCentroItemDTO | null {
  const fecha = cir.fecha_cirugia as string | null;
  if (!fecha || !fecha.startsWith(mes)) return null;

  const wizardEstado = String(cir.wizard_estado ?? 'en_curso');
  if (wizardEstado === 'descartado') return null;

  const montos = cir as MontosCobroRow & { monto_extranet?: number | null };
  const montoPrincipal = montoFiscalPrincipal(montos);
  const estado = osdeEstadoFromWizard({
    wizard_estado: wizardEstado,
    cobrado_en: (cir.cobrado_en as string | null) ?? null,
    resultado_consulta: (cir.resultado_consulta as string | null) ?? null,
  });

  const fechaCobroEstimada =
    estimarFechaCobro(parseIso(fecha) ?? new Date(), 'OSDE') ?? addDays(fecha, 60);

  const cobradoEn = (cir.cobrado_en as string | null) ?? null;

  return {
    id: `osde:${cir.id}`,
    source: 'osde_cirugia',
    prepaga: 'OSDE',
    paciente: (cir.paciente as string | null)?.trim() || 'Paciente OSDE',
    practica: 'Cirugía OSDE',
    codigo: null,
    plan: null,
    tipo: 'Int',
    monto: montoPrincipal,
    montoComprobante:
      montos.monto_comprobante != null
        ? Number(montos.monto_comprobante)
        : montos.monto_extranet != null
          ? Number(montos.monto_extranet)
          : null,
    montoFacturado: montos.monto_facturado != null ? Number(montos.monto_facturado) : null,
    montoCobrado: montos.monto_cobrado != null ? Number(montos.monto_cobrado) : null,
    esEstimado: montoPrincipal == null,
    motivo: montoPrincipal != null ? null : 'Sin monto registrado',
    montoHint: formatMontoHint(montos),
    estado,
    fechaPractica: fecha,
    fechaCobroEstimada: fechaCobroEstimada?.toISOString() ?? null,
    fechaCobroReal: cobradoEn,
    periodo: mes,
    wizardEstado,
    submissionId: (cir.monthly_submission_id as string | null) ?? null,
    cirugiaId: String(cir.id),
  };
}

export async function fetchCobrosCentroForUser(
  clerkUserId: string,
  mes: string,
): Promise<CobroCentroItemDTO[]> {
  if (!/^\d{4}-\d{2}$/.test(mes)) return [];

  const { data: subs, error: subErr } = await supabaseAdmin
    .from('monthly_submissions')
    .select(
      `
      id, periodo, obra_social, status, wizard_estado, wizard_paso,
      wizard_completado_en, enviado_en, cantidad_partes, partes_incluidos,
      factura_adjuntada_en,
      monto_comprobante, monto_facturado, monto_cobrado, monto_total
    `,
    )
    .eq('clerk_user_id', clerkUserId)
    .eq('obra_social', OBRA_SWISS)
    .eq('tipo_comprobante', 11)
    .eq('status', 'enviado')
    .is('anulada_at', null)
    .eq('periodo', mes);

  if (subErr) {
    console.warn('[TRAZA] cobros_centro:swiss_error', subErr.message);
  }

  const { data: cirugias, error: cirErr } = await supabaseAdmin
    .from('osde_cirugias')
    .select(
      `
      id, paciente, fecha_cirugia, wizard_estado, wizard_paso,
      resultado_consulta, cobrado_en, monthly_submission_id,
      monto_extranet, monto_comprobante, monto_facturado, monto_cobrado
    `,
    )
    .eq('clerk_user_id', clerkUserId)
    .neq('wizard_estado', 'descartado')
    .gte('fecha_cirugia', `${mes}-01`)
    .lt('fecha_cirugia', nextMonthFirstDay(mes));

  if (cirErr) {
    console.warn('[TRAZA] cobros_centro:osde_error', cirErr.message);
  }

  const items: CobroCentroItemDTO[] = [];

  for (const row of subs ?? []) {
    const mapped = mapSwissSubmission(row as Record<string, unknown>, mes);
    if (mapped) items.push(mapped);
  }

  for (const row of cirugias ?? []) {
    const mapped = mapOsdeCirugia(row as Record<string, unknown>, mes);
    if (mapped) items.push(mapped);
  }

  items.sort((a, b) => {
    const ta = parseIso(b.fechaCobroReal ?? b.fechaCobroEstimada)?.getTime() ?? 0;
    const tb = parseIso(a.fechaCobroReal ?? a.fechaCobroEstimada)?.getTime() ?? 0;
    return ta - tb;
  });

  return items;
}

function nextMonthFirstDay(mes: string): string {
  const [y, m] = mes.split('-').map(Number);
  const d = new Date(y, m, 1);
  return d.toISOString().slice(0, 10);
}
