/** Montos del ciclo cobro: comprobante → facturado (ARCA) → cobrado. */

export type MontosCobroRow = {
  monto_comprobante?: number | null;
  monto_facturado?: number | null;
  monto_cobrado?: number | null;
  monto_total?: number | null;
  monto_extranet?: number | null;
};

export function roundMontoCobro(value: number): number {
  return Math.round(value * 100) / 100;
}

function asNumber(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? roundMontoCobro(n) : null;
}

/** Mejor monto fiscal conocido (facturado > comprobante > legacy). */
export function montoFiscalPrincipal(row: MontosCobroRow): number | null {
  return (
    asNumber(row.monto_facturado) ??
    asNumber(row.monto_comprobante) ??
    asNumber(row.monto_extranet) ??
    asNumber(row.monto_total)
  );
}

/** Valor sugerido al abrir emisión ARCA. */
export function montoParaFacturar(row: MontosCobroRow): number {
  return (
    asNumber(row.monto_comprobante) ??
    asNumber(row.monto_extranet) ??
    asNumber(row.monto_total) ??
    0
  );
}

/** Alias legacy: mismo criterio que montoFiscalPrincipal. */
export function legacyMontoTotal(row: MontosCobroRow): number | null {
  return montoFiscalPrincipal(row);
}

export function applyComprobanteMontos(
  update: Record<string, unknown>,
  amount: number,
): void {
  const v = roundMontoCobro(amount);
  update.monto_comprobante = v;
  update.monto_total = v;
}

export function applyFacturadoMontos(
  update: Record<string, unknown>,
  amount: number,
): void {
  const v = roundMontoCobro(amount);
  update.monto_facturado = v;
  update.monto_total = v;
}

export function applyCobradoMontos(
  update: Record<string, unknown>,
  amount: number,
): void {
  const v = roundMontoCobro(amount);
  update.monto_cobrado = v;
}

export function clearMontosCobro(update: Record<string, unknown>): void {
  update.monto_comprobante = null;
  update.monto_facturado = null;
  update.monto_cobrado = null;
  update.monto_total = null;
}
