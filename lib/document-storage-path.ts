import { supabaseAdmin } from '@/lib/supabase-admin'

export const BUCKET_DOCUMENTOS = 'documentos-medicos'

export function normalizeDocumentStoragePath(rawPath: string | null | undefined): string | null {
  if (!rawPath) return null
  const trimmed = String(rawPath).trim()
  if (!trimmed) return null

  let candidate = trimmed
  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const u = new URL(trimmed)
      candidate = decodeURIComponent(u.pathname)
    }
  } catch {
    candidate = trimmed
  }

  const publicPrefix = `/storage/v1/object/public/${BUCKET_DOCUMENTOS}/`
  const signPrefix = `/storage/v1/object/sign/${BUCKET_DOCUMENTOS}/`
  if (candidate.startsWith(publicPrefix)) candidate = candidate.slice(publicPrefix.length)
  if (candidate.startsWith(signPrefix)) candidate = candidate.slice(signPrefix.length)
  if (candidate.startsWith(`${BUCKET_DOCUMENTOS}/`)) {
    candidate = candidate.slice(BUCKET_DOCUMENTOS.length + 1)
  }
  candidate = candidate.replace(/^\/+/, '')
  if (candidate.includes('..')) return null
  return candidate
}

function yearMonthFromDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null
  const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00`)
  if (Number.isNaN(d.getTime())) return null
  const yyyy = String(d.getFullYear())
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${yyyy}-${mm}`
}

function extensionCandidates(nombreArchivo: string | null | undefined): string[] {
  const rawExt = String(nombreArchivo ?? '').split('.').pop()?.trim().toLowerCase()
  const candidates = new Set<string>(['pdf'])
  if (rawExt && /^[a-z0-9]{1,8}$/.test(rawExt)) candidates.add(rawExt)
  return Array.from(candidates)
}

/** Rutas posibles del PDF en Storage (placeholder en DB vs upload real por document id). */
export function buildDocumentStorageCandidates(args: {
  userId: string
  documentId: string
  storagePath: string | null | undefined
  nombreArchivo?: string | null
  fechaPracticaISO?: string | null
  overridePath?: string | null
}): string[] {
  const candidates = new Set<string>()

  const override = normalizeDocumentStoragePath(args.overridePath)
  if (override) candidates.add(override)

  const normalized = normalizeDocumentStoragePath(args.storagePath)
  if (normalized && !normalized.startsWith('TEST_FAKE_PATH/')) {
    candidates.add(normalized)
  }

  const folders = [yearMonthFromDate(args.fechaPracticaISO), '_pendiente'].filter(
    (v): v is string => Boolean(v),
  )
  for (const folder of folders) {
    for (const ext of extensionCandidates(args.nombreArchivo)) {
      candidates.add(`${args.userId}/${folder}/${args.documentId}.${ext}`)
    }
  }

  return Array.from(candidates)
}

export async function resolveDocumentStorageDownloadPath(args: {
  userId: string
  documentId: string
  storagePath: string | null | undefined
  nombreArchivo?: string | null
  fechaPracticaISO?: string | null
  overridePath?: string | null
}): Promise<{ path: string | null; tried: string[]; lastError?: string }> {
  const tried = buildDocumentStorageCandidates(args)
  if (tried.length === 0) {
    return { path: null, tried, lastError: 'No storage path candidates' }
  }

  let lastError: string | undefined
  for (const candidate of tried) {
    const { data, error } = await supabaseAdmin.storage.from(BUCKET_DOCUMENTOS).download(candidate)
    if (!error && data) {
      return { path: candidate, tried }
    }
    lastError = error?.message
  }

  return { path: null, tried, lastError }
}
