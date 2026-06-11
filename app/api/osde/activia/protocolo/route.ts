import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'
import { enviarProtocolo02P } from '@/lib/activia/client'
import { BUCKET_DOCUMENTOS, normalizeDocumentStoragePath } from '@/lib/document-storage-path'

function formatFechaActivia(fechaCirugia: string | null): string {
  if (!fechaCirugia) {
    return new Date().toISOString().slice(0, 10).replace(/-/g, '')
  }
  const isoDate = fechaCirugia.includes('T') ? fechaCirugia.slice(0, 10) : fechaCirugia.slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    return isoDate.replace(/-/g, '')
  }
  const d = new Date(fechaCirugia)
  if (!Number.isNaN(d.getTime())) {
    const yyyy = String(d.getFullYear())
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${yyyy}${mm}${dd}`
  }
  return fechaCirugia.replace(/-/g, '').slice(0, 8)
}

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const cirugiaId = typeof body.cirugiaId === 'string' ? body.cirugiaId.trim() : ''
  if (!cirugiaId) {
    return NextResponse.json({ error: 'missing_cirugia_id' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: cirugia, error: cirErr } = await supabase
    .from('osde_cirugias')
    .select('document_id, numero_tramite_apligem, afiliado, fecha_cirugia')
    .eq('id', cirugiaId)
    .eq('clerk_user_id', userId)
    .single()

  if (cirErr || !cirugia) {
    return NextResponse.json({ error: 'cirugia_no_encontrada' }, { status: 404 })
  }

  if (!cirugia.numero_tramite_apligem) {
    return NextResponse.json(
      { error: 'La cirugía no tiene NroReferencia de Activia. Completá el paso 1 primero.' },
      { status: 400 }
    )
  }

  if (!cirugia.document_id) {
    return NextResponse.json(
      { error: 'No hay documento cargado para esta cirugía.' },
      { status: 400 }
    )
  }

  const { data: documento, error: docErr } = await supabase
    .from('documents')
    .select('storage_path')
    .eq('id', cirugia.document_id)
    .single()

  if (docErr || !documento?.storage_path) {
    return NextResponse.json(
      { error: 'No hay documento cargado para esta cirugía.' },
      { status: 400 }
    )
  }

  const storagePath = normalizeDocumentStoragePath(documento.storage_path)
  if (!storagePath) {
    return NextResponse.json(
      { error: 'No hay documento cargado para esta cirugía.' },
      { status: 400 }
    )
  }

  const { data: pdfBlob, error: downloadErr } = await supabase.storage
    .from(BUCKET_DOCUMENTOS)
    .download(storagePath)

  if (downloadErr || !pdfBlob) {
    return NextResponse.json(
      { error: downloadErr?.message ?? 'No se pudo descargar el documento.' },
      { status: 400 }
    )
  }

  const pdfBase64 = Buffer.from(await pdfBlob.arrayBuffer()).toString('base64')

  const result = await enviarProtocolo02P({
    nroReferencia: cirugia.numero_tramite_apligem,
    pdfBase64,
    fechaCirugia: formatFechaActivia(cirugia.fecha_cirugia),
    credencialAfiliado: cirugia.afiliado ?? '',
  })

  const esDuplicada = result.descripcion.toUpperCase().includes('DUPLICADA')

  if (result.ok || esDuplicada) {
    const { error: updateErr } = await supabase
      .from('osde_cirugias')
      .update({
        protocolo_enviado_en: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', cirugiaId)
      .eq('clerk_user_id', userId)

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, mensaje: 'Protocolo enviado correctamente' })
  }

  return NextResponse.json({
    ok: false,
    codigoRta: result.codigoRta,
    mensaje: result.descripcion,
  })
}
