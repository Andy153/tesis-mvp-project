import { supabaseAdmin } from '@/lib/supabase-admin'

type SubmissionWithPartes = {
  partes_incluidos?: unknown
  cantidad_partes?: number | null
}

export function includedLiquidacionIds(submission: SubmissionWithPartes): string[] {
  const partes = submission.partes_incluidos
  if (!Array.isArray(partes)) return []

  return Array.from(
    new Set(
      partes
        .map((p) => (p && typeof p === 'object' ? (p as any).liquidacion_id : null))
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  )
}

export async function filterSubmissionsWithLiveLiquidaciones<T extends SubmissionWithPartes>(
  userId: string,
  submissions: T[] | null | undefined,
): Promise<T[]> {
  const rows = submissions ?? []
  const ids = Array.from(new Set(rows.flatMap((s) => includedLiquidacionIds(s))))

  // Envíos sin partes vinculadas (0 partes o JSON vacío): no mostrar wizard de cobros.
  if (ids.length === 0) {
    return rows.filter((s) => {
      const n = s.cantidad_partes
      return n != null && n > 0
    })
  }

  const { data, error } = await supabaseAdmin
    .from('liquidaciones')
    .select('id')
    .eq('clerk_user_id', userId)
    .in('id', ids)

  if (error) {
    console.warn('[TRAZA] monthlySubmissions:live_liqs_check_failed', error.message)
    return rows
  }

  const live = new Set((data ?? []).map((r) => r.id as string))

  return rows.filter((s) => {
    const ownIds = includedLiquidacionIds(s)
    if (ownIds.length === 0) return true
    return ownIds.some((id) => live.has(id))
  })
}
