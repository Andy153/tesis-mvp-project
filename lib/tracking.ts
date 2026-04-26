import { loadHistory, saveHistory } from './history';

function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function nowISODate(): string {
  return new Date().toISOString();
}

function updateTracking(id: string, patch: (prev: any) => any): void {
  const h = loadHistory();
  const files = (h.files || []).map((f: any) => {
    if (f.id !== id) return f;
    const prevTracking = f.tracking ?? { estado: 'borrador' };
    return { ...f, tracking: patch(prevTracking) };
  });
  // authStates en storage están minificados; `saveHistory` los vuelve a minificar y es idempotente.
  saveHistory(files as any, h.authStates as any);
}

export function marcarComoPresentado(id: string, fechaPresentacion?: string): void {
  const fp = fechaPresentacion || nowISODate();
  updateTracking(id, (prev) => {
    const next = { ...prev, estado: 'presentado', fechaPresentacion: fp };
    if (!next.fechaCobroEstimada) next.fechaCobroEstimada = addDaysISO(fp, 60);
    return next;
  });
}

export function marcarComoCobrado(id: string, fechaCobroReal: string, montoCobrado?: number): void {
  updateTracking(id, (prev) => ({
    ...prev,
    estado: 'cobrado',
    fechaCobroReal,
    montoCobrado: montoCobrado ?? prev.montoCobrado,
  }));
}

export function marcarComoRechazado(id: string, motivo: string): void {
  updateTracking(id, (prev) => ({
    ...prev,
    estado: 'rechazado',
    motivoRechazo: motivo,
  }));
}

export function revertirAPresentado(id: string): void {
  updateTracking(id, (prev) => ({
    ...prev,
    estado: 'presentado',
  }));
}

export function actualizarNotas(id: string, notas: string): void {
  updateTracking(id, (prev) => ({
    ...prev,
    notas,
  }));
}

