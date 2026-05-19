import { auth } from '@clerk/nextjs/server'
import { getTicketAcceso } from '@/lib/arca/client'
import { readUserCertPem, readUserKeyPem } from '@/lib/arca/profile-certs'
import { getProfileFiscalFromDB } from '@/lib/profile-db'
import { NextResponse } from 'next/server'

export async function GET() {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const profile = await getProfileFiscalFromDB(userId)
    const certPem = await readUserCertPem(userId)
    const keyPem = await readUserKeyPem(userId)
    const ticket = await getTicketAcceso('wsfe', {
      cuit: profile.cuit,
      certPem,
      keyPem,
      ambiente: profile.ambiente,
    })
    return NextResponse.json({
      ok: true,
      token: ticket.token.slice(0, 20) + '...',
      expiresAt: ticket.expiresAt,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
