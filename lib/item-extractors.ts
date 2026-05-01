import type { FileEntry } from './types';
import { OSDE_PLANES, type PlanOsde, type TipoAtencion } from '@/data/osde-precios';

export type ObraSocial = 'OSDE' | 'Swiss Medical' | 'Desconocida';

function normalizeText(s: string): string {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeObraSocial(raw: string | null | undefined): ObraSocial | null {
  const t = normalizeText(raw || '');
  if (!t) return null;
  if (t.includes('osde')) return 'OSDE';
  if (t.includes('swiss') || t.includes('medical') || t.includes('smg')) return 'Swiss Medical';
  return null;
}

export function getObraSocialFromItem(item: FileEntry): ObraSocial {
  const fromAi = normalizeObraSocial((item as any)?.aiParteExtract?.cobertura?.prepaga);
  if (fromAi) return fromAi;

  const detected = (item as any)?.analysis?.detected?.prepagas as unknown;
  const prepagas = Array.isArray(detected) ? detected : [];
  const normalized = prepagas.map((p) => normalizeObraSocial(p)).filter(Boolean) as ObraSocial[];
  const unique = Array.from(new Set(normalized));

  if (unique.length === 1) return unique[0]!;

  console.warn(
    `[getObraSocialFromItem] Obra social no determinable (matches=${unique.length}).`,
    {
      id: (item as any).id,
      fileName: (item as any).name,
      aiPrepaga: (item as any)?.aiParteExtract?.cobertura?.prepaga ?? null,
      detectedPrepagas: prepagas,
    },
  );
  return 'Desconocida';
}

export function getCodigoFromItem(item: FileEntry): string | null {
  const raw = (item as any)?.aiParteExtract?.procedimiento?.codigo_nomenclador;
  if (raw == null) return null;
  const digits = String(raw).replace(/\D/g, '');
  return digits.length > 0 ? digits : null;
}

export function normalizarPlan(planTexto: string | null | undefined): { plan: PlanOsde; esEstimado: boolean } {
  if (!planTexto) return { plan: OSDE_PLANES[0], esEstimado: true };

  const t = normalizeText(planTexto);
  const tokens = new Set(t.split(' ').filter(Boolean));

  const has = (...xs: string[]) => xs.some((x) => tokens.has(x));

  if (has('210', '6030', 'flux', '260') || t.includes('6 030')) {
    return { plan: OSDE_PLANES[0], esEstimado: false };
  }
  if (has('310', '360')) return { plan: OSDE_PLANES[1], esEstimado: false };
  if (has('410', '430')) return { plan: OSDE_PLANES[2], esEstimado: false };
  if (has('450')) return { plan: OSDE_PLANES[3], esEstimado: false };
  if (has('510')) return { plan: OSDE_PLANES[4], esEstimado: false };

  return { plan: OSDE_PLANES[0], esEstimado: true };
}

export function getPlanFromItem(item: FileEntry): { plan: PlanOsde; esEstimado: boolean } {
  const planTexto = (item as any)?.aiParteExtract?.cobertura?.plan as unknown;
  return normalizarPlan(typeof planTexto === 'string' ? planTexto : planTexto == null ? null : String(planTexto));
}

function hasAnyNonEmptyValue(obj: any): boolean {
  if (!obj || typeof obj !== 'object') return false;
  for (const v of Object.values(obj)) {
    if (v == null) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    if (typeof v === 'number' && Number.isNaN(v)) continue;
    // booleans count as signal only if true (avoids default false flags)
    if (typeof v === 'boolean' && v === false) continue;
    return true;
  }
  return false;
}

export function getTipoFromItem(item: FileEntry): TipoAtencion {
  const eq = (item as any)?.aiParteExtract?.equipo_quirurgico;
  const an = (item as any)?.aiParteExtract?.anestesia;
  const tipo: TipoAtencion = hasAnyNonEmptyValue(eq) || hasAnyNonEmptyValue(an) ? 'Int' : 'Amb';
  console.log(`[getTipoFromItem] tipo=${tipo}`, { id: (item as any).id, fileName: (item as any).name });
  return tipo;
}

function parseDateLoose(raw: string | null | undefined): Date | null {
  const s = String(raw || '').trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const d = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10) - 1;
    let y = parseInt(m[3], 10);
    if (y < 100) y += 2000;
    const out = new Date(y, mo, d);
    return Number.isNaN(out.getTime()) ? null : out;
  }
  const dt = new Date(s);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export function getFechaPracticaFromItem(item: FileEntry): Date | null {
  const aiFecha = (item as any)?.aiParteExtract?.cirugia?.fecha as unknown;
  const d1 = typeof aiFecha === 'string' ? parseDateLoose(aiFecha) : aiFecha == null ? null : parseDateLoose(String(aiFecha));
  if (d1) return d1;

  const detected = (item as any)?.analysis?.detected?.fechas as unknown;
  const fechas = Array.isArray(detected) ? detected : [];
  const d2 = fechas.length ? parseDateLoose(fechas[0]) : null;
  if (d2) return d2;

  const d3 = parseDateLoose((item as any)?.tracking?.fechaPresentacion);
  if (d3) return d3;

  const d4 = parseDateLoose((item as any)?.addedAt);
  return d4;
}

