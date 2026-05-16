/** Formato DD/MM/YYYY para templates AfipSDK. */
export function formatDate(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

/** Convierte YYYYMMDD (o con guiones) a DD/MM/YYYY. */
export function formatCaeDate(yyyymmdd: string): string {
  const digits = yyyymmdd.replace(/\D/g, '');
  if (digits.length !== 8) return yyyymmdd;
  return `${digits.slice(6, 8)}/${digits.slice(4, 6)}/${digits.slice(0, 4)}`;
}
