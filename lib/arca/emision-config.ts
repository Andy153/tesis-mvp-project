export type AfipAmbiente = 'desarrollo' | 'produccion'

/**
 * Ambiente efectivo para WSAA / WSFE / padrón.
 * Prioridad: AFIP_AMBIENTE en .env.local → perfil en Supabase → desarrollo.
 */
export function getEffectiveAfipAmbiente(profileAfipAmbiente?: string | null): AfipAmbiente {
  const env = process.env.AFIP_AMBIENTE?.trim().toLowerCase()
  if (env === 'produccion') return 'produccion'
  if (env === 'desarrollo') return 'desarrollo'
  if (profileAfipAmbiente === 'produccion') return 'produccion'
  return 'desarrollo'
}

/** Receptor fijo para emisiones del wizard (MVP / E2E en producción). */
export function getReceptorFacturaEmision(): { cuit: string; razonSocial: string } {
  const cuit = (process.env.FACTURA_RECEPTOR_CUIT ?? '23452350319').replace(/\D/g, '')
  const razonSocial =
    process.env.FACTURA_RECEPTOR_RAZON_SOCIAL?.trim() || 'Andres Garcia Skinner'
  return { cuit, razonSocial }
}

export function formatCuitDisplay(cuit: string): string {
  const d = cuit.replace(/\D/g, '')
  if (d.length !== 11) return cuit
  return `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`
}
