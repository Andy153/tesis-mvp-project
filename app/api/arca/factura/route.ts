import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { emitirFacturaC } from '@/lib/arca/facturacion'

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
      clerkUserId: userId,
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
    if (message.includes('Datos fiscales incompletos en el perfil')) {
      return NextResponse.json({ exito: false, errores: [message] }, { status: 400 })
    }
    return NextResponse.json({ exito: false, errores: [message] }, { status: 500 })
  }
}
