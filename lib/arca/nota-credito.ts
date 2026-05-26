import { getProfileFiscalFromDB } from '@/lib/profile-db'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { consultarPadron } from './padron'
import {
  createFacturaSignedUrl,
  crearSubmissionParaReemisionPostNC,
  formatCaeVencimientoForDb,
  insertNotaCreditoSubmission,
  marcarFacturaComoAnulada,
  notaCreditoStoragePath,
  uploadFacturaPdf,
  type ReceptorPersistible,
} from './factura-storage'
import { syncWorkflowFromSubmission } from '@/lib/workflow-processes'
import { generarPDFNotaCreditoC } from './pdf-nota-credito'
import {
  buildWsfeContext,
  CBTE_TIPO_FACTURA_C,
  CBTE_TIPO_NOTA_CREDITO_C,
  getProximoNumeroComprobante,
  solicitarCaeWSFE,
} from './wsfe-client'

const CONDICION_IVA_LABELS: Record<number, string> = {
  1: 'IVA Responsable Inscripto',
  4: 'IVA Sujeto Exento',
  5: 'Consumidor Final',
  6: 'Responsable Monotributo',
  7: 'Sujeto no Categorizado',
  8: 'Proveedor del Exterior',
  9: 'Cliente del Exterior',
  10: 'IVA Liberado - Ley 19640',
  13: 'Monotributista Social',
  15: 'IVA No Alcanzado',
  16: 'Monotributo Trabajador Independiente Promovido',
}

export interface EmitirNotaCreditoCParams {
  clerkUserId: string
  /** Submission ID de la factura original a anular. */
  submissionAnuladaId: string
  /** Motivo opcional del médico (no se envía a ARCA, solo se guarda). */
  motivo?: string | null
}

interface FacturaOriginal {
  id: string
  obra_social: string
  periodo: string
  monto_total: number
  mail_destinatario: string
  tipo_comprobante: number
  numero_comprobante: number
  cae_numero: string
  cae_vencimiento: string
  receptor_cuit: string | null
  receptor_razon_social: string | null
  receptor_condicion_iva_id: number | null
  submission_anulada_id: string | null
}

function todayYYYYMMDD(): number {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return parseInt(`${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`, 10)
}

/**
 * Lee la factura original desde DB y valida que sea elegible para NC.
 *
 * Validaciones:
 *   - existe y pertenece al usuario
 *   - es una factura (tipo 11), no una NC (tipo 13) — no hay NC sobre NC
 *   - tiene CAE asignado (fue emitida exitosamente)
 *   - tiene numero_comprobante (sino no podemos referenciarla en CbtesAsoc)
 *   - no fue ya anulada por otra NC previa
 */
async function leerFacturaOriginal(
  submissionAnuladaId: string,
  clerkUserId: string,
): Promise<FacturaOriginal> {
  const { data, error } = await supabaseAdmin
    .from('monthly_submissions')
    .select(
      `id, obra_social, periodo, monto_total, mail_destinatario,
       tipo_comprobante, numero_comprobante, cae_numero, cae_vencimiento,
       receptor_cuit, receptor_razon_social, receptor_condicion_iva_id,
       submission_anulada_id`,
    )
    .eq('id', submissionAnuladaId)
    .eq('clerk_user_id', clerkUserId)
    .single()

  if (error || !data) {
    throw new Error('No se encontró la factura original.')
  }

  if (data.tipo_comprobante === CBTE_TIPO_NOTA_CREDITO_C) {
    throw new Error('No se puede emitir una Nota de Crédito sobre otra Nota de Crédito.')
  }

  if (data.tipo_comprobante !== CBTE_TIPO_FACTURA_C) {
    throw new Error(
      `Tipo de comprobante no soportado para NC: ${data.tipo_comprobante}. Solo se soportan Facturas C (11).`,
    )
  }

  if (!data.cae_numero) {
    throw new Error('La factura original no tiene CAE. No se puede emitir NC.')
  }

  if (data.numero_comprobante == null) {
    throw new Error(
      'La factura original no tiene número de comprobante guardado. Es una factura anterior al Sprint 5; contactar soporte para emitir NC sobre ella.',
    )
  }

  if (data.monto_total == null) {
    throw new Error('La factura original no tiene monto total registrado.')
  }

  // Verificar que no haya ya una NC sobre esta factura
  const { data: ncExistente, error: errNc } = await supabaseAdmin
    .from('monthly_submissions')
    .select('id')
    .eq('clerk_user_id', clerkUserId)
    .eq('submission_anulada_id', submissionAnuladaId)
    .eq('tipo_comprobante', CBTE_TIPO_NOTA_CREDITO_C)
    .maybeSingle()

  if (errNc) {
    throw new Error(`No se pudo verificar si la factura ya fue anulada: ${errNc.message}`)
  }
  if (ncExistente) {
    throw new Error('Esta factura ya tiene una Nota de Crédito asociada.')
  }

  return data as FacturaOriginal
}

/**
 * Resuelve los datos del receptor para la NC.
 * Estrategia preferida: heredarlos de la factura original (Sprint 5+).
 * Fallback: re-consultar padrón si la factura es legacy y no los tiene guardados.
 */
async function resolverReceptorParaNC(
  facturaOriginal: FacturaOriginal,
  ctx: {
    cuitEmisor: string
    certPem: string
    keyPem: string
    ambiente: 'desarrollo' | 'produccion'
  },
): Promise<ReceptorPersistible> {
  // Caso normal (Sprint 5+): los datos están en la factura original
  if (
    facturaOriginal.receptor_razon_social != null &&
    facturaOriginal.receptor_condicion_iva_id != null
  ) {
    return {
      cuit: facturaOriginal.receptor_cuit, // puede ser null para Consumidor Final
      razonSocial: facturaOriginal.receptor_razon_social,
      condicionIVAId: facturaOriginal.receptor_condicion_iva_id,
    }
  }

  // Fallback legacy: factura pre-Sprint 5, sin receptor guardado.
  // Si no tenía CUIT, asumimos Consumidor Final.
  if (!facturaOriginal.receptor_cuit) {
    return {
      cuit: null,
      razonSocial: 'Consumidor Final',
      condicionIVAId: 5,
    }
  }

  // Tenía CUIT pero no condición IVA → re-consultamos padrón.
  const padron = await consultarPadron(facturaOriginal.receptor_cuit, {
    cuitRepresentada: ctx.cuitEmisor,
    certPem: ctx.certPem,
    keyPem: ctx.keyPem,
    ambiente: ctx.ambiente,
  })
  return {
    cuit: facturaOriginal.receptor_cuit.replace(/\D/g, ''),
    razonSocial: padron.razonSocial || 'Consumidor Final',
    condicionIVAId: padron.condicionIVACodigo,
  }
}

export async function emitirNotaCreditoC(params: EmitirNotaCreditoCParams): Promise<{
  notaCreditoId: string
  cae: string
  caeVencimiento: string
  numeroComprobante: number
  fechaEmision: string
  pdfPath: string
  pdfUrl: string
}> {
  // --- 1) Leer factura original y validar ---
  const facturaOriginal = await leerFacturaOriginal(
    params.submissionAnuladaId,
    params.clerkUserId,
  )

  // --- 2) Leer perfil del emisor ---
  const profile = await getProfileFiscalFromDB(params.clerkUserId)

  // --- 3) Cert/key para padrón (si hace falta fallback) ---
  const { readUserCertPem, readUserKeyPem } = await import('./profile-certs')
  const certPem = await readUserCertPem(params.clerkUserId)
  const keyPem = await readUserKeyPem(params.clerkUserId)

  // --- 4) Resolver receptor (heredar o fallback a padrón) ---
  const receptor = await resolverReceptorParaNC(facturaOriginal, {
    cuitEmisor: profile.cuit,
    certPem,
    keyPem,
    ambiente: profile.ambiente,
  })

  // --- 5) Contexto WSFE ---
  const ctx = await buildWsfeContext(params.clerkUserId, {
    cuit: profile.cuit,
    puntoVenta: profile.puntoVenta,
    ambiente: profile.ambiente,
  })

  // --- 6) Fechas y monto ---
  const cbteFch = todayYYYYMMDD()
  const fechaEmision = String(cbteFch)
  const monto = Number(facturaOriginal.monto_total)

  const docTipo = receptor.cuit ? 80 : 99
  const docNro = receptor.cuit ? parseInt(receptor.cuit, 10) : 0

  // --- 7) Próximo número de NC C ---
  const nextNumber = await getProximoNumeroComprobante(ctx, CBTE_TIPO_NOTA_CREDITO_C)

  // --- 8) Armar FECAERequest con CbtesAsoc ---
  // Para NC: Concepto 1 (productos) o 2 (servicios) — usamos 2 igual que factura.
  // FchServDesde/Hasta y FchVtoPago se incluyen porque Concepto != 1.
  // CbtesAsoc apunta a la factura original (tipo 11, mismo PV, mismo número).
  const feCAEReq = {
    FeCabReq: {
      CantReg: 1,
      PtoVta: profile.puntoVenta,
      CbteTipo: CBTE_TIPO_NOTA_CREDITO_C,
    },
    FeDetReq: {
      FECAEDetRequest: [
        {
          Concepto: 2,
          DocTipo: docTipo,
          DocNro: docNro,
          CondicionIVAReceptorId: receptor.condicionIVAId,
          CbteDesde: nextNumber,
          CbteHasta: nextNumber,
          CbteFch: cbteFch,
          ImpTotal: monto,
          ImpTotConc: 0,
          ImpNeto: monto,
          ImpOpEx: 0,
          ImpIVA: 0,
          ImpTrib: 0,
          FchServDesde: cbteFch,
          FchServHasta: cbteFch,
          FchVtoPago: cbteFch,
          MonId: 'PES',
          MonCotiz: 1,
          CbtesAsoc: {
            CbteAsoc: [
              {
                Tipo: facturaOriginal.tipo_comprobante,
                PtoVta: profile.puntoVenta,
                Nro: facturaOriginal.numero_comprobante,
                Cuit: profile.cuit.replace(/\D/g, ''),
              },
            ],
          },
        },
      ],
    },
  }

  // --- 9) Solicitar CAE ---
  const { cae, caeVencimiento, numeroComprobante } = await solicitarCaeWSFE(ctx, feCAEReq)

  // --- 10) Generar PDF ---
  const condicionIVALabel =
    CONDICION_IVA_LABELS[receptor.condicionIVAId] ??
    `Condición IVA ${receptor.condicionIVAId}`

  const pdfBuffer = await generarPDFNotaCreditoC({
    emisor: {
      razonSocial: profile.razonSocial,
      cuit: profile.cuit,
      condicionIVA: profile.condicionIVA,
      domicilio: profile.domicilioFiscal,
      puntoVenta: profile.puntoVenta,
    },
    receptor: {
      cuit: receptor.cuit || '0',
      razonSocial: receptor.razonSocial,
      condicionIVA: condicionIVALabel,
    },
    comprobanteAsociado: {
      tipo: facturaOriginal.tipo_comprobante,
      puntoVenta: profile.puntoVenta,
      numero: facturaOriginal.numero_comprobante,
      fechaEmision: fechaEmision, // aproximación: hoy. Mejora futura: persistir fecha original.
      cae: facturaOriginal.cae_numero,
    },
    notaCredito: {
      numero: numeroComprobante,
      fechaEmision,
      periodoDesde: fechaEmision,
      periodoHasta: fechaEmision,
      descripcion: `Anulación de Factura C correspondiente al período ${facturaOriginal.periodo}`,
      monto,
      cae,
      caeVencimiento,
      tipoDocRec: docTipo,
      nroDocRec: docNro,
      motivo: params.motivo ?? null,
    },
  })

  // --- 11) Subir PDF al storage ---
  const pdfPath = notaCreditoStoragePath(
    params.clerkUserId,
    facturaOriginal.periodo,
    numeroComprobante,
  )
  await uploadFacturaPdf(pdfPath, pdfBuffer)

  // --- 12) Persistir NC como nueva submission ---
  const caeVencimientoDb = formatCaeVencimientoForDb(caeVencimiento)
  const { id: notaCreditoId } = await insertNotaCreditoSubmission({
    clerkUserId: params.clerkUserId,
    submissionAnuladaId: facturaOriginal.id,
    motivoAnulacion: params.motivo ?? null,
    obraSocial: facturaOriginal.obra_social,
    periodo: facturaOriginal.periodo,
    montoTotal: monto,
    mailDestinatario: facturaOriginal.mail_destinatario,
    caeNumero: cae,
    caeVencimiento: caeVencimientoDb,
    numeroComprobante,
    ncPath: pdfPath,
    receptor,
  })

  // --- 12.5) Marcar la factura original como anulada (Sprint 6) ---
  // Best-effort: si falla, la NC ya está OK, solo perdemos el flag de auditoría.
  // Importante: se hace ANTES de crear la nueva submission para que el unique
  // index parcial (Sprint 7 mig 011: WHERE anulada_at IS NULL) ya no cuente a
  // esta fila como activa.
  await marcarFacturaComoAnulada({
    submissionId: facturaOriginal.id,
    clerkUserId: params.clerkUserId,
  })

  // --- 12.6) Crear submission nueva para re-emisión (Sprint 7) ---
  // Antes (Sprint 6) reusábamos la misma fila, limpiándole los datos fiscales.
  // Eso generaba estado contradictorio y abría la puerta a bugs cuando el
  // wizard apuntaba mal. Ahora creamos una fila nueva tipo=11 limpia.
  const submissionReemision = await crearSubmissionParaReemisionPostNC({
    submissionAnuladaId: facturaOriginal.id,
    clerkUserId: params.clerkUserId,
  })
  if (submissionReemision) {
    await syncWorkflowFromSubmission(submissionReemision, params.clerkUserId)
  }

  // --- 13) URL firmada para descarga inmediata ---
  const pdfUrl = await createFacturaSignedUrl(pdfPath)

  return {
    notaCreditoId,
    cae,
    caeVencimiento,
    numeroComprobante,
    fechaEmision,
    pdfPath,
    pdfUrl,
  }
}
