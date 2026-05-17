import { createClientAsync } from 'soap'
import { getTicketAcceso } from './client'
import { consultarPadron } from './padron'
import { generarPDFFacturaC } from './pdf-factura'

const WSFE_WSDL_HOMO = 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx?WSDL'
const WSFE_WSDL_PROD = 'https://servicios1.afip.gov.ar/wsfev1/service.asmx?WSDL'
const CBTE_TIPO_FACTURA_C = 11

const CONDICION_IVA_LABELS: Record<number, string> = {
  1: 'IVA Responsable Inscripto',
  4: 'IVA Sujeto Exento',
  5: 'Consumidor Final',
  6: 'Responsable Monotributo',
  7: 'Sujeto no Categorizado',
  8: 'Proveedor del Exterior',
  9: 'Cliente del Exterior',
  10: 'IVA Liberado - Ley 19640',
  13: 'Monotributista Social',
  15: 'IVA No Alcanzado',
  16: 'Monotributo Trabajador Independiente Promovido',
}

function toYYYYMMDD(value: string): string {
  const digits = value.replace(/\D/g, '')
  if (digits.length >= 8) return digits.slice(0, 8)
  return String(todayYYYYMMDD())
}

function wsfeWsdl(): string {
  return process.env.AFIP_AMBIENTE === 'produccion' ? WSFE_WSDL_PROD : WSFE_WSDL_HOMO
}

function afipCuit(): number {
  return parseInt(process.env.AFIP_CUIT || '23452350319', 10)
}

function afipPtoVta(): number {
  return parseInt(process.env.AFIP_PTO_VTA || '10', 10)
}

function todayYYYYMMDD(): number {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return parseInt(`${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`, 10)
}

function formatAfipMessages(items: unknown): string {
  if (!items) return ''
  const list = Array.isArray(items) ? items : [items]
  return list
    .map((item) => {
      if (!item || typeof item !== 'object') return String(item)
      const { Code, Msg } = item as { Code?: number | string; Msg?: string }
      return Code != null ? `${Code}: ${Msg ?? ''}` : String(Msg ?? item)
    })
    .join('; ')
}

function roundMonto(monto: number): number {
  return Math.round(monto * 100) / 100
}

export async function emitirFacturaC(params: {
  monto: number
  receptorCuit?: string
  descripcion?: string
  condicionIVAReceptor?: number
  periodoDesde?: string
  periodoHasta?: string
  receptorRazonSocial?: string
  fchVtoPago?: string
}): Promise<{
  cae: string
  caeVencimiento: string
  numeroComprobante: number
  fechaEmision: string
  pdfBase64: string
}> {
  const cuit = afipCuit()
  const ptoVta = afipPtoVta()
  const cbteFch = todayYYYYMMDD()
  const fechaEmision = String(cbteFch)
  const periodoDesde = params.periodoDesde ? toYYYYMMDD(params.periodoDesde) : fechaEmision
  const periodoHasta = params.periodoHasta ? toYYYYMMDD(params.periodoHasta) : fechaEmision
  const fchServDesde = parseInt(periodoDesde, 10)
  const fchServHasta = parseInt(periodoHasta, 10)
  const fchVtoPagoStr = params.fchVtoPago ? toYYYYMMDD(params.fchVtoPago) : fechaEmision
  const fchVtoPago = parseInt(fchVtoPagoStr, 10)
  if (fchVtoPago < cbteFch) {
    throw new Error('FchVtoPago no puede ser anterior a hoy')
  }
  const monto = roundMonto(params.monto)

  const docTipo = params.receptorCuit ? 80 : 99
  const docNro = params.receptorCuit
    ? parseInt(params.receptorCuit.replace(/\D/g, ''), 10)
    : 0

  let condicionIVAReceptor = 5
  let receptorRazonSocial = params.receptorRazonSocial?.trim() || 'Consumidor Final'

  if (params.receptorCuit) {
    const padron = await consultarPadron(params.receptorCuit)
    condicionIVAReceptor = padron.condicionIVACodigo
    receptorRazonSocial =
      params.receptorRazonSocial?.trim() || padron.razonSocial || 'Consumidor Final'
  }

  const ticket = await getTicketAcceso('wsfe')
  const auth = {
    Token: ticket.token,
    Sign: ticket.sign,
    Cuit: cuit,
  }

  const client = await createClientAsync(wsfeWsdl())

  const [ultimoRaw] = await client.FECompUltimoAutorizadoAsync({
    Auth: auth,
    PtoVta: ptoVta,
    CbteTipo: CBTE_TIPO_FACTURA_C,
  })
  console.log('[WSFE] FECompUltimoAutorizado response:', JSON.stringify(ultimoRaw, null, 2))

  const ultimoResult = ultimoRaw?.FECompUltimoAutorizadoResult
  if (ultimoResult?.Errors) {
    throw new Error(`FECompUltimoAutorizado: ${formatAfipMessages(ultimoResult.Errors.Err)}`)
  }

  const ultimoAutorizado = Number(ultimoResult?.CbteNro ?? 0)
  const nextNumber = ultimoAutorizado + 1

  const feCAEReq = {
    FeCabReq: {
      CantReg: 1,
      PtoVta: ptoVta,
      CbteTipo: CBTE_TIPO_FACTURA_C,
    },
    FeDetReq: {
      FECAEDetRequest: [
        {
          Concepto: 2,
          DocTipo: docTipo,
          DocNro: docNro,
          CondicionIVAReceptorId: condicionIVAReceptor,
          CbteDesde: nextNumber,
          CbteHasta: nextNumber,
          CbteFch: cbteFch,
          ImpTotal: monto,
          ImpTotConc: 0,
          ImpNeto: monto,
          ImpOpEx: 0,
          ImpIVA: 0,
          ImpTrib: 0,
          FchServDesde: fchServDesde,
          FchServHasta: fchServHasta,
          FchVtoPago: fchVtoPago,
          MonId: 'PES',
          MonCotiz: 1,
        },
      ],
    },
  }

  console.log('[WSFE] FECAERequest:', JSON.stringify(feCAEReq, null, 2))

  const [solicitarRaw] = await client.FECAESolicitarAsync({
    Auth: auth,
    FeCAEReq: feCAEReq,
  })
  console.log('[WSFE] FECAESolicitar response:', JSON.stringify(solicitarRaw, null, 2))

  const solicitarResult = solicitarRaw?.FECAESolicitarResult
  if (!solicitarResult) {
    throw new Error('FECAESolicitar: respuesta vacía')
  }

  if (solicitarResult.Errors) {
    throw new Error(`FECAESolicitar: ${formatAfipMessages(solicitarResult.Errors.Err)}`)
  }

  const detRaw = solicitarResult.FeDetResp?.FECAEDetResponse
  const detList = detRaw == null ? [] : Array.isArray(detRaw) ? detRaw : [detRaw]
  const det = detList[0]

  if (!det) {
    throw new Error('FECAESolicitar: sin FECAEDetResponse')
  }

  if (det.Resultado === 'A') {
    if (!det.CAE) {
      throw new Error('FECAESolicitar: autorizado sin CAE')
    }

    const cae = String(det.CAE)
    const caeVencimiento = String(det.CAEFchVto)
    const condicionIVALabel =
      CONDICION_IVA_LABELS[condicionIVAReceptor] ?? `Condición IVA ${condicionIVAReceptor}`

    const pdfBuffer = await generarPDFFacturaC({
      emisor: {
        razonSocial:
          process.env.EMISOR_RAZON_SOCIAL?.trim() ||
          process.env.AFIP_RAZON_SOCIAL?.trim() ||
          'Prestador de Servicios',
        cuit: String(cuit),
        condicionIVA:
          process.env.EMISOR_CONDICION_IVA?.trim() ||
          process.env.AFIP_ISSUER_IVA_CONDITION?.trim() ||
          'Responsable Monotributo',
        domicilio:
          process.env.EMISOR_DOMICILIO?.trim() ||
          process.env.AFIP_ISSUER_ADDRESS?.trim() ||
          'Domicilio comercial',
        puntoVenta: ptoVta,
        ingresosBrutos: process.env.EMISOR_INGRESOS_BRUTOS?.trim() || process.env.AFIP_ISSUER_GROSS_INCOME?.trim(),
        fechaInicioActividades:
          process.env.EMISOR_FECHA_INICIO_ACTIVIDADES?.trim() ||
          process.env.AFIP_ISSUER_ACTIVITY_START?.trim(),
      },
      receptor: {
        cuit: params.receptorCuit?.replace(/\D/g, '') || '0',
        razonSocial: receptorRazonSocial,
        condicionIVA: condicionIVALabel,
      },
      factura: {
        numero: nextNumber,
        fechaEmision,
        periodoDesde,
        periodoHasta,
        descripcion: params.descripcion?.trim() || 'Servicios profesionales',
        monto,
        cae,
        caeVencimiento,
        tipoDocRec: docTipo,
        nroDocRec: docNro,
      },
    })

    return {
      cae,
      caeVencimiento,
      numeroComprobante: nextNumber,
      fechaEmision,
      pdfBase64: pdfBuffer.toString('base64'),
    }
  }

  if (det.Resultado === 'R') {
    const obs = formatAfipMessages(det.Observaciones?.Obs)
    const errs = formatAfipMessages(det.Errors?.Err)
    const parts = [obs, errs].filter(Boolean)
    throw new Error(`FECAESolicitar rechazado: ${parts.join(' | ') || 'sin detalle'}`)
  }

  throw new Error(`FECAESolicitar: resultado inesperado "${String(det.Resultado)}"`)
}
