// app/api/submissions/swiss-medical/periods/route.ts
import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { isSwissMedicalPrepaga } from '@/lib/swissCxBuild'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const OBRA_SOCIAL = 'swiss_medical'

/**
 * Cuenta solo liquidaciones que realmente pueden entrar en la planilla mensual
 * (mismo criterio que buildSwissRowsForPeriod: extracción + documento enlazados).
 */
export async function GET() {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: rows, error: liqErr } = await supabaseAdmin
    .from('liquidaciones')
    .select(
      `
      periodo,
      prepaga,
      ai_extractions!inner (
        id,
        documents!inner (
          id
        )
      )
    `,
    )
    .eq('clerk_user_id', userId)
    .eq('estado', 'pendiente')
    .not('periodo', 'is', null)

  if (liqErr) {
    console.error('[TRAZA] periods:fetch_liqs_error', liqErr)
    return NextResponse.json({ error: liqErr.message }, { status: 500 })
  }

  const counts = new Map<string, number>()
  for (const l of rows ?? []) {
    if (!l.periodo || !isSwissMedicalPrepaga(l.prepaga)) continue
    counts.set(l.periodo, (counts.get(l.periodo) ?? 0) + 1)
  }

  const { data: subs, error: subErr } = await supabaseAdmin
    .from('monthly_submissions')
    .select('periodo, status, enviado_en')
    .eq('clerk_user_id', userId)
    .eq('obra_social', OBRA_SOCIAL)

  if (subErr) {
    console.error('[TRAZA] periods:fetch_subs_error', subErr)
    return NextResponse.json({ error: subErr.message }, { status: 500 })
  }

  const subByPeriodo = new Map<string, { status: string; enviado_en: string | null }>()
  for (const s of subs ?? []) {
    const prev = subByPeriodo.get(s.periodo)
    const rank = (st: string) =>
      st === 'enviado' ? 3 : st === 'enviando' ? 2 : st === 'fallido' ? 1 : 0
    if (!prev || rank(s.status) > rank(prev.status)) {
      subByPeriodo.set(s.periodo, { status: s.status, enviado_en: s.enviado_en })
    }
  }

  const allPeriodos = new Set<string>([...counts.keys(), ...subByPeriodo.keys()])
  const periods = [...allPeriodos]
    .sort((a, b) => b.localeCompare(a))
    .map((p) => {
      const sub = subByPeriodo.get(p)
      return {
        periodo: p,
        cantidad_pendientes: counts.get(p) ?? 0,
        ya_enviado: sub?.status === 'enviado',
        enviado_en: sub?.enviado_en ?? null,
        status_envio: sub?.status ?? null,
      }
    })

  return NextResponse.json({ periods })
}
