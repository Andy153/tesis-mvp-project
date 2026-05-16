import { NextResponse } from 'next/server'
import { emitirFacturaC } from '@/lib/arca/facturacion'

export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const { cuitReceptor, importeTotal, periodoDesde, periodoHasta } = body

  if (
    cuitReceptor == null ||
    cuitReceptor === '' ||
    importeTotal == null ||
    periodoDesde == null ||
    periodoDesde === '' ||
    periodoHasta == null ||
    periodoHasta === ''
  ) {
    return NextResponse.json(
      { error: 'Faltan campos requeridos: cuitReceptor, importeTotal, periodoDesde, periodoHasta' },
      { status: 400 },
    )
  }

  const result = await emitirFacturaC({
    cuitReceptor: String(cuitReceptor),
    importeTotal: Number(importeTotal),
    periodoDesde: String(periodoDesde),
    periodoHasta: String(periodoHasta),
  })

  return NextResponse.json(result, { status: result.exito ? 200 : 500 })
}
