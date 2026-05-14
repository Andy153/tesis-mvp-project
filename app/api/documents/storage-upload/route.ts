import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

/**
 * Devuelve "YYYY-MM" a partir de un string de fecha.
 * Acepta formatos ISO (2025-10-11), con hora (2025-10-11T17:23:00), o cualquier
 * cosa parseable por new Date(). Si la fecha no es válida, devuelve null.
 */
function toYearMonth(dateStr: string | null | undefined): string | null {
  if (!dateStr || typeof dateStr !== 'string') return null
  const trimmed = dateStr.trim()
  if (!trimmed) return null

  const d = new Date(trimmed)
  if (Number.isNaN(d.getTime())) return null

  const yyyy = String(d.getFullYear())
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${yyyy}-${mm}`
}

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = formData.get('file')
  const documentIdRaw = formData.get('documentId')
  const operationDateRaw = formData.get('operationDate') // opcional

  if (!(file instanceof File) || !documentIdRaw || typeof documentIdRaw !== 'string') {
    return NextResponse.json({ error: 'Missing file or documentId' }, { status: 400 })
  }

  const documentId = documentIdRaw.trim()
  if (!documentId) {
    return NextResponse.json({ error: 'Invalid documentId' }, { status: 400 })
  }

  const { data: doc, error: docErr } = await supabaseAdmin
    .from('documents')
    .select('id')
    .eq('id', documentId)
    .eq('clerk_user_id', userId)
    .maybeSingle()

  if (docErr || !doc) {
    return NextResponse.json({ error: 'Document not found or access denied' }, { status: 403 })
  }

  // Construcción del path con la nueva lógica
  const ext = file.name.split('.').pop() ?? 'pdf'
  const operationDate =
    typeof operationDateRaw === 'string' ? operationDateRaw : null
  const yearMonth = toYearMonth(operationDate)
  const folder = yearMonth ?? '_pendiente'
  const storagePath = `${userId}/${folder}/${documentId}.${ext}`

  const buffer = Buffer.from(await file.arrayBuffer())

  const { error } = await supabaseAdmin.storage
    .from('documentos-medicos')
    .upload(storagePath, buffer, {
      contentType: file.type || 'application/octet-stream',
      upsert: true,
    })

  if (error) {
    console.error('[TRAZA] Storage upload (admin) error:', error)
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  const { error: updateErr } = await supabaseAdmin
    .from('documents')
    .update({ storage_path: storagePath })
    .eq('id', documentId)
    .eq('clerk_user_id', userId)

  if (updateErr) {
    console.error('[TRAZA] Storage upload metadata update error:', updateErr)
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  return NextResponse.json({ path: storagePath, folder })
}
