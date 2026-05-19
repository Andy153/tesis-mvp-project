import { NextRequest, NextResponse } from 'next/server'
import { consultarPadron } from '@/lib/arca/padron'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const cuit = req.nextUrl.searchParams.get('cuit')
  if (!cuit) {
    return NextResponse.json({ error: 'falta query param ?cuit=...' }, { status: 400 })
  }
  try {
    const data = await consultarPadron(cuit)
    return NextResponse.json({ ok: true, data })
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        error: err.message || String(err),
        stack: err.stack,
      },
      { status: 500 },
    )
  }
}
