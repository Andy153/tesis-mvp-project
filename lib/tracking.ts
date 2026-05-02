import type { FileEntry } from './types';

function ensureTracking(item: FileEntry) {
  return item.tracking ?? { estado: 'borrador' as const };
}

export function markAsPresented(item: FileEntry): FileEntry {
  const prev = ensureTracking(item);
  const fechaPresentacion = prev.fechaPresentacion || new Date().toISOString();
  return {
    ...item,
    tracking: {
      ...prev,
      estado: 'presentado',
      fechaPresentacion,
    },
  };
}

export function markAsPaid(item: FileEntry, fechaCobroReal: Date, montoCobrado: number): FileEntry {
  const prev = ensureTracking(item);
  return {
    ...item,
    tracking: {
      ...prev,
      estado: 'cobrado',
      fechaCobroReal: fechaCobroReal.toISOString(),
      montoCobrado,
    },
  };
}

export function markAsRejected(item: FileEntry, motivo?: string): FileEntry {
  const prev = ensureTracking(item);
  return {
    ...item,
    tracking: {
      ...prev,
      estado: 'rechazado',
      motivoRechazo: motivo,
    },
  };
}

