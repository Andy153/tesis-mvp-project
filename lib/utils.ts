import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const formatCurrency = (n: number) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(n);

export const formatDateLong = (d: Date | string): string => {
  const dt = typeof d === 'string' ? new Date(d) : d;
  if (!(dt instanceof Date) || Number.isNaN(dt.getTime())) return '';
  const s = format(dt, "EEEE d 'de' MMMM", { locale: es });
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
};

export const getSaludo = (nombre: string): string => {
  const h = new Date().getHours();
  const base = h >= 5 && h < 12 ? 'Buen día' : h >= 12 && h < 20 ? 'Buenas tardes' : 'Buenas noches';
  const n = String(nombre || '').trim();
  return n ? `${base}, ${n}` : base;
};
