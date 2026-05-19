import { supabaseAdmin } from '@/lib/supabase-admin'

export const BUCKET_ARCA_CERTS = 'arca-certs'

export type ArcaCertStatus = {
  hasKey: boolean
  hasCert: boolean
}

function userPrefix(clerkUserId: string): string {
  return `${clerkUserId}`
}

async function listUserCertFileNames(clerkUserId: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET_ARCA_CERTS)
    .list(userPrefix(clerkUserId), { limit: 20 })

  if (error || !data) return []
  return data.map((f) => f.name)
}

export async function getArcaCertStatus(clerkUserId: string): Promise<ArcaCertStatus> {
  const files = await listUserCertFileNames(clerkUserId)
  return {
    hasKey: files.includes('key.pem'),
    hasCert: files.includes('cert.pem'),
  }
}

export async function userHasKeyPem(clerkUserId: string): Promise<boolean> {
  const { hasKey } = await getArcaCertStatus(clerkUserId)
  return hasKey
}

async function downloadFromStorage(path: string): Promise<string> {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET_ARCA_CERTS).download(path)
  if (error) {
    throw new Error(`No se pudo descargar ${path} de Storage: ${error.message}`)
  }
  return await data.text()
}

export async function readUserCertPem(clerkUserId: string): Promise<string> {
  const path = `${userPrefix(clerkUserId)}/cert.pem`
  const content = await downloadFromStorage(path)
  if (!content.includes('BEGIN CERTIFICATE')) {
    throw new Error(`El cert de ${clerkUserId} está malformado (falta BEGIN CERTIFICATE)`)
  }
  return content
}

export async function readUserKeyPem(clerkUserId: string): Promise<string> {
  const path = `${userPrefix(clerkUserId)}/key.pem`
  const content = await downloadFromStorage(path)
  if (!content.includes('PRIVATE KEY')) {
    throw new Error(`La key de ${clerkUserId} está malformada (falta PRIVATE KEY)`)
  }
  return content
}

export async function userHasArcaCerts(clerkUserId: string): Promise<boolean> {
  const { hasKey, hasCert } = await getArcaCertStatus(clerkUserId)
  return hasKey && hasCert
}

export async function uploadUserKeyPem(
  clerkUserId: string,
  keyPem: string,
  opts?: { upsert?: boolean },
): Promise<void> {
  const path = `${userPrefix(clerkUserId)}/key.pem`
  const { error } = await supabaseAdmin.storage.from(BUCKET_ARCA_CERTS).upload(path, keyPem, {
    contentType: 'application/x-pem-file',
    upsert: opts?.upsert ?? false,
  })

  if (error) {
    throw new Error(`No se pudo guardar key.pem: ${error.message}`)
  }
}

export async function uploadUserCertPem(
  clerkUserId: string,
  certPem: string,
  opts?: { upsert?: boolean },
): Promise<void> {
  const path = `${userPrefix(clerkUserId)}/cert.pem`
  const { error } = await supabaseAdmin.storage.from(BUCKET_ARCA_CERTS).upload(path, certPem, {
    contentType: 'application/x-pem-file',
    upsert: opts?.upsert ?? false,
  })

  if (error) {
    throw new Error(`No se pudo guardar cert.pem: ${error.message}`)
  }
}

export function certStatusWithReady(status: ArcaCertStatus) {
  return {
    ...status,
    ready: status.hasKey && status.hasCert,
  }
}
