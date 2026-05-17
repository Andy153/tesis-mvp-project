import { createClientAsync } from 'soap'
import { getTicketAcceso } from './client'
import { supabaseAdmin } from '@/lib/supabase-admin'

const PADRON_WSDL_HOMO =
  'https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA13?WSDL'
const PADRON_WSDL_PROD = 'https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA13?WSDL'
const PADRON_CACHE_TTL_DAYS = 7

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

export interface PadronData {
  cuit: string
  razonSocial: string | null
  tipoPersona: string | null
  estado: string | null
  condicionIVACodigo: number
  condicionIVALabel: string
  rawResponse: unknown
}

function padronWsdl(): string {
  return process.env.AFIP_AMBIENTE === 'produccion' ? PADRON_WSDL_PROD : PADRON_WSDL_HOMO
}

function afipCuitRepresentada(): number {
  return parseInt(process.env.AFIP_CUIT || '23452350319', 10)
}

function normalizeCuit(cuit: string): string {
  return String(cuit).replace(/[^0-9]/g, '').trim()
}

function rowToPadronData(row: {
  cuit: string
  razon_social: string | null
  tipo_persona: string | null
  estado: string | null
  condicion_iva_codigo: number
  condicion_iva_label: string
  raw_response: unknown
}): PadronData {
  return {
    cuit: row.cuit,
    razonSocial: row.razon_social,
    tipoPersona: row.tipo_persona,
    estado: row.estado,
    condicionIVACodigo: row.condicion_iva_codigo,
    condicionIVALabel: row.condicion_iva_label,
    rawResponse: row.raw_response,
  }
}

async function readPadronFromCache(cuit: string): Promise<PadronData | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('arca_padron_cache')
      .select('*')
      .eq('cuit', cuit)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()

    if (error) {
      console.error('[PADRON] Supabase read error:', error.message)
      return null
    }

    if (!data) return null
    return rowToPadronData(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[PADRON] Supabase read exception:', message)
    return null
  }
}

async function writePadronToCache(cuit: string, data: PadronData): Promise<void> {
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + PADRON_CACHE_TTL_DAYS)

  try {
    const { error } = await supabaseAdmin.from('arca_padron_cache').upsert(
      {
        cuit,
        razon_social: data.razonSocial,
        tipo_persona: data.tipoPersona,
        estado: data.estado,
        condicion_iva_codigo: data.condicionIVACodigo,
        condicion_iva_label: data.condicionIVALabel,
        raw_response: data.rawResponse,
        fetched_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
      },
      { onConflict: 'cuit' },
    )

    if (error) {
      console.error('[PADRON] Supabase write error:', error.message)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[PADRON] Supabase write exception:', message)
  }
}

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (value == null) return []
  return Array.isArray(value) ? value : [value]
}

function extractPersona(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null
  const personaReturn = (raw as { personaReturn?: unknown }).personaReturn
  if (!personaReturn || typeof personaReturn !== 'object') return null

  let persona = (personaReturn as { persona?: unknown }).persona
  if (Array.isArray(persona)) persona = persona[0]
  if (!persona || typeof persona !== 'object') return null
  return persona as Record<string, unknown>
}

function buildRazonSocial(persona: Record<string, unknown>): string | null {
  const razonSocial = persona.razonSocial
  if (typeof razonSocial === 'string' && razonSocial.trim()) {
    return razonSocial.trim().toUpperCase()
  }

  const apellido = typeof persona.apellido === 'string' ? persona.apellido.trim() : ''
  const nombre = typeof persona.nombre === 'string' ? persona.nombre.trim() : ''
  const combined = [apellido, nombre].filter(Boolean).join(', ')
  return combined ? combined.toUpperCase() : null
}

function mapEstado(persona: Record<string, unknown>): string | null {
  const estadoClave = persona.estadoClave
  if (typeof estadoClave !== 'string' || !estadoClave.trim()) return null
  return estadoClave.trim().toUpperCase() === 'ACTIVO' ? 'ACTIVO' : 'INACTIVO'
}

function hasImpuestoActivo(persona: Record<string, unknown>, idImpuesto: number): boolean {
  return asArray(persona.impuesto as unknown[] | undefined).some((imp) => {
    if (!imp || typeof imp !== 'object') return false
    const item = imp as { idImpuesto?: number | string; estadoImpuesto?: string; estado?: string }
    const estado = String(item.estadoImpuesto ?? item.estado ?? '').toUpperCase()
    return Number(item.idImpuesto) === idImpuesto && estado === 'ACTIVO'
  })
}

function hasMonotributoActivo(persona: Record<string, unknown>): boolean {
  return asArray(persona.categoriaMonotributo as unknown[] | undefined).some((cat) => {
    if (!cat || typeof cat !== 'object') return false
    const item = cat as { estado?: string }
    return String(item.estado ?? '').toUpperCase() === 'ACTIVO'
  })
}

function detectCondicionIVA(persona: Record<string, unknown>): { codigo: number; label: string } {
  if (hasMonotributoActivo(persona)) {
    return { codigo: 6, label: CONDICION_IVA_LABELS[6] }
  }
  if (hasImpuestoActivo(persona, 30)) {
    return { codigo: 1, label: CONDICION_IVA_LABELS[1] }
  }
  if (hasImpuestoActivo(persona, 32)) {
    return { codigo: 4, label: CONDICION_IVA_LABELS[4] }
  }
  return { codigo: 5, label: CONDICION_IVA_LABELS[5] }
}

function parsePadronResponse(raw: unknown, cuit: string): PadronData {
  const persona = extractPersona(raw)
  if (!persona) {
    throw new Error('Respuesta de padrón inválida: sin datos de persona')
  }

  const { codigo, label } = detectCondicionIVA(persona)
  const tipoPersonaRaw = persona.tipoPersona
  const tipoPersona =
    typeof tipoPersonaRaw === 'string' && tipoPersonaRaw.trim()
      ? tipoPersonaRaw.trim().toUpperCase()
      : persona.razonSocial
        ? 'JURIDICA'
        : 'FISICA'

  return {
    cuit,
    razonSocial: buildRazonSocial(persona),
    tipoPersona,
    estado: mapEstado(persona),
    condicionIVACodigo: codigo,
    condicionIVALabel: label,
    rawResponse: raw,
  }
}

export async function consultarPadron(cuit: string): Promise<PadronData> {
  const cuitNorm = normalizeCuit(cuit)
  if (cuitNorm.length !== 11) {
    throw new Error('CUIT inválido (debe tener 11 dígitos)')
  }

  const cached = await readPadronFromCache(cuitNorm)
  if (cached) {
    console.log(`[PADRON] hit en cache para cuit=${cuitNorm}`)
    return cached
  }

  const ta = await getTicketAcceso('ws_sr_padron_a13')
  const client = await createClientAsync(padronWsdl())

  try {
    const [result] = await client.getPersonaAsync({
      token: ta.token,
      sign: ta.sign,
      cuitRepresentada: afipCuitRepresentada(),
      idPersona: Number(cuitNorm),
    })

    console.log('[PADRON] response:', JSON.stringify(result, null, 2))

    const padronData = parsePadronResponse(result, cuitNorm)
    await writePadronToCache(cuitNorm, padronData)
    return padronData
  } catch (error) {
    console.error('[PADRON] consulta SOAP falló:', error)
    throw error
  }
}
