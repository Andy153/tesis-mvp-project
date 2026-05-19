import { supabaseAdmin } from './supabase-admin'

export type ProfileDB = {
  clerk_user_id: string
  nombre: string | null
  matricula: string | null
  especialidad: string | null
  prepagas: string[]
  cuit: string | null
  razon_social: string | null
  domicilio_fiscal: string | null
  condicion_iva: string | null
  punto_venta: number | null
  afip_ambiente: string | null
  created_at: string
  updated_at: string
}

export type ProfileFiscal = {
  clerkUserId: string
  cuit: string
  razonSocial: string
  domicilioFiscal: string
  condicionIVA: string
  puntoVenta: number
  ambiente: 'desarrollo' | 'produccion'
}

// Obtener perfil por userId de Clerk
export async function getProfileFromDB(clerkUserId: string): Promise<ProfileDB | null> {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('clerk_user_id', clerkUserId)
    .single()

  if (error || !data) return null
  return data as ProfileDB
}

export async function getProfileFiscalFromDB(clerkUserId: string): Promise<ProfileFiscal> {
  const profile = await getProfileFromDB(clerkUserId)
  if (!profile) {
    throw new Error('Perfil no encontrado para ' + clerkUserId)
  }

  const missing: string[] = []
  if (!profile.cuit) missing.push('cuit')
  if (!profile.razon_social) missing.push('razon_social')
  if (!profile.domicilio_fiscal) missing.push('domicilio_fiscal')
  if (!profile.condicion_iva) missing.push('condicion_iva')
  if (profile.punto_venta == null) missing.push('punto_venta')

  if (missing.length > 0) {
    throw new Error(
      'Datos fiscales incompletos en el perfil. Faltan: ' + missing.join(', '),
    )
  }

  const ambiente = profile.afip_ambiente === 'produccion' ? 'produccion' : 'desarrollo'

  return {
    clerkUserId: profile.clerk_user_id,
    cuit: String(profile.cuit).trim(),
    razonSocial: String(profile.razon_social).trim(),
    domicilioFiscal: String(profile.domicilio_fiscal).trim(),
    condicionIVA: String(profile.condicion_iva).trim(),
    puntoVenta: Number(profile.punto_venta),
    ambiente,
  }
}

// Crear o actualizar perfil (upsert)
export async function upsertProfileToDB(
  clerkUserId: string,
  updates: Partial<Omit<ProfileDB, 'clerk_user_id' | 'created_at' | 'updated_at'>>
): Promise<ProfileDB | null> {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .upsert({
      clerk_user_id: clerkUserId,
      ...updates,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'clerk_user_id' })
    .select()
    .single()

  if (error) {
    console.error('Error upserting profile:', error)
    return null
  }
  return data as ProfileDB
}
