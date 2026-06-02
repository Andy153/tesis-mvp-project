import type { CobroCentroItemDTO } from '@/lib/cobros-centro-types';
import type { CobrosEvolucionPoint } from '@/lib/cobros-centro-evolucion-shared';
import { cobrosMesKeys, cobrosMesShortLabel } from '@/lib/cobros-mes-opciones';
import { fetchCobrosCentroForUser } from '@/lib/cobros-centro';

export type { CobrosEvolucionPoint } from '@/lib/cobros-centro-evolucion-shared';

function sumMontos(items: CobroCentroItemDTO[]): number {
  return items.reduce((acc, it) => acc + (it.monto ?? 0), 0);
}

function summarizeMes(items: CobroCentroItemDTO[]): Omit<CobrosEvolucionPoint, 'mes' | 'label'> {
  const activos = items.filter((it) => it.estado !== 'rechazado');
  const cobrados = activos.filter((it) => it.estado === 'cobrado');
  const enProceso = activos.filter(
    (it) => it.estado === 'presentado' || it.estado === 'listo_para_presentar',
  );
  return {
    montoCobrados: sumMontos(cobrados),
    montoPipeline: sumMontos(cobrados) + sumMontos(enProceso),
    countCobrados: cobrados.length,
    countEnProceso: enProceso.length,
  };
}

export async function fetchCobrosEvolucionForUser(
  clerkUserId: string,
  mesKeys: string[] = cobrosMesKeys(),
): Promise<CobrosEvolucionPoint[]> {
  const results = await Promise.all(
    mesKeys.map(async (mes) => {
      const items = await fetchCobrosCentroForUser(clerkUserId, mes);
      return { mes, ...summarizeMes(items) };
    }),
  );

  return results.map((r) => ({
    ...r,
    label: cobrosMesShortLabel(r.mes),
  }));
}
