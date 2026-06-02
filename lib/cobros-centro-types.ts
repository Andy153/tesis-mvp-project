import type { CobroItem } from '@/lib/dashboard-data';
import type { EstadoCobro } from '@/lib/history';
import { PREPAGAS } from '@/lib/dashboard-data';

export type CobroCentroSource = 'swiss_submission' | 'osde_cirugia';

/** Fila serializable desde GET /api/cobros/centro */
export type CobroCentroItemDTO = {
  id: string;
  source: CobroCentroSource;
  prepaga: 'Swiss Medical' | 'OSDE';
  paciente: string;
  practica: string;
  codigo: string | null;
  plan: string | null;
  tipo: 'Amb' | 'Int';
  monto: number | null;
  montoComprobante: number | null;
  montoFacturado: number | null;
  montoCobrado: number | null;
  esEstimado: boolean;
  motivo: string | null;
  montoHint: string | null;
  estado: EstadoCobro;
  fechaPractica: string | null;
  fechaCobroEstimada: string | null;
  fechaCobroReal: string | null;
  periodo: string;
  wizardEstado: string | null;
  submissionId: string | null;
  cirugiaId: string | null;
};

export type CobroCentroResponse = {
  mes: string;
  items: CobroCentroItemDTO[];
};

function parseIsoDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function cobroCentroDtoToCobroItem(dto: CobroCentroItemDTO): CobroItem {
  const prepagaInfo =
    dto.prepaga === 'OSDE'
      ? PREPAGAS.find((p) => p.id === 'osde')!
      : PREPAGAS.find((p) => p.id === 'swiss')!;

  return {
    id: dto.id,
    paciente: dto.paciente,
    practica: dto.practica,
    codigo: dto.codigo,
    prepaga: dto.prepaga,
    plan: dto.plan,
    tipo: dto.tipo,
    monto: dto.monto,
    esEstimado: dto.esEstimado,
    motivo: dto.motivo ?? undefined,
    desglose: null,
    motivoRechazo: dto.estado === 'rechazado' ? dto.motivo ?? undefined : undefined,
    fechaPractica: parseIsoDate(dto.fechaPractica),
    fechaCobroEstimada: parseIsoDate(dto.fechaCobroEstimada),
    fechaCobroReal: parseIsoDate(dto.fechaCobroReal),
    estado: dto.estado,
    prepagaInfo,
    montoHint: dto.montoHint ?? undefined,
    fuenteDatos: 'wizard',
  };
}
