/** Tipos y helpers puros — seguros para importar en componentes cliente. */

export type CobrosEvolucionPoint = {
  mes: string;
  label: string;
  montoCobrados: number;
  montoPipeline: number;
  countCobrados: number;
  countEnProceso: number;
};

function mesTieneActividad(p: CobrosEvolucionPoint): boolean {
  return (
    p.countCobrados > 0 ||
    p.countEnProceso > 0 ||
    p.montoCobrados > 0 ||
    p.montoPipeline > 0
  );
}

/** Índice del último mes (en la serie ordenada) con cobro o trámite; -1 si no hay ninguno. */
export function lastMesIndexConCobro(points: CobrosEvolucionPoint[]): number {
  let last = -1;
  for (let i = 0; i < points.length; i++) {
    if (mesTieneActividad(points[i]!)) last = i;
  }
  return last;
}

export function normalizeEvolucionPoints(raw: unknown): CobrosEvolucionPoint[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p) => {
      if (!p || typeof p !== 'object') return null;
      const row = p as Record<string, unknown>;
      const mes = String(row.mes ?? '');
      if (!/^\d{4}-\d{2}$/.test(mes)) return null;
      return {
        mes,
        label: String(row.label ?? mes),
        montoCobrados: Number(row.montoCobrados) || 0,
        montoPipeline: Number(row.montoPipeline) || 0,
        countCobrados: Number(row.countCobrados) || 0,
        countEnProceso: Number(row.countEnProceso) || 0,
      };
    })
    .filter((p): p is CobrosEvolucionPoint => p != null);
}
