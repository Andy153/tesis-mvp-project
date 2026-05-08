import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getProfileFromDB, upsertProfileToDB } from '@/lib/profile-db'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const profile = await getProfileFromDB(userId)
  return NextResponse.json({ profile })
}

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { nombre, matricula, especialidad, prepagas } = body

  const updated = await upsertProfileToDB(userId, {
    nombre,
    matricula,
    especialidad,
    prepagas,
  })

  return NextResponse.json({ profile: updated })
}
