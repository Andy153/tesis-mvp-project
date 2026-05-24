'use server'

import { auth } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'
import { emitirNotaCreditoC } from '@/lib/arca/nota-credito'

export interface EmitirNotaCreditoActionResult {
  exito: boolean
  error?: string
  notaCreditoId?: string
  cae?: string
  numeroComprobante?: number
  pdfUrl?: string
}

/**
 * Server action que emite una Nota de Crédito sobre una factura existente.
 *
 * Después de emitir, revalida el path de Documentos para que el listado
 * refresque y muestre la factura como anulada + la NC nueva.
 */
export async function emitirNotaCreditoAction(
  submissionAnuladaId: string,
  motivo?: string,
): Promise<EmitirNotaCreditoActionResult> {
  const { userId } = await auth()
  if (!userId) {
    return { exito: false, error: 'No autorizado' }
  }

  if (!submissionAnuladaId) {
    return { exito: false, error: 'Falta el ID de la factura a anular' }
  }

  try {
    const resultado = await emitirNotaCreditoC({
      clerkUserId: userId,
      submissionAnuladaId,
      motivo: motivo?.trim() || null,
    })

    // Refresca el listado de documentos donde aparece la factura y aparecerá la NC.
    // Ajustar el path si el listado vive en otro lugar.
    revalidatePath('/documentos')
    revalidatePath('/')

    return {
      exito: true,
      notaCreditoId: resultado.notaCreditoId,
      cae: resultado.cae,
      numeroComprobante: resultado.numeroComprobante,
      pdfUrl: resultado.pdfUrl,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { exito: false, error: message }
  }
}
