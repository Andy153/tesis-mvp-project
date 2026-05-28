import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { isDemoUser } from '@/lib/demo-user'
import { resolveDocumentStorageDownloadPath } from '@/lib/document-storage-path'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SIGNED_URL_TTL_SEC = 3600

export async function GET(req: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!isDemoUser(userId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url = new URL(req.url)
  const documentId = url.searchParams.get('document_id')?.trim() || null
  const storagePathOverride = url.searchParams.get('storage_path')?.trim() || null

  let query = supabaseAdmin
    .from('documents')
    .select(
      `
      id,
      storage_path,
      nombre_archivo,
      ai_extractions ( fecha_practica )
    `,
    )
    .eq('clerk_user_id', userId)

  if (documentId) {
    query = query.eq('id', documentId)
  } else {
    query = query.order('created_at', { ascending: false }).limit(1)
  }

  const { data: doc, error } = await query.maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  const extractions = (doc as { ai_extractions?: { fecha_practica?: string | null }[] | null })
    .ai_extractions
  const fechaPractica = Array.isArray(extractions) ? extractions[0]?.fecha_practica ?? null : null

  const resolved = await resolveDocumentStorageDownloadPath({
    userId,
    documentId: doc.id,
    storagePath: doc.storage_path,
    nombreArchivo: doc.nombre_archivo,
    fechaPracticaISO: fechaPractica,
    overridePath: storagePathOverride,
  })

  if (!resolved.path) {
    return NextResponse.json(
      {
        error:
          resolved.lastError ??
          'No se encontró el PDF en Storage. Verificá que el archivo exista en el bucket documentos-medicos.',
        tried_paths: resolved.tried,
        document_id: doc.id,
        db_storage_path: doc.storage_path,
      },
      { status: 404 },
    )
  }

  if (resolved.path !== doc.storage_path) {
    await supabaseAdmin
      .from('documents')
      .update({ storage_path: resolved.path })
      .eq('id', doc.id)
      .eq('clerk_user_id', userId)
  }

  const { data: signed, error: signErr } = await supabaseAdmin.storage
    .from('documentos-medicos')
    .createSignedUrl(resolved.path, SIGNED_URL_TTL_SEC)

  if (signErr || !signed?.signedUrl) {
    return NextResponse.json(
      {
        error: signErr?.message ?? 'No se pudo generar el enlace de descarga',
        storage_path: resolved.path,
        tried_paths: resolved.tried,
      },
      { status: 500 },
    )
  }

  return NextResponse.json({
    signedUrl: signed.signedUrl,
    storage_path: resolved.path,
    document_id: doc.id,
    nombre_archivo: doc.nombre_archivo,
    tried_paths: resolved.tried,
  })
}
