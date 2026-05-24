import { getTicketAcceso, type ArcaAuthOpts } from './client'
import { readUserCertPem, readUserKeyPem } from './profile-certs'
import { createArcaSoapClient } from './soap-client'

// =============================================================================
// Constantes WSFE
// =============================================================================

export const WSFE_WSDL_HOMO = 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx?WSDL'
export const WSFE_WSDL_PROD = 'https://servicios1.afip.gov.ar/wsfev1/service.asmx?WSDL'

/** Tipos de comprobante ARCA (subset usado por Trazá). */
export const CBTE_TIPO_FACTURA_C = 11
export const CBTE_TIPO_NOTA_CREDITO_C = 13

// =============================================================================
// Tipos
// =============================================================================

/**
 * Contexto WSFE: cliente SOAP listo + auth (ticket WSAA + CUIT emisor).
 * Se construye una vez por emisión y se pasa a las funciones del módulo.
 */
export interface WsfeContext {
  client: Awaited<ReturnType<typeof createArcaSoapClient>>
  auth: {
    Token: string
    Sign: string
    Cuit: number
  }
  ptoVta: number
  ambiente: ArcaAuthOpts['ambiente']
}

/** Perfil fiscal mínimo requerido para emitir comprobantes. */
export interface PerfilFiscalParaWsfe {
  cuit: string
  puntoVenta: number
  ambiente: ArcaAuthOpts['ambiente']
}

/** Resultado de FECAESolicitar normalizado. */
export interface SolicitarCaeResult {
  cae: string
  caeVencimiento: string
  numeroComprobante: number
}

// =============================================================================
// Helpers internos
// =============================================================================

function wsfeWsdl(ambiente: ArcaAuthOpts['ambiente']): string {
  return ambiente === 'produccion' ? WSFE_WSDL_PROD : WSFE_WSDL_HOMO
}

/**
 * Normaliza mensajes de error/observaciones de ARCA a un string legible.
 * ARCA devuelve un objeto único o un array; esta función unifica el formato.
 */
export function formatAfipMessages(items: unknown): string {
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

// =============================================================================
// API pública
// =============================================================================

/**
 * Construye el contexto WSFE necesario para emitir cualquier comprobante.
 *
 * Encapsula: lectura de certificados, obtención de ticket WSAA,
 * y creación del cliente SOAP. Es lo primero que llamás antes de
 * `getProximoNumeroComprobante` o `solicitarCaeWSFE`.
 */
export async function buildWsfeContext(
  clerkUserId: string,
  profile: PerfilFiscalParaWsfe,
): Promise<WsfeContext> {
  const certPem = await readUserCertPem(clerkUserId)
  const keyPem = await readUserKeyPem(clerkUserId)

  const arcaAuth: ArcaAuthOpts = {
    cuit: profile.cuit,
    certPem,
    keyPem,
    ambiente: profile.ambiente,
  }

  const ticket = await getTicketAcceso('wsfe', arcaAuth)
  const cuitEmisor = parseInt(profile.cuit.replace(/\D/g, ''), 10)

  const client = await createArcaSoapClient(wsfeWsdl(profile.ambiente))

  return {
    client,
    auth: {
      Token: ticket.token,
      Sign: ticket.sign,
      Cuit: cuitEmisor,
    },
    ptoVta: profile.puntoVenta,
    ambiente: profile.ambiente,
  }
}

/**
 * Obtiene el próximo número de comprobante para (PtoVta, CbteTipo).
 * Llama a FECompUltimoAutorizado y suma 1.
 *
 * @throws si ARCA devuelve Errors.
 */
export async function getProximoNumeroComprobante(
  ctx: WsfeContext,
  cbteTipo: number,
): Promise<number> {
  const [ultimoRaw] = await ctx.client.FECompUltimoAutorizadoAsync({
    Auth: ctx.auth,
    PtoVta: ctx.ptoVta,
    CbteTipo: cbteTipo,
  })
  console.log(
    `[WSFE] FECompUltimoAutorizado (tipo ${cbteTipo}) response:`,
    JSON.stringify(ultimoRaw, null, 2),
  )

  const ultimoResult = ultimoRaw?.FECompUltimoAutorizadoResult
  if (ultimoResult?.Errors) {
    throw new Error(
      `FECompUltimoAutorizado: ${formatAfipMessages(ultimoResult.Errors.Err)}`,
    )
  }

  const ultimoAutorizado = Number(ultimoResult?.CbteNro ?? 0)
  return ultimoAutorizado + 1
}

/**
 * Solicita CAE para un comprobante ya armado (factura o NC).
 * Maneja todos los caminos de error: Errors top-level, Resultado=R,
 * Observaciones, autorizado sin CAE.
 *
 * @param feCAEReq Request ya construido por el caller (factura o NC).
 * @returns CAE, fecha de vencimiento, y número de comprobante autorizado.
 * @throws Error con mensaje legible si algo falla.
 */
export async function solicitarCaeWSFE(
  ctx: WsfeContext,
  feCAEReq: Record<string, unknown>,
): Promise<SolicitarCaeResult> {
  console.log('[WSFE] FECAERequest:', JSON.stringify(feCAEReq, null, 2))

  const [solicitarRaw] = await ctx.client.FECAESolicitarAsync({
    Auth: ctx.auth,
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
    return {
      cae: String(det.CAE),
      caeVencimiento: String(det.CAEFchVto),
      numeroComprobante: Number(det.CbteDesde),
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
