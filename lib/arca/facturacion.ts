import { afipClient } from '@/lib/arca/client'

export interface EmitirFacturaCInput {
  cuitReceptor: string
  importeTotal: number
  periodoDesde: string
  periodoHasta: string
}

export interface FacturaCResult {
  exito: boolean
  nroComprobante?: number
  cae?: string
  caeFechaVto?: string
  errores?: string[]
}

function toAfipDate(isoDate: string): number {
  return parseInt(isoDate.replace(/-/g, ''), 10)
}

function formatCaeFechaVto(fecha: string): string {
  return fecha.replace(/-/g, '')
}

export async function emitirFacturaC(input: EmitirFacturaCInput): Promise<FacturaCResult> {
  try {
    const ptoVta = Number(process.env.AFIP_PUNTO_VENTA) || 1
    const cbteTipo = 11

    const lastVoucher = await afipClient.ElectronicBilling.getLastVoucher(ptoVta, cbteTipo)
    const nextVoucherNumber = lastVoucher + 1

    const fechaHoy = parseInt(new Date().toISOString().split('T')[0].replace(/-/g, ''), 10)
    const fechaDesde = toAfipDate(input.periodoDesde)
    const fechaHasta = toAfipDate(input.periodoHasta)

    const data = {
      CantReg: 1,
      PtoVta: ptoVta,
      CbteTipo: cbteTipo,
      Concepto: 2,
      DocTipo: 80,
      DocNro: Number(String(input.cuitReceptor).replace(/\D/g, '')),
      CbteDesde: nextVoucherNumber,
      CbteHasta: nextVoucherNumber,
      CbteFch: fechaHoy,
      ImpTotal: input.importeTotal,
      ImpTotConc: 0,
      ImpNeto: input.importeTotal,
      ImpOpEx: 0,
      ImpIVA: 0,
      ImpTrib: 0,
      FchServDesde: fechaDesde,
      FchServHasta: fechaHasta,
      FchVtoPago: fechaHasta,
      MonId: 'PES',
      MonCotiz: 1,
      CondicionIVAReceptorId: 1,
    }

    const res = await afipClient.ElectronicBilling.createVoucher(data)

    if (!res?.CAE) {
      return { exito: false, errores: ['ARCA no devolvió CAE'] }
    }

    return {
      exito: true,
      nroComprobante: nextVoucherNumber,
      cae: res.CAE,
      caeFechaVto: formatCaeFechaVto(res.CAEFchVto),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { exito: false, errores: [message] }
  }
}
