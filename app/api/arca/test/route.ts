import { getTicketAcceso } from '@/lib/arca/client'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const ticket = await getTicketAcceso('wsfe')
    return NextResponse.json({ ok: true, token: ticket.token.slice(0, 20) + '...', expiresAt: ticket.expiresAt })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
