/**
 * lib/activia/client.ts
 * Cliente SOAP para Activia (middleware de OSDE).
 *
 * APRENDIZAJES CRÍTICOS DEL SANDBOX:
 * 1. <DetalleProcedimientos> va como hijo DIRECTO de <Mensaje>,
 *    NO dentro de <EncabezadoAtencion>. La doc de Activia lo tiene mal.
 *    Si lo anidás adentro, OSDE devuelve error 99 genérico siempre.
 * 2. CodigoPreautorizacion: 6-8 dígitos (sin el prefijo "98 " de la UI de OSDE).
 * 3. GeneradorRespuesta=98 = procesamiento normal. 93 = timeout de Activia.
 * 4. El XML interno va HTML-escapado dentro del SOAP envelope (fileContent).
 */

function htmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function htmlUnescape(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

function pickTag(xml: string, tag: string): string {
  const open = '<' + tag + '>'
  const close = '</' + tag + '>'
  const start = xml.indexOf(open)
  if (start === -1) return ''
  const end = xml.indexOf(close, start)
  if (end === -1) return ''
  return xml.slice(start + open.length, end).trim()
}

function buildEncabezado(tipoTransaccion: string): string {
  const now = new Date()
  const fecha = now.toISOString().slice(0, 10).replace(/-/g, '')
  const hora = now.toISOString().slice(11, 19).replace(/:/g, '')
  const id = `TRAZA${Date.now()}`
  const soft = process.env.ACTIVIA_CODIGO_SOFT ?? '0478'
  const terminal = process.env.ACTIVIA_NUMERO_TERMINAL ?? '60001396'
  const cuit = process.env.ACTIVIA_CUIT_PRESTADOR ?? '20043646274'

  return `<EncabezadoMensaje>
    <VersionMsj>ACT20</VersionMsj>
    <TipoMsj>OL</TipoMsj>
    <TipoTransaccion>${tipoTransaccion}</TipoTransaccion>
    <IdMsj>${id}</IdMsj>
    <InicioTrx>
      <FechaTrx>${fecha}</FechaTrx>
      <HoraTrx>${hora}</HoraTrx>
    </InicioTrx>
    <Terminal>
      <TipoTerminal>PC</TipoTerminal>
      <NumeroTerminal>${terminal}</NumeroTerminal>
    </Terminal>
    <Software>
      <CodigoSoft>${soft}</CodigoSoft>
      <NombreSoftware>Traza</NombreSoftware>
      <VersionSoftware>0.1</VersionSoftware>
    </Software>
    <Financiador>
      <CodigoFinanciador>OSDE</CodigoFinanciador>
    </Financiador>
    <Prestador>
      <CuitPrestador>${cuit}</CuitPrestador>
      <RazonSocial>TRAZA</RazonSocial>
    </Prestador>
  </EncabezadoMensaje>`
}

async function callActivia(xmlInner: string) {
  const url = process.env.ACTIVIA_URL ?? 'https://wsconectadotest.activiaweb.com.ar/WSActiviaC.asmx'
  const envelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ExecuteFileTransactionSL xmlns="http://tempuri.org/">
      <pos>0000</pos>
      <fileContent>${htmlEscape(xmlInner)}</fileContent>
    </ExecuteFileTransactionSL>
  </soap:Body>
</soap:Envelope>`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 40_000)

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: '"http://tempuri.org/ExecuteFileTransactionSL"',
      },
      body: envelope,
      signal: controller.signal,
    })

    const text = await res.text()
    const startTag = '<ExecuteFileTransactionSLResult>'
    const endTag = '</ExecuteFileTransactionSLResult>'
    const s = text.indexOf(startTag)
    const e = text.indexOf(endTag, s)
    if (s === -1) throw new Error('Sin respuesta SOAP válida de Activia')

    const inner = htmlUnescape(text.slice(s + startTag.length, e))

    return {
      codRtaGeneral: pickTag(inner, 'CodRtaGeneral'),
      descripcionRtaGeneral: pickTag(inner, 'DescripcionRtaGeneral'),
      codigoRtaAdicional: pickTag(inner, 'CodigoRtaAdicional'),
      nroReferencia: pickTag(inner, 'NroReferencia') || pickTag(inner, 'SystemTrace'),
      systemTrace: pickTag(inner, 'SystemTrace'),
      nombreBeneficiario: pickTag(inner, 'NombreBeneficiario'),
    }
  } finally {
    clearTimeout(timeout)
  }
}

export interface ActiviaResult {
  success: boolean
  nroReferencia?: string
  nombreBeneficiario?: string
  codRtaGeneral?: string
  codigoRtaAdicional?: string
  descripcion?: string
  error?: string
}

export async function verificarAfiliado01A(numeroCredencial: string): Promise<ActiviaResult> {
  const xml = `<?xml version="1.0" encoding="ISO-8859-1" standalone="yes"?>
<Mensaje>
  ${buildEncabezado('01A')}
  <EncabezadoAtencion>
    <Credencial>
      <NumeroCredencial>${numeroCredencial}</NumeroCredencial>
      <ModoIngreso>M</ModoIngreso>
      <CodigoSeguridad>000</CodigoSeguridad>
    </Credencial>
  </EncabezadoAtencion>
</Mensaje>`
  try {
    const r = await callActivia(xml)
    return {
      success: r.codRtaGeneral === '00',
      nroReferencia: r.nroReferencia,
      nombreBeneficiario: r.nombreBeneficiario,
      codRtaGeneral: r.codRtaGeneral,
      codigoRtaAdicional: r.codigoRtaAdicional,
      descripcion: r.descripcionRtaGeneral,
    }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Error de comunicación' }
  }
}

export async function registrarCirugia02Q(params: {
  numeroCredencial: string
  codigoPreautorizacion: string
  codPrestacion: string
  tipoPrestacion?: number
  arancelPrestacion?: number
}): Promise<ActiviaResult> {
  const xml = `<?xml version="1.0" encoding="ISO-8859-1" standalone="yes"?>
<Mensaje>
  ${buildEncabezado('02Q')}
  <EncabezadoAtencion>
    <Credencial>
      <NumeroCredencial>${params.numeroCredencial}</NumeroCredencial>
      <ModoIngreso>M</ModoIngreso>
      <CodigoSeguridad>000</CodigoSeguridad>
    </Credencial>
    <Preautorizacion>
      <CodigoPreautorizacion>${params.codigoPreautorizacion}</CodigoPreautorizacion>
    </Preautorizacion>
  </EncabezadoAtencion>
  <DetalleProcedimientos>
    <NroItem>1</NroItem>
    <CodPrestacion>${params.codPrestacion}</CodPrestacion>
    <TipoPrestacion>${params.tipoPrestacion ?? 3}</TipoPrestacion>
    <ArancelPrestacion>${params.arancelPrestacion ?? 1}</ArancelPrestacion>
    <CantidadSolicitada>01</CantidadSolicitada>
  </DetalleProcedimientos>
</Mensaje>`
  try {
    const r = await callActivia(xml)
    return {
      success: r.codRtaGeneral === '00',
      nroReferencia: r.nroReferencia,
      nombreBeneficiario: r.nombreBeneficiario,
      codRtaGeneral: r.codRtaGeneral,
      codigoRtaAdicional: r.codigoRtaAdicional,
      descripcion: r.descripcionRtaGeneral,
    }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Error de comunicación' }
  }
}

export async function registrarPrestacion02A(params: {
  numeroCredencial: string
  codPrestacion: string
  tipoPrestacion?: number
  arancelPrestacion?: number
}): Promise<ActiviaResult> {
  const xml = `<?xml version="1.0" encoding="ISO-8859-1" standalone="yes"?>
<Mensaje>
  ${buildEncabezado('02A')}
  <EncabezadoAtencion>
    <Credencial>
      <NumeroCredencial>${params.numeroCredencial}</NumeroCredencial>
      <ModoIngreso>M</ModoIngreso>
      <CodigoSeguridad>000</CodigoSeguridad>
    </Credencial>
  </EncabezadoAtencion>
  <DetalleProcedimientos>
    <NroItem>1</NroItem>
    <CodPrestacion>${params.codPrestacion}</CodPrestacion>
    <TipoPrestacion>${params.tipoPrestacion ?? 1}</TipoPrestacion>
    <ArancelPrestacion>${params.arancelPrestacion ?? 0}</ArancelPrestacion>
    <CantidadSolicitada>01</CantidadSolicitada>
  </DetalleProcedimientos>
</Mensaje>`
  try {
    const r = await callActivia(xml)
    return {
      success: r.codRtaGeneral === '00',
      nroReferencia: r.nroReferencia,
      nombreBeneficiario: r.nombreBeneficiario,
      codRtaGeneral: r.codRtaGeneral,
      codigoRtaAdicional: r.codigoRtaAdicional,
      descripcion: r.descripcionRtaGeneral,
    }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Error de comunicación' }
  }
}

export async function enviarProtocolo02P(params: {
  nroReferencia: string
  pdfBase64: string
  fechaCirugia: string
  credencialAfiliado: string
}): Promise<{ ok: boolean; codigoRta: string; descripcion: string }> {
  const now = new Date()
  const hora = now.toISOString().slice(11, 19).replace(/:/g, '')
  const terminal = process.env.ACTIVIA_NUMERO_TERMINAL ?? '60001396'
  const cuit = process.env.ACTIVIA_CUIT_PRESTADOR ?? '20043646274'

  const xml = `<?xml version="1.0" encoding="ISO-8859-1" standalone="yes"?>
<Mensaje>
  <EncabezadoMensaje>
    <VersionMsj>ACT20</VersionMsj>
    <TipoMsj>OL</TipoMsj>
    <TipoTransaccion>02P</TipoTransaccion>
    <IdMsj></IdMsj>
    <InicioTrx>
      <FechaTrx>${params.fechaCirugia}</FechaTrx>
      <HoraTrx>${hora}</HoraTrx>
    </InicioTrx>
    <Terminal>
      <TipoTerminal>PC</TipoTerminal>
      <NumeroTerminal>${terminal}</NumeroTerminal>
    </Terminal>
    <Financiador>
      <CodigoFinanciador>OSDE</CodigoFinanciador>
    </Financiador>
    <Prestador>
      <CuitPrestador>${cuit}</CuitPrestador>
    </Prestador>
  </EncabezadoMensaje>
  <EncabezadoAtencion>
    <Credencial>
      <NumeroCredencial>${params.credencialAfiliado}</NumeroCredencial>
      <ModoIngreso>M</ModoIngreso>
    </Credencial>
    <Preautorizacion>
      <CodigoPreautorizacion>${params.nroReferencia}</CodigoPreautorizacion>
    </Preautorizacion>
    <Documentacion>
      <Archivo>${params.pdfBase64}</Archivo>
      <NombreArchivo>protocolo.pdf</NombreArchivo>
      <TipoArchivo>P</TipoArchivo>
    </Documentacion>
  </EncabezadoAtencion>
</Mensaje>`

  try {
    const r = await callActivia(xml)
    const codigoRta = r.codRtaGeneral
    const descripcion = r.descripcionRtaGeneral
    return { ok: codigoRta === '00', codigoRta, descripcion }
  } catch (e) {
    return {
      ok: false,
      codigoRta: 'EX',
      descripcion: e instanceof Error ? e.message : 'Error de comunicación',
    }
  }
}
