import fs from 'fs'
import path from 'path'
import forge from 'node-forge'
import { createClientAsync } from 'soap'

const WSAA_WSDL_HOMO = 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms?WSDL'
const WSAA_WSDL_PROD = 'https://servicios1.afip.gov.ar/ws/services/LoginCms?WSDL'
const WSAA_CA_URL_HOMO = 'http://www.afip.gov.ar/ws/WSAA/WSAA.CER'

interface TicketAcceso {
  token: string
  sign: string
  expiresAt: Date
}

// Cache en memoria por servicio
const ticketCache: Record<string, TicketAcceso> = {}

function buildTRA(service: string): string {
  const now = new Date()
  const expiration = new Date(now.getTime() + 12 * 60 * 60 * 1000)
  const genTime = now.toISOString().replace(/\.\d{3}Z$/, '-03:00')
  const expTime = expiration.toISOString().replace(/\.\d{3}Z$/, '-03:00')
  const uniqueId = Math.floor(now.getTime() / 1000)
  return `<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
  <header>
    <uniqueId>${uniqueId}</uniqueId>
    <generationTime>${genTime}</generationTime>
    <expirationTime>${expTime}</expirationTime>
  </header>
  <service>${service}</service>
</loginTicketRequest>`
}

function certificateFromFile(filePath: string): forge.pki.Certificate {
  const raw = fs.readFileSync(filePath)
  const text = raw.toString('utf8')
  if (text.includes('-----BEGIN CERTIFICATE-----')) {
    return forge.pki.certificateFromPem(text)
  }
  return forge.pki.certificateFromAsn1(forge.asn1.fromDer(raw.toString('binary')))
}

function getWsaaCaCertPath(): string {
  return path.resolve(process.cwd(), process.env.AFIP_WSAA_CA_PATH || 'certs/wsaa_homo_ca.cer')
}

async function ensureWsaaCaCertificate(isProduction: boolean): Promise<void> {
  const caPath = getWsaaCaCertPath()
  if (fs.existsSync(caPath)) {
    try {
      const ca = certificateFromFile(caPath)
      if (ca.subject?.getField('CN')) {
        return
      }
    } catch {
      // archivo inválido, intentar descargar de nuevo
    }
  }

  if (isProduction) {
    throw new Error(
      `Falta el certificado CA de WSAA en ${caPath}. Configurá AFIP_WSAA_CA_PATH con el .CER de producción.`,
    )
  }

  try {
    const response = await fetch(WSAA_CA_URL_HOMO, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.length < 100 || buffer[0] !== 0x30) {
      throw new Error('respuesta no es un certificado DER')
    }

    fs.mkdirSync(path.dirname(caPath), { recursive: true })
    fs.writeFileSync(caPath, buffer)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(
      `No se pudo obtener WSAA.CER (${detail}). Descargalo manualmente desde ${WSAA_CA_URL_HOMO} y guardalo en ${caPath}`,
    )
  }
}

function signTRA(tra: string): string {
  const certPath = path.resolve(process.cwd(), process.env.AFIP_CERT_PATH || 'certs/traza_homo.crt')
  const keyPath = path.resolve(process.cwd(), process.env.AFIP_KEY_PATH || 'certs/traza_homo.key')
  const caPath = getWsaaCaCertPath()

  const certPem = fs.readFileSync(certPath, 'utf8')
  const keyPem = fs.readFileSync(keyPath, 'utf8')
  const cert = forge.pki.certificateFromPem(certPem)
  const key = forge.pki.privateKeyFromPem(keyPem)
  const caCert = certificateFromFile(caPath)

  const p7 = forge.pkcs7.createSignedData()
  p7.content = forge.util.createBuffer(tra, 'utf8')
  p7.addCertificate(caCert)
  p7.addCertificate(cert)
  p7.addSigner({
    key,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha1,
  })
  p7.sign()
  const der = forge.asn1.toDer(p7.toAsn1())
  return forge.util.encode64(der.getBytes())
}

function parseTicket(xml: string): TicketAcceso {
  const tokenMatch = xml.match(/<token>([\s\S]*?)<\/token>/)
  const signMatch = xml.match(/<sign>([\s\S]*?)<\/sign>/)
  const expMatch = xml.match(/<expirationTime>([\s\S]*?)<\/expirationTime>/)
  if (!tokenMatch || !signMatch) throw new Error('Respuesta WSAA inválida')
  return {
    token: tokenMatch[1].trim(),
    sign: signMatch[1].trim(),
    expiresAt: expMatch ? new Date(expMatch[1].trim()) : new Date(Date.now() + 11 * 60 * 60 * 1000),
  }
}

function extractAfipFault(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null
  const body = (error as { body?: string; data?: string }).body ?? (error as { data?: string }).data
  if (typeof body !== 'string') return null
  const faultMatch = body.match(/<faultstring>([\s\S]*?)<\/faultstring>/)
  const codeMatch = body.match(/<faultcode[^>]*>([\s\S]*?)<\/faultcode>/)
  if (!faultMatch) return null
  const parts = [codeMatch?.[1]?.trim(), faultMatch[1].trim()].filter(Boolean)
  return parts.join(': ')
}

export async function getTicketAcceso(service = 'wsfe'): Promise<TicketAcceso> {
  const cached = ticketCache[service]
  if (cached && cached.expiresAt > new Date(Date.now() + 5 * 60 * 1000)) {
    return cached
  }

  const isProduction = process.env.AFIP_AMBIENTE === 'produccion'
  const wsdl = isProduction ? WSAA_WSDL_PROD : WSAA_WSDL_HOMO

  await ensureWsaaCaCertificate(isProduction)

  const tra = buildTRA(service)
  const cms = signTRA(tra)

  try {
    const client = await createClientAsync(wsdl)
    const [result] = await client.loginCmsAsync({ in0: cms })
    const responseXml = result?.loginCmsReturn ?? result?.return ?? ''
    const ticket = parseTicket(responseXml)
    ticketCache[service] = ticket
    console.log('[WSAA] Ticket obtenido, expira:', ticket.expiresAt)
    return ticket
  } catch (error) {
    const afipFault = extractAfipFault(error)
    if (afipFault) {
      throw new Error(afipFault)
    }
    throw error
  }
}
