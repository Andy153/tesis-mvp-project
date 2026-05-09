import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { sendSwissMonthlyForUser } from '@/lib/swissCxSend'

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
  return NextResponse.json(result)
}

