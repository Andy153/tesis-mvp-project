import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

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

  const ext = file.name.split('.').pop() ?? 'pdf'
  const storagePath = `${userId}/${documentId}.${ext}`
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

  return NextResponse.json({ path: storagePath })
}
