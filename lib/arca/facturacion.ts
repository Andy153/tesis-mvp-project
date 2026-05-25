import { getProfileFiscalFromDB } from '@/lib/profile-db'
import { consultarPadron } from './padron'
import {
  createFacturaSignedUrl,
  facturaStoragePath,
  formatCaeVencimientoForDb,
  persistFacturaEmitidaToSubmission,
  uploadFacturaPdf,
  type ReceptorPersistible,
} from './factura-storage'
import { generarPDFFacturaC } from './pdf-factura'
import {
  buildWsfeContext,
  CBTE_TIPO_FACTURA_C,
  getProximoNumeroComprobante,
  solicitarCaeWSFE,
} from './wsfe-client'

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

export interface EmitirFacturaCParams {
  clerkUserId: string
  submissionId: string
  periodo: string
  monto: number
  receptorCuit?: string
  descripcion?: string
  condicionIVAReceptor?: number
  periodoDesde?: string
  periodoHasta?: string
  receptorRazonSocial?: string
  fchVtoPago?: string
}

function toYYYYMMDD(value: string): string {
  const digits = value.replace(/\D/g, '')
  if (digits.length >= 8) return digits.slice(0, 8)
  return String(todayYYYYMMDD())
}

function todayYYYYMMDD(): number {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return parseInt(`${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`, 10)
}

function roundMonto(monto: number): number {
  return Math.round(monto * 100) / 100
}

/**
 * Resuelve los datos del receptor para una emisión nueva.
 *
 * Reglas:
 *   - Sin CUIT → Consumidor Final, condición IVA 5, CUIT NULL en DB.
 *   - Con CUIT → consulta padrón, usa razón social provista o la del padrón.
 *
 * El campo `cuit` del retorno es `null` si no se emite a un CUIT identificado,
 * lo que se persiste como NULL en DB (semánticamente correcto vs guardar "0").
 */
async function resolverReceptor(
  params: EmitirFacturaCParams,
  ctx: {
    cuitEmisor: string
    certPem: string
    keyPem: string
    ambiente: 'desarrollo' | 'produccion'
  },
): Promise<{
  cuitDigits: string | null
  razonSocial: string
  condicionIVAId: number
}> {
  if (!params.receptorCuit) {
    return {
      cuitDigits: null,
      razonSocial: params.receptorRazonSocial?.trim() || 'Consumidor Final',
      condicionIVAId: 5,
    }
  }

  const cuitDigits = params.receptorCuit.replace(/\D/g, '')

  const padron = await consultarPadron(params.receptorCuit, {
    cuitRepresentada: ctx.cuitEmisor,
    certPem: ctx.certPem,
    keyPem: ctx.keyPem,
    ambiente: ctx.ambiente,
  })

  return {
    cuitDigits,
    razonSocial:
      params.receptorRazonSocial?.trim() || padron.razonSocial || 'Consumidor Final',
    condicionIVAId: padron.condicionIVACodigo,
  }
}

export async function emitirFacturaC(params: EmitirFacturaCParams): Promise<{
  ambiente: 'desarrollo' | 'produccion'
  cae: string
  caeVencimiento: string
  numeroComprobante: number
  fechaEmision: string
  pdfPath: string
  pdfUrl: string
}> {
  const profile = await getProfileFiscalFromDB(params.clerkUserId)

  // --- Fechas y monto ---
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

  // --- Contexto WSFE (cliente SOAP + auth WSAA) ---
  // buildWsfeContext lee certificados y obtiene ticket. También usamos los PEMs
  // localmente para resolverReceptor (consulta padrón), así que los leemos aparte.
  // Lo dejamos así por ahora; si quisiéramos compartir certs, exponer desde wsfe-client.
  const { readUserCertPem, readUserKeyPem } = await import('./profile-certs')
  const certPem = await readUserCertPem(params.clerkUserId)
  const keyPem = await readUserKeyPem(params.clerkUserId)

  const ctx = await buildWsfeContext(params.clerkUserId, {
    cuit: profile.cuit,
    puntoVenta: profile.puntoVenta,
    ambiente: profile.ambiente,
  })

  // --- Receptor: padrón o Consumidor Final ---
  const receptor = await resolverReceptor(params, {
    cuitEmisor: profile.cuit,
    certPem,
    keyPem,
    ambiente: profile.ambiente,
  })

  const docTipo = receptor.cuitDigits ? 80 : 99
  const docNro = receptor.cuitDigits ? parseInt(receptor.cuitDigits, 10) : 0

  // --- Próximo número de Factura C ---
  const nextNumber = await getProximoNumeroComprobante(ctx, CBTE_TIPO_FACTURA_C)

  // --- Solicitar CAE ---
  const feCAEReq = {
    FeCabReq: {
      CantReg: 1,
      PtoVta: profile.puntoVenta,
      CbteTipo: CBTE_TIPO_FACTURA_C,
    },
    FeDetReq: {
      FECAEDetRequest: [
        {
          Concepto: 2,
          DocTipo: docTipo,
          DocNro: docNro,
          CondicionIVAReceptorId: receptor.condicionIVAId,
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

  const { cae, caeVencimiento, numeroComprobante } = await solicitarCaeWSFE(ctx, feCAEReq)

  // --- PDF ---
  const condicionIVALabel =
    CONDICION_IVA_LABELS[receptor.condicionIVAId] ?? `Condición IVA ${receptor.condicionIVAId}`

  const pdfBuffer = await generarPDFFacturaC({
    emisor: {
      razonSocial: profile.razonSocial,
      cuit: profile.cuit,
      condicionIVA: profile.condicionIVA,
      domicilio: profile.domicilioFiscal,
      puntoVenta: profile.puntoVenta,
    },
    receptor: {
      cuit: receptor.cuitDigits || '0',
      razonSocial: receptor.razonSocial,
      condicionIVA: condicionIVALabel,
    },
    factura: {
      numero: numeroComprobante,
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

  const pdfPath = facturaStoragePath(params.clerkUserId, params.periodo)
  await uploadFacturaPdf(pdfPath, pdfBuffer)

  // --- Persistencia (incluye receptor para soportar NC más adelante) ---
  const caeVencimientoDb = formatCaeVencimientoForDb(caeVencimiento)
  const receptorParaDb: ReceptorPersistible = {
    cuit: receptor.cuitDigits,
    razonSocial: receptor.razonSocial,
    condicionIVAId: receptor.condicionIVAId,
  }

  await persistFacturaEmitidaToSubmission({
    submissionId: params.submissionId,
    clerkUserId: params.clerkUserId,
    facturaPath: pdfPath,
    caeNumero: cae,
    caeVencimiento: caeVencimientoDb,
    numeroComprobante: numeroComprobante,
    receptor: receptorParaDb,
  })

  const pdfUrl = await createFacturaSignedUrl(pdfPath)

  return {
    ambiente: profile.ambiente,
    cae,
    caeVencimiento,
    numeroComprobante,
    fechaEmision,
    pdfPath,
    pdfUrl,
  }
}
