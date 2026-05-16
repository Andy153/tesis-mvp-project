import fs from 'fs'
import path from 'path'
import forge from 'node-forge'
import { createClientAsync } from 'soap'

const WSAA_WSDL_HOMO = 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms?WSDL'
const WSAA_WSDL_PROD = 'https://servicios1.afip.gov.ar/ws/services/LoginCms?WSDL'
const TA_CACHE_PATH = path.resolve(process.cwd(), 'certs', '.ta_cache.json')
const TA_CACHE_MARGIN_MS = 2 * 60 * 1000

interface TicketAcceso {
  token: string
  sign: string
  expiresAt: Date
}

interface TicketAccesoSerialized {
  token: string
  sign: string
  expiresAt: string
}

type TaCacheFile = Record<string, TicketAccesoSerialized>

// Cache en memoria por servicio (mismo proceso / mismo módulo)
const ticketCache: Record<string, TicketAcceso> = {}

function isTicketValid(ticket: TicketAcceso): boolean {
  return ticket.expiresAt > new Date(Date.now() + TA_CACHE_MARGIN_MS)
}

function serializeTicket(ticket: TicketAcceso): TicketAccesoSerialized {
  return {
    token: ticket.token,
    sign: ticket.sign,
    expiresAt: ticket.expiresAt.toISOString(),
  }
}

function deserializeTicket(raw: TicketAccesoSerialized): TicketAcceso | null {
  if (!raw?.token || !raw?.sign || !raw?.expiresAt) return null
  const expiresAt = new Date(raw.expiresAt)
  if (Number.isNaN(expiresAt.getTime())) return null
  return { token: raw.token, sign: raw.sign, expiresAt }
}

function readTaCacheFromDisk(): TaCacheFile | null {
  try {
    if (!fs.existsSync(TA_CACHE_PATH)) return null
    const content = fs.readFileSync(TA_CACHE_PATH, 'utf8')
    const parsed = JSON.parse(content) as TaCacheFile
    if (!parsed || typeof parsed !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

function readTaFromDisk(service: string): { ticket: TicketAcceso | null; expired: boolean } {
  const cache = readTaCacheFromDisk()
  const entry = cache?.[service]
  if (!entry) return { ticket: null, expired: false }

  const ticket = deserializeTicket(entry)
  if (!ticket) return { ticket: null, expired: false }

  if (isTicketValid(ticket)) return { ticket, expired: false }
  return { ticket: null, expired: true }
}

function writeTaToDisk(service: string, ticket: TicketAcceso): void {
  try {
    const cache = readTaCacheFromDisk() ?? {}
    cache[service] = serializeTicket(ticket)
    fs.mkdirSync(path.dirname(TA_CACHE_PATH), { recursive: true })
    fs.writeFileSync(TA_CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8')
  } catch {
    // archivo inexistente, corrupto o sin permisos: ignorar
  }
}

function formatArcaDate(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  const year = d.getFullYear()
  const month = pad(d.getMonth() + 1)
  const day = pad(d.getDate())
  const hours = pad(d.getHours())
  const minutes = pad(d.getMinutes())
  const seconds = pad(d.getSeconds())
  const offsetMinutes = -d.getTimezoneOffset()
  const offsetSign = offsetMinutes >= 0 ? '+' : '-'
  const offsetH = pad(Math.floor(Math.abs(offsetMinutes) / 60))
  const offsetM = pad(Math.abs(offsetMinutes) % 60)
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${offsetSign}${offsetH}:${offsetM}`
}

function buildTRA(service: string): string {
  const now = Date.now()
  const generationTime = formatArcaDate(now - 5 * 60 * 1000)
  const expirationTime = formatArcaDate(now + 10 * 60 * 1000)
  const uniqueId = Math.floor(now / 1000)
  return `<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
  <header>
    <uniqueId>${uniqueId}</uniqueId>
    <generationTime>${generationTime}</generationTime>
    <expirationTime>${expirationTime}</expirationTime>
  </header>
  <service>${service}</service>
</loginTicketRequest>`
}

function signTRA(tra: string): string {
  const certPath = path.resolve(process.cwd(), process.env.AFIP_CERT_PATH || 'certs/traza_homo.crt')
  const keyPath = path.resolve(process.cwd(), process.env.AFIP_KEY_PATH || 'certs/traza_homo.key')

  const certPem = fs.readFileSync(certPath, 'utf8')
  const keyPem = fs.readFileSync(keyPath, 'utf8')
  const cert = forge.pki.certificateFromPem(certPem)
  const key = forge.pki.privateKeyFromPem(keyPem)

  const p7 = forge.pkcs7.createSignedData()
  p7.content = forge.util.createBuffer(tra, 'utf8')
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
  if (cached && isTicketValid(cached)) {
    return cached
  }

  const { ticket: diskTicket, expired: diskExpired } = readTaFromDisk(service)
  if (diskTicket) {
    console.log('[WSAA] reusing cached TA')
    ticketCache[service] = diskTicket
    return diskTicket
  }
  if (diskExpired) {
    console.log('[WSAA] cached TA expired, requesting new')
  }

  const isProduction = process.env.AFIP_AMBIENTE === 'produccion'
  const wsdl = isProduction ? WSAA_WSDL_PROD : WSAA_WSDL_HOMO

  const tra = buildTRA(service)
  const cms = signTRA(tra)

  try {
    const client = await createClientAsync(wsdl)
    const [result] = await client.loginCmsAsync({ in0: cms })
    const responseXml = result?.loginCmsReturn ?? result?.return ?? ''
    const ticket = parseTicket(responseXml)
    ticketCache[service] = ticket
    writeTaToDisk(service, ticket)
    console.log('[WSAA] new TA from AFIP, cached to disk')
    return ticket
  } catch (error) {
    const afipFault = extractAfipFault(error)
    if (afipFault) {
      throw new Error(afipFault)
    }
    throw error
  }
}
