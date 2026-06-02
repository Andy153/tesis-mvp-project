import { format } from 'date-fns';
import { es } from 'date-fns/locale';

/** Mayo 2026 + 12 meses (hasta abril 2027). */
export const COBROS_MES_INICIO = { year: 2026, month: 5 }; // 1-based mayo
export const COBROS_MES_CANTIDAD = 12;

export function cobrosMesKeys(): string[] {
  const out: string[] = [];
  for (let i = 0; i < COBROS_MES_CANTIDAD; i++) {
    const d = new Date(COBROS_MES_INICIO.year, COBROS_MES_INICIO.month - 1 + i, 1, 12, 0, 0, 0);
    out.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
    );
  }
  return out;
}

export function cobrosMesesOpciones(): Array<{ key: string; label: string }> {
  return cobrosMesKeys().map((key) => {
    const [y, m] = key.split('-').map(Number);
    const d = new Date(y, m - 1, 1, 12, 0, 0, 0);
    return { key, label: format(d, 'MMMM yyyy', { locale: es }) };
  });
}

export function cobrosMesDefaultKey(): string {
  const now = new Date();
  const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const keys = cobrosMesKeys();
  if (keys.includes(key)) return key;
  return keys[keys.length - 1] ?? keys[0];
}

export function monthFromCobrosKey(key: string): Date {
  const m = String(key || '').match(/^(\d{4})-(\d{2})$/);
  if (!m) return new Date(COBROS_MES_INICIO.year, COBROS_MES_INICIO.month - 1, 1);
  return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, 1, 12, 0, 0, 0);
}

export function cobrosMesShortLabel(key: string): string {
  const d = monthFromCobrosKey(key);
  return format(d, 'MMM yy', { locale: es });
}

export function currentCobrosMesKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** Solo meses ya transcurridos (incluye el mes en curso). */
export function isCobrosMesPasadoOMesActual(mesKey: string): boolean {
  return mesKey <= currentCobrosMesKey();
}
