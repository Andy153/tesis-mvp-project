import { createClient } from '@supabase/supabase-js'

function normalizeSupabaseUrl(raw: string): string {
  let url = String(raw ?? '').trim()
  if (!url) return ''

  // Vercel envs sometimes get set to the REST endpoint instead of the project URL.
  // supabase-js expects the project base, e.g. https://xxx.supabase.co
  url = url.replace(/\/+$/, '')
  url = url.replace(/\/rest\/v1$/i, '')
  url = url.replace(/\/storage\/v1$/i, '')
  url = url.replace(/\/auth\/v1$/i, '')
  url = url.replace(/\/functions\/v1$/i, '')
  url = url.replace(/\/graphql\/v1$/i, '')
  url = url.replace(/\/+$/, '')
  return url
}

const supabaseUrl = normalizeSupabaseUrl(process.env.SUPABASE_URL ?? '')
const supabaseServiceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim()

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)
