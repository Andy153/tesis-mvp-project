import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { isDemoUser } from '@/lib/demo-user'
import { DEMO_FACTURA_BUCKET, DEMO_FACTURA_PATH } from '@/lib/demo-swiss-cobros'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { assertFacturaPathOwnedByUser, createFacturaSignedUrl } from '@/lib/arca/factura-storage'

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  if (isDemoUser(userId)) {
    const tried: { bucket: string; path: string; error?: string }[] = []

    const trySign = async (bucket: string, path: string) => {
      const { data: signed, error: signErr } = await supabaseAdmin.storage
        .from(bucket)
        .createSignedUrl(path, 3600)
      if (!signErr && signed?.signedUrl) {
        return signed.signedUrl
      }
      tried.push({ bucket, path, error: signErr?.message ?? 'No se pudo firmar la URL' })
      return null
    }

    // 1) Path fijo demo
    const direct = await trySign(DEMO_FACTURA_BUCKET, DEMO_FACTURA_PATH)
    if (direct) return NextResponse.json({ pdfUrl: direct })

    // 2) Best-effort: listar candidatos y firmar si hay un match único
    try {
      const { data: list1 } = await supabaseAdmin.storage
        .from(DEMO_FACTURA_BUCKET)
        .list('', { limit: 200, search: 'factura' })
      const names = (list1 ?? [])
        .map((it: any) => (typeof it?.name === 'string' ? it.name : null))
        .filter((x: any): x is string => typeof x === 'string')

      const needle = 'factura_demo_traza'
      const near = names.filter((n) => n.toLowerCase().includes(needle))
      if (near.length === 1) {
        const resolved = await trySign(DEMO_FACTURA_BUCKET, near[0])
        if (resolved) return NextResponse.json({ pdfUrl: resolved, resolvedDemoPath: near[0] })
      }

      if (near.length > 0) {
        tried.push({
          bucket: DEMO_FACTURA_BUCKET,
          path: '(list)',
          error: `Sugerencias en bucket demo: ${near.slice(0, 20).join(', ')}`,
        })
      }
    } catch {
      /* ignore */
    }

    const notFound = tried.some((t) => (t.error ?? '').toLowerCase().includes('not found'))
    return NextResponse.json(
      {
        error: notFound ? 'Factura demo no encontrada en Storage' : 'No se pudo obtener la factura demo',
        demo_bucket: DEMO_FACTURA_BUCKET,
        demo_path: DEMO_FACTURA_PATH,
        tried,
      },
      { status: notFound ? 404 : 500 },
    )
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const pdfPath = typeof body.pdfPath === 'string' ? body.pdfPath.trim() : ''
  if (!pdfPath) {
    return NextResponse.json({ error: 'Falta pdfPath' }, { status: 400 })
  }

  try {
    assertFacturaPathOwnedByUser(pdfPath, userId)
    const pdfUrl = await createFacturaSignedUrl(pdfPath)
    return NextResponse.json({ pdfUrl })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const status = message.includes('no válida') ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
