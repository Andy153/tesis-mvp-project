import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getArcaCertStatus } from '@/lib/arca/profile-certs'

export async function GET() {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const status = await getArcaCertStatus(userId)
  return NextResponse.json({
    ...status,
    ready: status.hasKey && status.hasCert,
  })
}
