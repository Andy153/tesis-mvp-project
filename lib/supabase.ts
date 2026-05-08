import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Cliente para uso en browser (componentes client-side)
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Cliente con permisos totales para uso SOLO en API routes y server actions
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)
