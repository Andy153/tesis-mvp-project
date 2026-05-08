import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getLiquidacionesFromDB, upsertLiquidacionToDB } from '@/lib/history-db'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const liquidaciones = await getLiquidacionesFromDB(userId)
  return NextResponse.json({ liquidaciones })
}

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const result = await upsertLiquidacionToDB(userId, body)
  if (!result) return NextResponse.json({ error: 'Error al guardar' }, { status: 500 })
  return NextResponse.json({ liquidacion: result })
}
