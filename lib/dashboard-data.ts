import type { HistoryItem } from './history';
import { requiresAuthorization } from './authz';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

export type PrepagaInfo = {
  id: 'swiss' | 'osde' | 'galeno' | 'medicus' | 'omint' | 'medife';
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

function getMontoOriginal(item: HistoryItem): number {
  return item.tracking?.montoOriginal ?? item.tracking?.montoCobrado ?? 0;
}

function getPrepagaInfoFromItem(item: HistoryItem): PrepagaInfo {
  const detected = item.analysis?.detected?.prepagas || [];
  const hasSwiss = detected.some((p) => String(p || '').toLowerCase().includes('swiss'));
  return hasSwiss ? PREPAGAS[0] : PREPAGAS[0];
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
    const est = parseISODate(t.fechaCobroEstimada);
    if (!est || !inMonth(est, month)) continue;
    const prepaga = getPrepagaInfoFromItem(it);

    const ensure = () => {
      const k = prepaga.id;
      if (!byPrepaga.has(k)) byPrepaga.set(k, { prepaga, cantidad: 0, monto: 0 });
      return byPrepaga.get(k)!;
    };

    if (t.estado === 'cobrado') {
      const m = t.montoCobrado ?? getMontoOriginal(it);
      cobrado += m;
      cantidadCobrada += 1;
      const g = ensure();
      g.cantidad += 1;
      g.monto += m;
    } else if (t.estado === 'presentado') {
      const m = getMontoOriginal(it);
      pendiente += m;
      cantidadPendiente += 1;
      const g = ensure();
      g.cantidad += 1;
      g.monto += m;
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
    monto: number;
    prepagaId: string;
  }>;
};

export function getCobrosDelMesPorDia(items: HistoryItem[], mes?: Date): CobroEnCalendario[] {
  const month = mes ? new Date(mes) : new Date();
  const map = new Map<string, CobroEnCalendario>();

  for (const it of items || []) {
    const t = it.tracking;
    if (!t || t.estado !== 'presentado') continue;
    const est = parseISODate(t.fechaCobroEstimada);
    if (!est || !inMonth(est, month)) continue;
    const dayKey = est.toISOString().slice(0, 10); // YYYY-MM-DD
    if (!map.has(dayKey)) map.set(dayKey, { fecha: dayKey, items: [] });
    const entry = map.get(dayKey)!;
    const row = it.exports?.swissCx?.row;
    const prepaga = getPrepagaInfoFromItem(it);
    entry.items.push({
      id: it.id,
      pacienteIniciales: row?.socioDesc || '—',
      tipo: row?.detalle || it.analysis?.detected?.procedureGuess?.desc || 'Intervención',
      monto: getMontoOriginal(it),
      prepagaId: prepaga.id,
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

function parseSwissRowDate(s: string | undefined): Date | null {
  if (!s) return null;
  const m = String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10));
  return Number.isNaN(d.getTime()) ? null : d;
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

  const weight: Record<AtencionItem['tipo'], number> = { error: 0, plazo: 1, autorizacion: 2, warning: 3 };
  out.sort((a, b) => weight[a.tipo] - weight[b.tipo]);

  if (typeof limit === 'number') return out.slice(0, Math.max(0, limit));
  return out;
}

