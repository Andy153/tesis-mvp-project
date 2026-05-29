/** Fecha/hora de referencia en Argentina (UTC-3, sin DST). */

export function nowInArgentina(): Date {
  const utc = new Date();
  return new Date(utc.getTime() - 3 * 60 * 60 * 1000);
}

export function currentPeriodoAR(): string {
  const now = nowInArgentina();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/** Últimos 5 días del mes calendario (inclusive). */
export function isLastFiveDaysOfMonthAR(): boolean {
  const now = nowInArgentina();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const day = now.getUTCDate();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return day >= lastDay - 4;
}

export function periodoLabel(periodo: string): string {
  const [y, m] = periodo.split('-').map((n) => parseInt(n, 10));
  const meses = [
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
  ];
  if (!y || !m) return periodo;
  return `${meses[m - 1]} ${y}`;
}
