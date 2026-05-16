import { afipClient } from '@/lib/arca/client'
import type { EmitirFacturaCInput, FacturaCResult } from '@/lib/arca/types'
import { formatCaeDate, formatDate } from '@/lib/arca/utils'

export type { EmitirFacturaCInput, FacturaCResult } from '@/lib/arca/types'

const SWISS_MEDICAL_CUIT = 30692317714

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

export async function generarPDFFacturaC(params: {
  nroComprobante: number
  cae: string
  caeFechaVto: string
  importeTotal: number
  periodo: string
  cuitEmisor: number
  razonSocialEmisor: string
}): Promise<{ fileBase64: string; fileName: string } | null> {
  try {
    const [year, month] = params.periodo.split('-')
    const monthPadded = month.padStart(2, '0')
    const lastDay = new Date(Number(year), Number(month), 0).getDate()

    const issueDateFormatted = formatDate(new Date())
    const caeDueDateFormatted = formatCaeDate(params.caeFechaVto)
    const salesPoint = Number(process.env.AFIP_PUNTO_VENTA) || 1
    const billingTo = `${lastDay}/${monthPadded}/${year}`

    const response = (await afipClient.ElectronicBilling.createPDF({
      file_name: `factura_${params.periodo}_${params.nroComprobante}.pdf`,
      template: {
        name: 'invoice-c',
        params: {
          voucher_number: params.nroComprobante,
          sales_point: salesPoint,
          issue_date: issueDateFormatted,
          cae_due_date: caeDueDateFormatted,
          issuer_cuit: params.cuitEmisor,
          cae: Number(String(params.cae).replace(/\D/g, '')),
          issuer_business_name: params.razonSocialEmisor,
          issuer_address: process.env.AFIP_ISSUER_ADDRESS || '-',
          issuer_iva_condition: process.env.AFIP_ISSUER_IVA_CONDITION || 'Responsable Monotributo',
          issuer_gross_income: process.env.AFIP_ISSUER_GROSS_INCOME || '-',
          issuer_activity_start_date: process.env.AFIP_ISSUER_ACTIVITY_START || '01/01/2020',
          receiver_name: 'Swiss Medical S.A.',
          receiver_address: '-',
          receiver_document_type: 80,
          receiver_document_number: SWISS_MEDICAL_CUIT,
          receiver_iva_condition: 'IVA Responsable Inscripto',
          sale_condition: 'Contado',
          currency_id: 'ARS',
          currency_rate: 1,
          concept: 2,
          items: [
            {
              code: '001',
              description: `Servicios médicos período ${params.periodo}`,
              quantity: 1,
              unit_price: params.importeTotal,
              subtotal: params.importeTotal,
            },
          ],
          vat_amount: 0,
          tributes_amount: 0,
          total_amount: params.importeTotal,
          net_amount_taxed: 0,
          net_amount_untaxed: 0,
          exempt_amount: params.importeTotal,
          billing_from: `01/${monthPadded}/${year}`,
          billing_to: billingTo,
          payment_due_date: billingTo,
        },
      },
    })) as { file: string; file_name: string }

    let fileBase64: string
    if (response.file.startsWith('http://') || response.file.startsWith('https://')) {
      const pdfRes = await fetch(response.file)
      if (!pdfRes.ok) {
        throw new Error(`No se pudo descargar el PDF (${pdfRes.status})`)
      }
      fileBase64 = Buffer.from(await pdfRes.arrayBuffer()).toString('base64')
    } else {
      fileBase64 = response.file
    }

    return { fileBase64, fileName: response.file_name }
  } catch (error) {
    console.error('[ARCA] generarPDFFacturaC error:', error)
    return null
  }
}
