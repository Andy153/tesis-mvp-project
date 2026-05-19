import type { ProfileDB } from '@/lib/profile-db'

export const CONDICION_IVA_OPCIONES = [
  'Monotributo',
  'Responsable Inscripto',
  'Exento',
] as const

export type CondicionIVAOption = (typeof CONDICION_IVA_OPCIONES)[number]

export type ProfileFiscalFormInput = {
  cuit?: string
  razon_social: string
  domicilio_fiscal: string
  condicion_iva: string
  punto_venta: number
  afip_ambiente: 'desarrollo' | 'produccion'
}

export function isValidCondicionIVA(value: string): value is CondicionIVAOption {
  return CONDICION_IVA_OPCIONES.includes(value as CondicionIVAOption)
}

export type CuentaFiscalInitial = {  cuit: string
  razonSocial: string
  domicilioFiscal: string
  condicionIVA: string
  puntoVenta: string
  afipAmbiente: 'desarrollo' | 'produccion'
  cuitLocked: boolean
}

export function mapCondicionIVAFromDb(value: string | null): string {
  if (!value?.trim()) return ''
  const lower = value.toLowerCase()
  if (lower.includes('monotribut')) return 'Monotributo'
  if (lower.includes('inscript')) return 'Responsable Inscripto'
  if (lower.includes('exento')) return 'Exento'
  return value.trim()
}

export function buildCuentaFiscalInitial(profile: ProfileDB | null): CuentaFiscalInitial {
  const cuitRaw = profile?.cuit?.trim() ?? ''
  const cuitLocked = cuitRaw.length > 0
  const ambiente = profile?.afip_ambiente === 'produccion' ? 'produccion' : 'desarrollo'

  return {
    cuit: cuitRaw.replace(/\D/g, '').slice(0, 11),
    razonSocial: profile?.razon_social?.trim() ?? '',
    domicilioFiscal: profile?.domicilio_fiscal?.trim() ?? '',
    condicionIVA: mapCondicionIVAFromDb(profile?.condicion_iva ?? null),
    puntoVenta:
      profile?.punto_venta != null && profile.punto_venta > 0
        ? String(profile.punto_venta)
        : '',
    afipAmbiente: ambiente,
    cuitLocked,
  }
}

export function isFiscalProfileComplete(profile: ProfileDB | null): boolean {
  if (!profile) return false
  return Boolean(
    profile.cuit?.trim() &&
      profile.razon_social?.trim() &&
      profile.domicilio_fiscal?.trim() &&
      profile.condicion_iva?.trim() &&
      profile.punto_venta != null &&
      profile.punto_venta > 0,
  )
}
