import fs from 'fs'
import path from 'path'
import forge from 'node-forge'
import { createClientAsync } from 'soap'
import { supabaseAdmin } from '@/lib/supabase-admin'

const WSAA_WSDL_HOMO = 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms?WSDL'
const WSAA_WSDL_PROD = 'https://servicios1.afip.gov.ar/ws/services/LoginCms?WSDL'
const TA_CACHE_MARGIN_MS = 2 * 60 * 1000

interface TicketAcceso {
  token: string
  sign: string
  expiresAt: Date
}

// Cache en memoria por servicio (mismo proceso / mismo módulo)
const ticketCache: Record<string, TicketAcceso> = {}

function afipCuit(): string {
  return String(process.env.AFIP_CUIT ?? '23452350319').trim()
}

function isTicketValid(ticket: TicketAcceso): boolean {
  return ticket.expiresAt > new Date(Date.now() + TA_CACHE_MARGIN_MS)
}

async function readTaFromSupabase(cuit: string, service: string): Promise<TicketAcceso | null> {
  const cuitKey = String(cuit).trim()
  console.log('[WSAA] readTaFromSupabase called with:', {
    cuit: cuitKey,
    service,
    cuitType: typeof cuitKey,
  })

  try {
    const { data, error } = await supabaseAdmin
      .from('arca_tickets')
      .select('token, sign, expires_at')
      .eq('cuit', cuitKey)
      .eq('service', service)
      .maybeSingle()

    console.log('[WSAA] Supabase response:', { data, error })

    if (error) {
      console.error('[WSAA] Supabase error:', error)
      return null
    }

    if (!data) {
      console.log('[WSAA] No row found in Supabase')
      return null
    }

    if (!data.token || !data.sign || !data.expires_at) {
      console.log('[WSAA] Incomplete row in Supabase:', data)
      return null
    }

    const expiresAt = new Date(data.expires_at)
    if (Number.isNaN(expiresAt.getTime())) {
      console.log('[WSAA] Invalid expires_at in Supabase:', data.expires_at)
      return null
    }

    const now = new Date(Date.now() + TA_CACHE_MARGIN_MS)
    console.log('[WSAA] Comparing dates:', {
      expires_at_raw: data.expires_at,
      expires_at_parsed: expiresAt.toISOString(),
      now_with_margin: now.toISOString(),
      isValid: expiresAt > now,
    })

    if (expiresAt <= now) {
      console.log('[WSAA] TA in Supabase expired')
      return null
    }

    return {
      token: data.token,
      sign: data.sign,
      expiresAt,
    }
  } catch (error) {
    console.error('[WSAA] Supabase read exception:', error)
    return null
  }
}

async function writeTaToSupabase(cuit: string, service: string, ticket: TicketAcceso): Promise<void> {
  const cuitKey = String(cuit).trim()
  const row = {
    cuit: cuitKey,
    service,
    token: ticket.token,
    sign: ticket.sign,
    expires_at: ticket.expiresAt.toISOString(),
    updated_at: new Date().toISOString(),
  }

  console.log('[WSAA] writeTaToSupabase called with:', {
    cuit: cuitKey,
    service,
    cuitType: typeof cuitKey,
    expires_at: row.expires_at,
  })

  try {
    const { data, error } = await supabaseAdmin
      .from('arca_tickets')
      .upsert(row, { onConflict: 'cuit,service' })
      .select('cuit, service, expires_at')
      .maybeSingle()

    console.log('[WSAA] Supabase upsert response:', { data, error })

    if (error) {
      console.error('[WSAA] Supabase write error:', error)
    }
  } catch (error) {
    console.error('[WSAA] Supabase write exception:', error)
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

function readCertPem(): string {
  console.log('[DEBUG-CERT] AFIP_CERT_PEM exists:', !!process.env.AFIP_CERT_PEM)
  console.log('[DEBUG-CERT] AFIP_CERT_PEM length:', process.env.AFIP_CERT_PEM?.length || 0)
  console.log('[DEBUG-CERT] AFIP_CERT_PEM first 30 chars:', process.env.AFIP_CERT_PEM?.substring(0, 30))
  console.log(
    '[DEBUG-CERT] AFIP_CERT_PEM includes BEGIN:',
    process.env.AFIP_CERT_PEM?.includes('BEGIN CERTIFICATE'),
  )

  const envCert = process.env.AFIP_CERT_PEM
  if (envCert && envCert.trim().includes('BEGIN CERTIFICATE')) {
    return envCert
  }

  const certPath = path.resolve(
    process.cwd(),
    process.env.AFIP_CERT_PATH || 'certs/traza_homo.crt',
  )
  if (!fs.existsSync(certPath)) {
    throw new Error(
      'Cert no disponible: defina AFIP_CERT_PEM (env var) o AFIP_CERT_PATH (archivo)',
    )
  }
  return fs.readFileSync(certPath, 'utf8')
}

function readKeyPem(): string {
  console.log('[DEBUG-KEY] AFIP_KEY_PEM exists:', !!process.env.AFIP_KEY_PEM)
  console.log('[DEBUG-KEY] AFIP_KEY_PEM length:', process.env.AFIP_KEY_PEM?.length || 0)
  console.log('[DEBUG-KEY] AFIP_KEY_PEM first 30 chars:', process.env.AFIP_KEY_PEM?.substring(0, 30))
  console.log(
    '[DEBUG-KEY] AFIP_KEY_PEM includes PRIVATE:',
    process.env.AFIP_KEY_PEM?.includes('PRIVATE KEY'),
  )

  const envKey = process.env.AFIP_KEY_PEM
  if (envKey && envKey.trim().includes('PRIVATE KEY')) {
    return envKey
  }

  const keyPath = path.resolve(
    process.cwd(),
    process.env.AFIP_KEY_PATH || 'certs/traza_homo.key',
  )
  if (!fs.existsSync(keyPath)) {
    throw new Error(
      'Key no disponible: defina AFIP_KEY_PEM (env var) o AFIP_KEY_PATH (archivo)',
    )
  }
  return fs.readFileSync(keyPath, 'utf8')
}

function signTRA(tra: string): string {
  const certSource = process.env.AFIP_CERT_PEM ? 'env' : 'filesystem'
  const keySource = process.env.AFIP_KEY_PEM ? 'env' : 'filesystem'
  console.log('[WSAA] signing TRA with cert from', certSource, 'and key from', keySource)

  const certPem = readCertPem()
  const keyPem = readKeyPem()
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
  const cuit = afipCuit()
  console.log('[WSAA] getTicketAcceso:', { service, cuit, cuitType: typeof cuit })

  const cached = ticketCache[service]
  if (cached && isTicketValid(cached)) {
    console.log('[WSAA] reusing TA from memory')
    return cached
  }

  const supabaseTicket = await readTaFromSupabase(cuit, service)
  if (supabaseTicket) {
    console.log('[WSAA] reusing TA from Supabase')
    ticketCache[service] = supabaseTicket
    return supabaseTicket
  }

  console.log('[WSAA] no cached TA, requesting new from AFIP')

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
    await writeTaToSupabase(cuit, service, ticket)
    console.log('[WSAA] new TA cached in memory + Supabase')
    return ticket
  } catch (error) {
    const afipFault = extractAfipFault(error)
    if (afipFault) {
      throw new Error(afipFault)
    }
    throw error
  }
}
