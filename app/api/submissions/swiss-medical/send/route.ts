import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { isDemoUser } from '@/lib/demo-user'
import { upsertDemoMonthlySubmission } from '@/lib/demo-swiss-cobros'
import { sendSwissMonthlyForUser } from '@/lib/swissCxSend'
import { syncAccionCobros } from '@/lib/notifications-generate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { periodo?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const periodo = body.periodo
  if (!periodo || !/^\d{4}-\d{2}$/.test(periodo)) {
    return NextResponse.json(
      { error: 'Falta periodo o formato inválido. Esperado YYYY-MM.' },
      { status: 400 },
    )
  }

  if (isDemoUser(userId)) {
    try {
      const { submission_id, cantidad_partes } = await upsertDemoMonthlySubmission(userId, periodo)
      return NextResponse.json({
        ok: true,
        cantidad_partes,
        submission_id,
        partes_sin_pdf: [],
      })
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Error al registrar envío demo'
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }

  const result = await sendSwissMonthlyForUser(userId, periodo)

  if ('error' in result) {
    return NextResponse.json(
      { error: result.message, submission_id: result.submission_id },
      { status: result.status },
    )
  }
  if ('skipped' in result) {
    return NextResponse.json(
      { error: result.reason, submission_id: result.submission_id },
      { status: result.status },
    )
  }
  await syncAccionCobros(userId)
  return NextResponse.json(result)
}

