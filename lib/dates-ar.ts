/** Fecha/hora de referencia en Argentina (UTC-3, sin DST). */

const MESES_AR = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
] as const;

export function nowInArgentina(): Date {
  const utc = new Date();
  return new Date(utc.getTime() - 3 * 60 * 60 * 1000);
}

export function dayOfMonthAR(): number {
  return nowInArgentina().getUTCDate();
}

export function isDayOfMonthAR(day: number): boolean {
  return dayOfMonthAR() === day;
}

/** Hora calendario en Argentina (0–23), coherente con nowInArgentina(). */
export function hourOfDayAR(): number {
  return nowInArgentina().getUTCHours();
}

/** Ventana de envío de engagement tips: 9:00–20:00 hora Argentina. */
export function isEngagementTipSendWindowAR(): boolean {
  const hour = hourOfDayAR();
  return hour >= 9 && hour <= 20;
}

export function currentPeriodoAR(): string {
  const now = nowInArgentina();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/** Período del mes calendario anterior (hora Argentina). */
export function previousPeriodoAR(): string {
  const now = nowInArgentina();
  const firstOfThisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const lastOfPrev = new Date(firstOfThisMonth.getTime() - 24 * 60 * 60 * 1000);
  const y = lastOfPrev.getUTCFullYear();
  const m = String(lastOfPrev.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function periodoLabel(periodo: string): string {
  const [y, m] = periodo.split('-').map((n) => parseInt(n, 10));
  if (!y || !m) return periodo;
  return `${MESES_AR[m - 1]} ${y}`;
}

/** Solo nombre del mes (sin año), p. ej. "Marzo". */
export function periodoMonthName(periodo: string): string {
  const [, m] = periodo.split('-').map((n) => parseInt(n, 10));
  if (!m) return periodo;
  return MESES_AR[m - 1];
}

/** Mes siguiente al período YYYY-MM, solo nombre. */
export function nextMonthNameFromPeriodo(periodo: string): string {
  const [, m] = periodo.split('-').map((n) => parseInt(n, 10));
  if (!m) return periodo;
  const next = m === 12 ? 1 : m + 1;
  return MESES_AR[next - 1];
}

/**
 * Fecha YYYY-MM-DD del inicio del bucket de 2 días (hora Argentina).
 * Días 1–2 → mismo bucket, 3–4 → siguiente, etc. (floor((díaDelAño - 1) / 2)).
 */
export function biDailyDedupeDateAR(): string {
  const now = nowInArgentina();
  const y = now.getUTCFullYear();
  const jan1 = Date.UTC(y, 0, 1);
  const today = Date.UTC(y, now.getUTCMonth(), now.getUTCDate());
  const dayOfYear = Math.floor((today - jan1) / 86_400_000) + 1;
  const bucketStartDay = Math.floor((dayOfYear - 1) / 2) * 2 + 1;
  const bucketDate = new Date(Date.UTC(y, 0, bucketStartDay));
  const mm = String(bucketDate.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(bucketDate.getUTCDate()).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}
