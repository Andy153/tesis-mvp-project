// app/api/cron/swiss-medical-monthly/route.ts
//
// Endpoint llamado por Vercel Cron una vez por día.
// En Hobby tier el schedule fino (día 1°) no se respeta, así que internamente
// chequeamos si HOY es día 1° y salimos sin hacer nada en cualquier otro día.
//
// Period a enviar: el mes que recién terminó (opción A).
// Si hoy es 1 de julio 2026 → mando los partes de '2026-06'.

import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { supabaseAdmin } from '@/lib/supabase-admin'
import {
  sendSwissMonthlyForUser,
  OBRA_SOCIAL,
  MAIL_TO,
  MAIL_FROM,
} from '@/lib/swissCxSend'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 min, por si hay muchos users

// Buenos Aires = UTC-3. Convertimos UTC → ART para chequear "día 1" local.
function nowInArgentina(): Date {
  const utc = new Date()
  return new Date(utc.getTime() - 3 * 60 * 60 * 1000)
}

function previousPeriodoART(): string {
  const now = nowInArgentina()
  // Día 1 del mes actual menos un día = último día del mes anterior
  const firstOfThisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const lastOfPrev = new Date(firstOfThisMonth.getTime() - 24 * 60 * 60 * 1000)
  const y = lastOfPrev.getUTCFullYear()
  const m = String(lastOfPrev.getUTCMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

function isDayOneART(): boolean {
  return nowInArgentina().getUTCDate() === 1
}

type RunReport = {
  ok: number
  skipped: number
  failed: number
  details: Array<{
    user_id: string
    status: 'sent' | 'skipped' | 'failed'
    cantidad?: number
    submission_id?: string
    reason?: string
    error?: string
  }>
}

async function sendSummaryEmail(periodo: string, report: RunReport, dryRun: boolean) {
  const resendApiKey = process.env.RESEND_API_KEY
  if (!resendApiKey) {
    console.warn('[TRAZA] cron:summary:no_resend_key')
    return
  }
  const resend = new Resend(resendApiKey)
  const rows = report.details
    .map(
      (d) =>
        `<tr>
          <td style="padding:4px 8px;border:1px solid #e0e0e0;font-family:monospace;font-size:12px;">${d.user_id}</td>
          <td style="padding:4px 8px;border:1px solid #e0e0e0;">${d.status}</td>
          <td style="padding:4px 8px;border:1px solid #e0e0e0;">${d.cantidad ?? '—'}</td>
          <td style="padding:4px 8px;border:1px solid #e0e0e0;font-size:12px;">${d.reason ?? d.error ?? d.submission_id ?? ''}</td>
        </tr>`,
    )
    .join('')

  const subject = dryRun
    ? `[Trazá Cron] Dry run ${periodo} (no es día 1°)`
    : `[Trazá Cron] Resumen liquidación Swiss Medical ${periodo}`

  await resend.emails.send({
    from: MAIL_FROM,
    to: [MAIL_TO],
    subject,
    html: `<!doctype html><html><body style="font-family:Arial,sans-serif;">
      <h2 style="color:#1f5d3a;">Resumen cron Trazá — ${periodo}</h2>
      <p>${dryRun ? 'Ejecución en modo seguimiento (no se envió nada porque no es día 1° en Argentina).' : 'Ejecución del cron mensual.'}</p>
      <p><strong>Enviados:</strong> ${report.ok} · <strong>Skipped:</strong> ${report.skipped} · <strong>Fallidos:</strong> ${report.failed}</p>
      <table style="border-collapse:collapse;font-size:13px;margin-top:8px;">
        <thead><tr style="background:#f0f5f1;">
          <th style="padding:6px 10px;border:1px solid #e0e0e0;text-align:left;">user_id</th>
          <th style="padding:6px 10px;border:1px solid #e0e0e0;text-align:left;">status</th>
          <th style="padding:6px 10px;border:1px solid #e0e0e0;text-align:left;">cantidad</th>
          <th style="padding:6px 10px;border:1px solid #e0e0e0;text-align:left;">detalle</th>
        </tr></thead>
        <tbody>${rows || '<tr><td colspan="4" style="padding:8px;">Sin usuarios procesados.</td></tr>'}</tbody>
      </table>
    </body></html>`,
  })
}

async function handleCron(req: Request) {
  // Validación de secret. Vercel Cron pasa el header Authorization automáticamente.
  const authHeader = req.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('[TRAZA] cron:no_secret_configured')
    return NextResponse.json({ error: 'CRON_SECRET no configurado' }, { status: 500 })
  }
  if (authHeader !== `Bearer ${secret}`) {
    console.warn('[TRAZA] cron:unauthorized', { has_header: !!authHeader })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const periodo = previousPeriodoART()
  const isDay1 = isDayOneART()

  console.log('[TRAZA] cron:start', { periodo, isDay1, now_ar: nowInArgentina().toISOString() })

  // Si no es día 1 en Argentina, seguimiento sin enviar nada.
  if (!isDay1) {
    const report: RunReport = { ok: 0, skipped: 0, failed: 0, details: [] }
    await sendSummaryEmail(periodo, report, true)
    return NextResponse.json({
      ok: true,
      dry_run: true,
      reason: 'No es día 1° en Argentina',
      periodo,
    })
  }

  // Buscar usuarios con liquidaciones pendientes Swiss para el periodo.
  const { data: liqs, error: liqErr } = await supabaseAdmin
    .from('liquidaciones')
    .select('clerk_user_id, prepaga')
    .eq('periodo', periodo)
    .eq('estado', 'pendiente')

  if (liqErr) {
    console.error('[TRAZA] cron:fetch_liqs_error', liqErr)
    return NextResponse.json({ error: liqErr.message }, { status: 500 })
  }

  const swissUserIds = new Set<string>()
  for (const l of liqs ?? []) {
    const p = String(l.prepaga ?? '').toLowerCase().trim()
    if (p.includes('swiss') || p.includes('smg') || p === 'sm') {
      if (l.clerk_user_id) swissUserIds.add(l.clerk_user_id)
    }
  }

  console.log('[TRAZA] cron:users_with_pending', {
    periodo,
    count: swissUserIds.size,
  })

  const report: RunReport = { ok: 0, skipped: 0, failed: 0, details: [] }

  for (const userId of swissUserIds) {
    try {
      const result = await sendSwissMonthlyForUser(userId, periodo)
      if ('error' in result) {
        report.failed += 1
        report.details.push({
          user_id: userId,
          status: 'failed',
          error: result.message,
          submission_id: result.submission_id,
        })
      } else if ('skipped' in result) {
        report.skipped += 1
        report.details.push({
          user_id: userId,
          status: 'skipped',
          reason: result.reason,
          submission_id: result.submission_id,
        })
      } else {
        report.ok += 1
        report.details.push({
          user_id: userId,
          status: 'sent',
          cantidad: result.cantidad_partes,
          submission_id: result.submission_id,
        })
      }
    } catch (e: any) {
      console.error('[TRAZA] cron:user_loop_error', { userId, error: e?.message })
      report.failed += 1
      report.details.push({
        user_id: userId,
        status: 'failed',
        error: e?.message ?? 'unknown',
      })
    }
  }

  console.log('[TRAZA] cron:done', report)

  try {
    await sendSummaryEmail(periodo, report, false)
  } catch (e) {
    console.error('[TRAZA] cron:summary_email_error', e)
  }

  return NextResponse.json({ ok: true, periodo, ...report })
}

// Vercel Cron usa GET por defecto. POST también disponible para tests manuales.
export async function GET(req: Request) {
  return handleCron(req)
}

export async function POST(req: Request) {
  return handleCron(req)
}

