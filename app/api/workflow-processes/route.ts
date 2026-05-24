import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Lista procesos de envío iniciados (SMG hoy; OSDE cuando se integre). */
export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabaseAdmin
    .from('workflow_processes')
    .select(
      `
      id,
      obra_social,
      periodo,
      tipo,
      etapa,
      monthly_submission_id,
      metadata,
      started_at,
      updated_at,
      completed_at
    `,
    )
    .eq('clerk_user_id', userId)
    .order('updated_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ processes: data ?? [] })
}
