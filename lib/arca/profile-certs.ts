import { supabaseAdmin } from '@/lib/supabase-admin'

const BUCKET_ARCA_CERTS = 'arca-certs'

async function downloadFromStorage(path: string): Promise<string> {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET_ARCA_CERTS).download(path)
  if (error) {
    throw new Error(`No se pudo descargar ${path} de Storage: ${error.message}`)
  }
  return await data.text()
}

export async function readUserCertPem(clerkUserId: string): Promise<string> {
  const path = `${clerkUserId}/cert.pem`
  const content = await downloadFromStorage(path)
  if (!content.includes('BEGIN CERTIFICATE')) {
    throw new Error(`El cert de ${clerkUserId} está malformado (falta BEGIN CERTIFICATE)`)
  }
  return content
}

export async function readUserKeyPem(clerkUserId: string): Promise<string> {
  const path = `${clerkUserId}/key.pem`
  const content = await downloadFromStorage(path)
  if (!content.includes('PRIVATE KEY')) {
    throw new Error(`La key de ${clerkUserId} está malformada (falta PRIVATE KEY)`)
  }
  return content
}

export async function userHasArcaCerts(clerkUserId: string): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET_ARCA_CERTS)
      .list(clerkUserId, { limit: 10 })

    if (error || !data) return false

    const files = data.map((f) => f.name)
    return files.includes('cert.pem') && files.includes('key.pem')
  } catch {
    return false
  }
}
