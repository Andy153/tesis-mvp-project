// lib/swissCxSend.ts
import { readFile } from 'fs/promises'
import path from 'path'
import { Resend } from 'resend'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { generateSwissCxFiles } from '@/lib/swissCxExport'
import { buildSwissRowsForPeriod, type ParteInfo } from '@/lib/swissCxBuild'

export const OBRA_SOCIAL = 'swiss_medical'
const BUCKET_DOCUMENTOS = 'documentos-medicos'
const BUCKET_SUBMISSIONS = 'submissions'
export const MAIL_TO = 'tesisgrupo2026@gmail.com'
export const MAIL_FROM = 'onboarding@resend.dev'
const MAX_ATTACHMENTS_BYTES = 35 * 1024 * 1024

export type SendResult =
  | {
      ok: true
      submission_id: string
      resend_message_id: string | null
      cantidad_partes: number
      partes_sin_pdf: { document_id: string; paciente: string | null; storage_path: string | null }[]
      xlsx_path: string
    }
  | { skipped: true; reason: string; status: number; submission_id?: string }
  | { error: true; message: string; status: number; submission_id?: string }

function periodoToLabel(periodo: string): string {
  const [y, m] = periodo.split('-').map((n) => parseInt(n, 10))
  if (!y || !m) return periodo
  const meses = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ]
  return `${meses[m - 1]} ${y}`
}

function buildEmailHtml(args: {
  periodo: string
  cantidadPartes: number
  partes: ParteInfo[]
  partesSinPdf: ParteInfo[]
}): string {
  const label = periodoToLabel(args.periodo)
  const filas = args.partes
    .map(
      (p) => `
        <tr>
          <td style="padding:6px 10px;border:1px solid #e0e0e0;">${p.paciente ?? '—'}</td>
          <td style="padding:6px 10px;border:1px solid #e0e0e0;">${p.fecha_practica ?? '—'}</td>
        </tr>`,
    )
    .join('')
  const sinPdfBlock =
    args.partesSinPdf.length > 0
      ? `<p style="color:#a06000;font-size:13px;margin-top:16px;">⚠️ ${args.partesSinPdf.length} parte(s) en planilla sin PDF adjunto.</p>`
      : ''
  return `<!doctype html>
<html><body style="font-family:Arial,sans-serif;color:#1c1c1c;">
  <h2 style="color:#1f5d3a;">Liquidación Swiss Medical — ${label}</h2>
  <p>Adjuntamos la planilla y los partes quirúrgicos correspondientes a <strong>${label}</strong>.</p>
  <p><strong>Cantidad de partes:</strong> ${args.cantidadPartes}</p>
  <table style="border-collapse:collapse;font-size:14px;margin-top:8px;">
    <thead><tr style="background:#f0f5f1;">
      <th style="padding:6px 10px;border:1px solid #e0e0e0;text-align:left;">Paciente</th>
      <th style="padding:6px 10px;border:1px solid #e0e0e0;text-align:left;">Fecha práctica</th>
    </tr></thead>
    <tbody>${filas}</tbody>
  </table>
  ${sinPdfBlock}
  <p style="color:#666;font-size:12px;margin-top:24px;">Enviado automáticamente por Trazá.</p>
</body></html>`
}

function sanitizeFilename(s: string): string {
  return s.replace(/[^\w.\- ]/g, '_').slice(0, 80)
}

export async function sendSwissMonthlyForUser(
  userId: string,
  periodo: string,
): Promise<SendResult> {
  if (!/^\d{4}-\d{2}$/.test(periodo)) {
    return { error: true, message: 'Formato periodo inválido', status: 400 }
  }

  const resendApiKey = process.env.RESEND_API_KEY
  if (!resendApiKey) {
    console.error('[TRAZA] sendSwiss:missing_resend_key')
    return { error: true, message: 'Configuración de mail incompleta.', status: 500 }
  }

  // PASO 1: Reservar slot
  const { data: existing, error: existingErr } = await supabaseAdmin
    .from('monthly_submissions')
    .select('id, status, resend_message_id, enviado_en')
    .eq('clerk_user_id', userId)
    .eq('periodo', periodo)
    .eq('obra_social', OBRA_SOCIAL)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingErr) {
    console.error('[TRAZA] sendSwiss:check_existing_error', existingErr)
    return { error: true, message: existingErr.message, status: 500 }
  }

  let submissionId: string

  if (existing) {
    if (existing.status === 'enviado') {
      return {
        skipped: true,
        reason: 'Ya enviado',
        status: 409,
        submission_id: existing.id,
      }
    }
    if (existing.status === 'enviando') {
      return {
        skipped: true,
        reason: 'Envío en curso',
        status: 409,
        submission_id: existing.id,
      }
    }
    const { error: promoteErr } = await supabaseAdmin
      .from('monthly_submissions')
      .update({ status: 'enviando', error_message: null, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .eq('status', existing.status)
    if (promoteErr) {
      console.error('[TRAZA] sendSwiss:promote_error', promoteErr)
      return { error: true, message: 'No se pudo iniciar el envío.', status: 409 }
    }
    submissionId = existing.id
  } else {
    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from('monthly_submissions')
      .insert({
        clerk_user_id: userId,
        obra_social: OBRA_SOCIAL,
        periodo,
        status: 'enviando',
        mail_destinatario: MAIL_TO,
        mail_remitente: MAIL_FROM,
      })
      .select('id')
      .single()
    if (insertErr || !inserted) {
      console.error('[TRAZA] sendSwiss:insert_error', insertErr)
      return { error: true, message: 'No se pudo iniciar el envío.', status: 409 }
    }
    submissionId = inserted.id
  }

  const markFailed = async (msg: string) => {
    await supabaseAdmin
      .from('monthly_submissions')
      .update({ status: 'fallido', error_message: msg, updated_at: new Date().toISOString() })
      .eq('id', submissionId)
  }

  try {
    // PASO 2: Build rows
    const built = await buildSwissRowsForPeriod(userId, periodo)
    if (built.ok === false) {
      await markFailed(built.error)
      return {
        error: true,
        message: built.error,
        status: built.status,
        submission_id: submissionId,
      }
    }
    const { rows, partes } = built

    // PASO 3: Excel
    const templatePath = path.join(process.cwd(), 'templates', 'planilla cx swiss.xlsx')
    let templateXlsx: Buffer
    try {
      templateXlsx = await readFile(templatePath)
    } catch (e) {
      console.error('[TRAZA] sendSwiss:template_read_error', e)
      await markFailed('No se pudo leer el template de la planilla.')
      return {
        error: true,
        message: 'No se pudo leer el template de la planilla.',
        status: 500,
        submission_id: submissionId,
      }
    }
    const templateAB = templateXlsx.buffer.slice(
      templateXlsx.byteOffset,
      templateXlsx.byteOffset + templateXlsx.byteLength,
    ) as ArrayBuffer
    const { xlsx } = await generateSwissCxFiles({ templateXlsx: templateAB, rows })
    const xlsxBuffer = Buffer.from(xlsx)

    // PASO 4: PDFs
    const pdfsAdjuntos: { filename: string; content: Buffer }[] = []
    const partesSinPdf: ParteInfo[] = []
    let totalBytes = xlsxBuffer.length

    for (const p of partes) {
      if (!p.storage_path) {
        partesSinPdf.push(p)
        continue
      }
      const { data: blob, error: dlErr } = await supabaseAdmin.storage
        .from(BUCKET_DOCUMENTOS)
        .download(p.storage_path)
      if (dlErr || !blob) {
        console.warn('[TRAZA] sendSwiss:pdf_download_failed', {
          document_id: p.document_id,
          storage_path: p.storage_path,
          error: dlErr?.message,
        })
        partesSinPdf.push(p)
        continue
      }
      const buf = Buffer.from(await blob.arrayBuffer())
      const baseName = sanitizeFilename(p.paciente || p.nombre_archivo || `parte_${p.document_id}`)
      if (totalBytes + buf.length > MAX_ATTACHMENTS_BYTES) {
        console.warn('[TRAZA] sendSwiss:size_limit_reached')
        partesSinPdf.push(p)
        continue
      }
      totalBytes += buf.length
      pdfsAdjuntos.push({ filename: `${baseName}.pdf`, content: buf })
    }

    // PASO 5: Subir xlsx
    const xlsxPath = `${userId}/${periodo}.xlsx`
    const { error: upErr } = await supabaseAdmin.storage
      .from(BUCKET_SUBMISSIONS)
      .upload(xlsxPath, xlsxBuffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        upsert: true,
      })
    if (upErr) {
      console.error('[TRAZA] sendSwiss:upload_xlsx_error', upErr)
      await markFailed(`Error subiendo planilla: ${upErr.message}`)
      return {
        error: true,
        message: `Error subiendo planilla: ${upErr.message}`,
        status: 500,
        submission_id: submissionId,
      }
    }

    // PASO 6: Resend
    const resend = new Resend(resendApiKey)
    const sendResult = await resend.emails.send({
      from: MAIL_FROM,
      to: [MAIL_TO],
      replyTo: MAIL_TO,
      subject: `[Trazá] Liquidación Swiss Medical - ${periodoToLabel(periodo)}`,
      html: buildEmailHtml({ periodo, cantidadPartes: rows.length, partes, partesSinPdf }),
      attachments: [
        { filename: `liquidacion_swiss_${periodo}.xlsx`, content: xlsxBuffer },
        ...pdfsAdjuntos,
      ],
    })

    if (sendResult.error) {
      console.error('[TRAZA] sendSwiss:resend_error', sendResult.error)
      await markFailed(`Error enviando mail: ${sendResult.error.message}`)
      return {
        error: true,
        message: `Error enviando mail: ${sendResult.error.message}`,
        status: 500,
        submission_id: submissionId,
      }
    }

    const resendMessageId = sendResult.data?.id ?? null

    // PASO 7: Marcar enviado
    const partesIncluidos = partes.map((p) => ({
      extraction_id: p.extraction_id,
      document_id: p.document_id,
      liquidacion_id: p.liquidacion_id,
      paciente: p.paciente,
      fecha_practica: p.fecha_practica,
      pdf_adjunto: !partesSinPdf.some((sp) => sp.document_id === p.document_id),
    }))

    const { error: finalErr } = await supabaseAdmin
      .from('monthly_submissions')
      .update({
        status: 'enviado',
        enviado_en: new Date().toISOString(),
        cantidad_partes: rows.length,
        xlsx_path: xlsxPath,
        resend_message_id: resendMessageId,
        partes_incluidos: partesIncluidos,
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', submissionId)

    if (finalErr) {
      console.error('[TRAZA] sendSwiss:final_update_error_after_send', {
        submissionId,
        resendMessageId,
        error: finalErr,
      })
    }

    return {
      ok: true,
      submission_id: submissionId,
      resend_message_id: resendMessageId,
      cantidad_partes: rows.length,
      partes_sin_pdf: partesSinPdf.map((p) => ({
        document_id: p.document_id,
        paciente: p.paciente,
        storage_path: p.storage_path,
      })),
      xlsx_path: xlsxPath,
    }
  } catch (e: any) {
    console.error('[TRAZA] sendSwiss:unexpected_error', e)
    await markFailed(`Error inesperado: ${e?.message ?? 'unknown'}`)
    return {
      error: true,
      message: `Error inesperado: ${e?.message ?? 'unknown'}`,
      status: 500,
      submission_id: submissionId,
    }
  }
}

