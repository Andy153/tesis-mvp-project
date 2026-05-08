import { supabaseAdmin } from './supabase-admin'

export type ProfileDB = {
  clerk_user_id: string
  nombre: string | null
  matricula: string | null
  especialidad: string | null
  prepagas: string[]
  created_at: string
  updated_at: string
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
