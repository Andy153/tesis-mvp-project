import type { CobroItem } from '@/lib/dashboard-data';

export type CobrosCentroKpi = {
  cobrados: { count: number; monto: number };
  porCobrar: { count: number; monto: number };
  enProceso: { count: number; monto: number };
  porPrepaga: Array<{
    prepaga: CobroItem['prepaga'];
    count: number;
    montoCobrado: number;
    montoPipeline: number;
  }>;
  realizados: CobroItem[];
  proximos: CobroItem[];
};

function sumMontos(items: CobroItem[]): number {
  return items.reduce((acc, it) => acc + (it.monto ?? 0), 0);
}

function isEnProceso(it: CobroItem): boolean {
  return it.estado === 'presentado' || it.estado === 'listo_para_presentar';
}

/** KPIs del mes: excluye rechazados. Por cobrar = cobrado + en proceso. */
export function buildCobrosCentroKpi(items: CobroItem[]): CobrosCentroKpi {
  const activos = items.filter((it) => it.estado !== 'rechazado');
  const realizados = activos.filter((it) => it.estado === 'cobrado');
  const proximos = activos.filter(isEnProceso);

  const montoCobrados = sumMontos(realizados);
  const montoProceso = sumMontos(proximos);
  const montoPipeline = montoCobrados + montoProceso;

  const prepagas = new Map<CobroItem['prepaga'], CobroItem[]>();
  for (const it of activos) {
    const list = prepagas.get(it.prepaga) ?? [];
    list.push(it);
    prepagas.set(it.prepaga, list);
  }

  const porPrepaga = [...prepagas.entries()]
    .map(([prepaga, list]) => {
      const cob = list.filter((it) => it.estado === 'cobrado');
      const proc = list.filter(isEnProceso);
      return {
        prepaga,
        count: list.length,
        montoCobrado: sumMontos(cob),
        montoPipeline: sumMontos(cob) + sumMontos(proc),
      };
    })
    .sort((a, b) => b.montoPipeline - a.montoPipeline);

  return {
    cobrados: { count: realizados.length, monto: montoCobrados },
    porCobrar: { count: activos.length, monto: montoPipeline },
    enProceso: { count: proximos.length, monto: montoProceso },
    porPrepaga,
    realizados: [...realizados].sort(
      (a, b) => (b.fechaCobroReal?.getTime() ?? 0) - (a.fechaCobroReal?.getTime() ?? 0),
    ),
    proximos: [...proximos].sort(
      (a, b) => (a.fechaCobroEstimada?.getTime() ?? 0) - (b.fechaCobroEstimada?.getTime() ?? 0),
    ),
  };
}
