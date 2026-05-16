import { NextResponse } from 'next/server'
import { emitirFacturaC, generarPDFFacturaC } from '@/lib/arca/facturacion'

export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const { cuitReceptor, importeTotal, periodoDesde, periodoHasta, periodo, razonSocialEmisor } = body

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

  const resultado = await emitirFacturaC({
    cuitReceptor: String(cuitReceptor),
    importeTotal: Number(importeTotal),
    periodoDesde: String(periodoDesde),
    periodoHasta: String(periodoHasta),
  })

  if (!resultado.exito) {
    return NextResponse.json(resultado, { status: 500 })
  }

  const razonSocial =
    process.env.AFIP_RAZON_SOCIAL?.trim() ||
    (typeof razonSocialEmisor === 'string' ? razonSocialEmisor.trim() : '') ||
    'Emisor'

  let pdf: { fileBase64: string; fileName: string } | null = null
  if (resultado.cae && resultado.nroComprobante != null && resultado.caeFechaVto) {
    pdf = await generarPDFFacturaC({
      nroComprobante: resultado.nroComprobante,
      cae: resultado.cae,
      caeFechaVto: resultado.caeFechaVto,
      importeTotal: Number(importeTotal),
      periodo: String(periodo),
      cuitEmisor: Number(process.env.AFIP_CUIT) || 20409378472,
      razonSocialEmisor: razonSocial,
    })
  }

  return NextResponse.json({
    ...resultado,
    pdfBase64: pdf?.fileBase64 ?? null,
    pdfFileName: pdf?.fileName ?? null,
  })
}
