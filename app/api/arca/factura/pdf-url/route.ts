import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { assertFacturaPathOwnedByUser, createFacturaSignedUrl } from '@/lib/arca/factura-storage'

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
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
