import type { HistoryItem } from './history';
import { requiresAuthorization } from './authz';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  estimarFechaCobro,
  estimarMontoCobro,
  proximaFechaFacturacion,
} from '@/data/cobros-estimaciones';
import {
  getCodigoFromItem,
  getFechaPracticaFromItem,
  getObraSocialFromItem,
  getPlanFromItem,
  getTipoFromItem,
  type ObraSocial,
} from '@/lib/item-extractors';

export type PrepagaInfo = {
  id: 'swiss' | 'osde' | 'galeno' | 'medicus' | 'omint' | 'medife' | 'unknown';
  nombre: string;
  colorHex: string;
  disponible: boolean;
};

export const PREPAGAS: PrepagaInfo[] = [
  { id: 'swiss', nombre: 'Swiss Medical', colorHex: '#2A6B52', disponible: true },
  { id: 'osde', nombre: 'OSDE', colorHex: '#7C3AED', disponible: false },
  { id: 'galeno', nombre: 'Galeno', colorHex: '#0891B2', disponible: false },
  { id: 'medicus', nombre: 'Medicus', colorHex: '#EA580C', disponible: false },
  { id: 'omint', nombre: 'Omint', colorHex: '#DB2777', disponible: false },
  { id: 'medife', nombre: 'Medifé', colorHex: '#16A34A', disponible: false },
  { id: 'unknown', nombre: 'Desconocida', colorHex: '#64748B', disponible: false },
];

export type ProyeccionMensual = {
  mes: string; // "2025-10"
  cobrado: number;
  pendiente: number;
  total: number;
  cantidadCobrada: number;
  cantidadPendiente: number;
  porPrepaga: Array<{
    prepaga: PrepagaInfo;
    cantidad: number;
    monto: number;
  }>;
};

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function inMonth(d: Date, month: Date): boolean {
  return d.getFullYear() === month.getFullYear() && d.getMonth() === month.getMonth();
}

function parseISODate(s: string | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function prepagaFromObraSocial(obra: ObraSocial): PrepagaInfo {
  if (obra === 'OSDE') return PREPAGAS.find((p) => p.id === 'osde') ?? PREPAGAS[1]!;
  if (obra === 'Swiss Medical') return PREPAGAS.find((p) => p.id === 'swiss') ?? PREPAGAS[0]!;
  return PREPAGAS.find((p) => p.id === 'unknown') ?? PREPAGAS[PREPAGAS.length - 1]!;
}

function calcularCobroRuntime(it: HistoryItem): {
  fechaCobro: Date | null;
  monto: number | null;
  esEstimado: boolean;
  motivo?: string;
  obraSocial: ObraSocial;
  prepaga: PrepagaInfo;
} {
  const obraSocial = getObraSocialFromItem(it);
  const prepaga = prepagaFromObraSocial(obraSocial);

  const t = it.tracking;
  if (t?.estado === 'cobrado' && typeof t.montoCobrado === 'number' && t.fechaCobroReal) {
    const fechaCobro = parseISODate(t.fechaCobroReal);
    return {
      fechaCobro,
      monto: t.montoCobrado,
      esEstimado: false,
      obraSocial,
      prepaga,
    };
  }

  const fechaPractica = getFechaPracticaFromItem(it);
  const codigo = getCodigoFromItem(it);
  const { plan, esEstimado: planEstimado } = getPlanFromItem(it);
  const tipoAtencion = getTipoFromItem(it);

  const fechaFacturacion =
    (t?.fechaPresentacion ? parseISODate(t.fechaPresentacion) : null) ??
    (fechaPractica ? proximaFechaFacturacion(fechaPractica) : null);
  const fechaCobro = fechaFacturacion ? estimarFechaCobro(fechaFacturacion, obraSocial) : null;

  if (!codigo || !fechaPractica) {
    return {
      fechaCobro,
      monto: null,
      esEstimado: true,
      motivo: !codigo ? 'Falta código de práctica' : 'Falta fecha de práctica',
      obraSocial,
      prepaga,
    };
  }

  const montoRes = estimarMontoCobro({
    codigo,
    obraSocial,
    plan,
    tipo: tipoAtencion,
    fechaPractica,
  });

  return {
    fechaCobro,
    monto: montoRes.monto,
    esEstimado: montoRes.esEstimado || planEstimado,
    motivo: montoRes.motivo,
    obraSocial,
    prepaga,
  };
}

export function getProyeccionDelMes(items: HistoryItem[], mes?: Date): ProyeccionMensual {
  const month = mes ? new Date(mes) : new Date();
  const key = monthKey(month);

  let cobrado = 0;
  let pendiente = 0;
  let cantidadCobrada = 0;
  let cantidadPendiente = 0;

  const byPrepaga = new Map<string, { prepaga: PrepagaInfo; cantidad: number; monto: number }>();

  for (const it of items || []) {
    const t = it.tracking;
    if (!t) continue;
    const calc = calcularCobroRuntime(it);
    const est = calc.fechaCobro;
    if (!est || !inMonth(est, month)) continue;
    const prepaga = calc.prepaga;

    const ensure = () => {
      const k = prepaga.id;
      if (!byPrepaga.has(k)) byPrepaga.set(k, { prepaga, cantidad: 0, monto: 0 });
      return byPrepaga.get(k)!;
    };

    if (t.estado === 'cobrado') {
      const m = typeof calc.monto === 'number' ? calc.monto : 0;
      cobrado += m;
      cantidadCobrada += 1;
      const g = ensure();
      g.cantidad += 1;
      g.monto += m;
    } else if (t.estado === 'presentado') {
      if (typeof calc.monto === 'number') {
        pendiente += calc.monto;
        const g = ensure();
        g.cantidad += 1;
        g.monto += calc.monto;
      } else {
        const g = ensure();
        g.cantidad += 1;
      }
      cantidadPendiente += 1;
    }
  }

  const porPrepaga = [...byPrepaga.values()].filter((x) => x.cantidad > 0);

  return {
    mes: key,
    cobrado,
    pendiente,
    total: cobrado + pendiente,
    cantidadCobrada,
    cantidadPendiente,
    porPrepaga,
  };
}

export type CobroEnCalendario = {
  fecha: string; // ISO date
  items: Array<{
    id: string;
    pacienteIniciales: string;
    tipo: string;
    monto: number | null;
    esEstimado: boolean;
    motivo?: string;
    prepagaId: string;
    obraSocial: ObraSocial;
  }>;
};

export function getCobrosDelMesPorDia(items: HistoryItem[], mes?: Date): CobroEnCalendario[] {
  const month = mes ? new Date(mes) : new Date();
  const map = new Map<string, CobroEnCalendario>();

  for (const it of items || []) {
    const t = it.tracking;
    if (!t) continue;
    if (t.estado !== 'presentado' && t.estado !== 'cobrado') continue;

    const calc = calcularCobroRuntime(it);
    const est = calc.fechaCobro;
    if (!est || !inMonth(est, month)) continue;
    const dayKey = est.toISOString().slice(0, 10); // YYYY-MM-DD
    if (!map.has(dayKey)) map.set(dayKey, { fecha: dayKey, items: [] });
    const entry = map.get(dayKey)!;
    const row = it.exports?.swissCx?.row;
    const prepaga = calc.prepaga;
    entry.items.push({
      id: it.id,
      pacienteIniciales: row?.socioDesc || '—',
      tipo: row?.detalle || it.analysis?.detected?.procedureGuess?.desc || 'Intervención',
      monto: calc.monto,
      esEstimado: calc.esEstimado,
      motivo: calc.motivo,
      prepagaId: prepaga.id,
      obraSocial: calc.obraSocial,
    });
  }

  return [...map.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
}

export type AtencionItem = {
  id: string;
  tipo: 'error' | 'warning' | 'autorizacion' | 'plazo';
  titulo: string;
  descripcion: string;
  fechaRelativa: string;
  itemId: string;
};

export type AtencionGrupo = {
  itemId: string;
  fileName: string;
  addedAt: string;
  fechaRelativa: string;
  observaciones: AtencionItem[];
};

function parseSwissRowDate(s: string | undefined): Date | null {
  if (!s) return null;
  const m = String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10));
  return Number.isNaN(d.getTime()) ? null : d;
}

function tipoWeight(tipo: AtencionItem['tipo']): number {
  // menor = más prioritario
  const weight: Record<AtencionItem['tipo'], number> = { error: 0, plazo: 1, autorizacion: 2, warning: 3 };
  return weight[tipo] ?? 99;
}

function groupPriority(g: AtencionGrupo): number {
  let best = 99;
  for (const o of g.observaciones) best = Math.min(best, tipoWeight(o.tipo));
  return best;
}

/**
 * Versión agrupada: devuelve 1 entrada por documento con todas sus observaciones relevantes.
 * Esto evita duplicar tarjetas y permite UI compacta + modal con detalle.
 */
export function getDocumentosQueRequierenAtencionPorDocumento(
  items: HistoryItem[],
  opts?: { maxDocs?: number; maxFindingsPorDoc?: number },
): AtencionGrupo[] {
  const now = new Date();
  const maxDocs = opts?.maxDocs;
  const maxFindingsPorDoc = opts?.maxFindingsPorDoc ?? 8;

  const out: AtencionGrupo[] = [];

  for (const it of items || []) {
    const observaciones: AtencionItem[] = [];
    const findings = it.analysis?.findings || [];

    const severas = findings.filter((f) => f.severity === 'error' || f.severity === 'warn').slice(0, Math.max(0, maxFindingsPorDoc));
    for (const f of severas) {
      observaciones.push({
        id: `att_${it.id}_${f.severity}_${f.code}`,
        tipo: f.severity === 'error' ? 'error' : 'warning',
        titulo: f.title,
        descripcion: f.action || f.suggestion?.desc || f.body,
        fechaRelativa: formatDistanceToNow(new Date(it.addedAt), { locale: es, addSuffix: true }),
        itemId: it.id,
      });
    }

    // Authorization: infer "bono cargado" if planilla has permisoUrl.
    const auth = requiresAuthorization(it.analysis);
    const permisoUrl = it.exports?.swissCx?.files?.permisoUrl;
    if (auth.required && !permisoUrl) {
      observaciones.push({
        id: `att_${it.id}_auth`,
        tipo: 'autorizacion',
        titulo: 'Falta autorización previa',
        descripcion: 'Cargá el bono para evitar rechazos.',
        fechaRelativa: formatDistanceToNow(new Date(it.addedAt), { locale: es, addSuffix: true }),
        itemId: it.id,
      });
    }

    // Plazo: fecha de práctica + 60 días, sin presentación.
    const pract = parseSwissRowDate(it.exports?.swissCx?.row?.fecha);
    const presented = Boolean(it.tracking?.fechaPresentacion);
    if (pract && !presented) {
      const daysSince = Math.floor((now.getTime() - pract.getTime()) / 86400000);
      const left = 60 - daysSince;
      if (left <= 10 && left > 0) {
        observaciones.push({
          id: `att_${it.id}_plazo`,
          tipo: 'plazo',
          titulo: 'Plazo próximo a vencer',
          descripcion: `Quedan ${left} días para presentar antes del límite de 60.`,
          fechaRelativa: formatDistanceToNow(pract, { locale: es, addSuffix: true }),
          itemId: it.id,
        });
      }
    }

    if (observaciones.length === 0) continue;

    observaciones.sort((a, b) => tipoWeight(a.tipo) - tipoWeight(b.tipo));

    out.push({
      itemId: it.id,
      fileName: it.name,
      addedAt: it.addedAt,
      fechaRelativa: formatDistanceToNow(new Date(it.addedAt), { locale: es, addSuffix: true }),
      observaciones,
    });
  }

  out.sort((a, b) => groupPriority(a) - groupPriority(b));

  if (typeof maxDocs === 'number') return out.slice(0, Math.max(0, maxDocs));
  return out;
}

export function getDocumentosQueRequierenAtencion(items: HistoryItem[], limit?: number): AtencionItem[] {
  const out: AtencionItem[] = [];
  const now = new Date();

  for (const it of items || []) {
    const findings = it.analysis?.findings || [];
    const firstErr = findings.find((f) => f.severity === 'error');
    if (firstErr) {
      out.push({
        id: `att_${it.id}_err`,
        tipo: 'error',
        titulo: firstErr.title,
        descripcion: firstErr.action || firstErr.suggestion?.desc || firstErr.body,
        fechaRelativa: formatDistanceToNow(new Date(it.addedAt), { locale: es, addSuffix: true }),
        itemId: it.id,
      });
      continue;
    }

    const firstWarn = findings.find((f) => f.severity === 'warn');
    if (firstWarn) {
      out.push({
        id: `att_${it.id}_warn`,
        tipo: 'warning',
        titulo: firstWarn.title,
        descripcion: firstWarn.action || firstWarn.suggestion?.desc || firstWarn.body,
        fechaRelativa: formatDistanceToNow(new Date(it.addedAt), { locale: es, addSuffix: true }),
        itemId: it.id,
      });
    }

    // Authorization: infer "bono cargado" if planilla has permisoUrl.
    const auth = requiresAuthorization(it.analysis);
    const permisoUrl = it.exports?.swissCx?.files?.permisoUrl;
    if (auth.required && !permisoUrl) {
      out.push({
        id: `att_${it.id}_auth`,
        tipo: 'autorizacion',
        titulo: 'Falta autorización previa',
        descripcion: 'Cargá el bono para evitar rechazos.',
        fechaRelativa: formatDistanceToNow(new Date(it.addedAt), { locale: es, addSuffix: true }),
        itemId: it.id,
      });
    }

    // Plazo: fecha de práctica + 60 días, sin presentación.
    const pract = parseSwissRowDate(it.exports?.swissCx?.row?.fecha);
    const presented = Boolean(it.tracking?.fechaPresentacion);
    if (pract && !presented) {
      const daysSince = Math.floor((now.getTime() - pract.getTime()) / 86400000);
      const left = 60 - daysSince;
      if (left <= 10 && left > 0) {
        out.push({
          id: `att_${it.id}_plazo`,
          tipo: 'plazo',
          titulo: 'Plazo próximo a vencer',
          descripcion: `Quedan ${left} días para presentar antes del límite de 60.`,
          fechaRelativa: formatDistanceToNow(pract, { locale: es, addSuffix: true }),
          itemId: it.id,
        });
      }
    }
  }

  out.sort((a, b) => tipoWeight(a.tipo) - tipoWeight(b.tipo));

  if (typeof limit === 'number') return out.slice(0, Math.max(0, limit));
  return out;
}

