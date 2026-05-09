import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getLiquidacionesFromDB, upsertLiquidacionToDB } from '@/lib/history-db'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(req: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const estadoRevision = url.searchParams.get('estado_revision')
  const documentId = url.searchParams.get('document_id')

  if (!estadoRevision && !documentId) {
    const liquidaciones = await getLiquidacionesFromDB(userId)
    return NextResponse.json({ liquidaciones })
  }

  let query = supabaseAdmin
    .from('liquidaciones')
    .select(`
      *,
      ai_extractions (
        id,
        paciente,
        codigo_nomenclador,
        descripcion_practica,
        fecha_practica,
        sanatorio,
        prepaga,
        datos_extras
      )
    `)
    .eq('clerk_user_id', userId)
    .order('created_at', { ascending: false })

  if (estadoRevision) {
    const parts = estadoRevision.split(',').map((s) => s.trim()).filter(Boolean)
    if (parts.length) query = query.in('estado_revision', parts)
  }
  if (documentId) {
    query = query.eq('document_id', documentId)
  }

  const { data, error } = await query
  if (error) {
    console.error('Error fetching liquidaciones (filtered):', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ liquidaciones: data ?? [] })
}

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const result = await upsertLiquidacionToDB(userId, body)
  if (!result) return NextResponse.json({ error: 'Error al guardar' }, { status: 500 })
  return NextResponse.json({ liquidacion: result })
}
