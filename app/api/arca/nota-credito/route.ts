import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { isDemoUser } from '@/lib/demo-user'
import { DEMO_CAE, DEMO_PDF_URL } from '@/lib/demo-swiss-cobros-shared'
import { emitirNotaCreditoC } from '@/lib/arca/nota-credito'

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

  const { submissionAnuladaId, motivo } = body

  if (submissionAnuladaId == null || submissionAnuladaId === '') {
    return NextResponse.json(
      { error: 'Falta el campo requerido: submissionAnuladaId' },
      { status: 400 },
    )
  }

  if (isDemoUser(userId)) {
    return NextResponse.json({
      exito: true,
      notaCreditoId: 'demo-nc',
      nroComprobante: 2,
      cae: DEMO_CAE,
      caeFechaVto: new Date().toISOString().slice(0, 10),
      fechaEmision: new Date().toISOString().slice(0, 10),
      pdfPath: 'demo/nota-credito.pdf',
      pdfUrl: DEMO_PDF_URL,
    })
  }

  try {
    const resultado = await emitirNotaCreditoC({
      clerkUserId: userId,
      submissionAnuladaId: String(submissionAnuladaId),
      motivo:
        typeof motivo === 'string' && motivo.trim() ? motivo.trim() : null,
    })

    return NextResponse.json({
      exito: true,
      notaCreditoId: resultado.notaCreditoId,
      nroComprobante: resultado.numeroComprobante,
      cae: resultado.cae,
      caeFechaVto: resultado.caeVencimiento,
      fechaEmision: resultado.fechaEmision,
      pdfPath: resultado.pdfPath,
      pdfUrl: resultado.pdfUrl,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    if (
      message.includes('No se encontró') ||
      message.includes('ya tiene una Nota de Crédito') ||
      message.includes('no tiene CAE') ||
      message.includes('no tiene número de comprobante') ||
      message.includes('no tiene monto total') ||
      message.includes('No se puede emitir una Nota de Crédito sobre otra')
    ) {
      return NextResponse.json({ exito: false, errores: [message] }, { status: 400 })
    }

    return NextResponse.json({ exito: false, errores: [message] }, { status: 500 })
  }
}
