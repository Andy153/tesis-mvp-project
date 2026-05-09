// lib/checks-period.ts
//
// Helper para reusar la lógica de cálculo de periodo/estado desde otros archivos
// sin tener que exportar todo desde history-db.ts.

export function calcularPeriodoYEstadoExport(
  fechaPracticaISO: string | null,
  ahora: Date = new Date(),
): { periodo: string | null; estado: 'pendiente' | 'vencido' } {
  if (!fechaPracticaISO) {
    return { periodo: null, estado: 'pendiente' }
  }

  const fechaPractica = new Date(fechaPracticaISO + 'T00:00:00')
  if (Number.isNaN(fechaPractica.getTime())) {
    return { periodo: null, estado: 'pendiente' }
  }

  if (fechaPractica.getTime() > ahora.getTime()) {
    return { periodo: null, estado: 'pendiente' }
  }

  const msPorDia = 24 * 60 * 60 * 1000
  const diasTranscurridos = Math.floor(
    (ahora.getTime() - fechaPractica.getTime()) / msPorDia,
  )
  if (diasTranscurridos > 60) {
    return { periodo: null, estado: 'vencido' }
  }

  function cierreDeMes(year: number, month1to12: number): Date {
    return new Date(year, month1to12 - 1, 1, 9, 0, 0, 0)
  }
  function toYYYYMM(year: number, month1to12: number): string {
    return `${year}-${String(month1to12).padStart(2, '0')}`
  }

  const yearOp = fechaPractica.getFullYear()
  const monthOp = fechaPractica.getMonth() + 1
  let cierreYear = monthOp === 12 ? yearOp + 1 : yearOp
  let cierreMonth = monthOp === 12 ? 1 : monthOp + 1
  let cierre = cierreDeMes(cierreYear, cierreMonth)

  while (ahora.getTime() >= cierre.getTime()) {
    cierreMonth = cierreMonth === 12 ? 1 : cierreMonth + 1
    cierreYear = cierreMonth === 1 ? cierreYear + 1 : cierreYear
    cierre = cierreDeMes(cierreYear, cierreMonth)
  }

  return {
    periodo: toYYYYMM(cierreYear, cierreMonth),
    estado: 'pendiente',
  }
}
