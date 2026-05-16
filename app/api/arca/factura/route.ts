import { NextResponse } from 'next/server'
import { emitirFacturaC } from '@/lib/arca/facturacion'

export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const { cuitReceptor, importeTotal, periodoDesde, periodoHasta, periodo } = body

  if (
    cuitReceptor == null ||
    cuitReceptor === '' ||
    importeTotal == null ||
    periodoDesde == null ||
    periodoDesde === '' ||
    periodoHasta == null ||
    periodoHasta === '' ||
    periodo == null ||
    periodo === ''
  ) {
    return NextResponse.json(
      {
        error:
          'Faltan campos requeridos: cuitReceptor, importeTotal, periodoDesde, periodoHasta, periodo',
      },
      { status: 400 },
    )
  }

  try {
    const resultado = await emitirFacturaC({
      monto: Number(importeTotal),
      receptorCuit: cuitReceptor != null && cuitReceptor !== '' ? String(cuitReceptor) : undefined,
      periodoDesde: String(periodoDesde),
      periodoHasta: String(periodoHasta),
      descripcion:
        typeof body.descripcion === 'string' && body.descripcion.trim()
          ? body.descripcion.trim()
          : `Servicios médicos período ${periodo}`,
    })

    return NextResponse.json({
      exito: true,
      nroComprobante: resultado.numeroComprobante,
      cae: resultado.cae,
      caeFechaVto: resultado.caeVencimiento,
      fechaEmision: resultado.fechaEmision,
      pdfBase64: resultado.pdfBase64,
      pdfFileName: `factura_c_${String(resultado.numeroComprobante).padStart(8, '0')}.pdf`,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ exito: false, errores: [message] }, { status: 500 })
  }
}
