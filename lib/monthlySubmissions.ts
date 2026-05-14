import { supabaseAdmin } from '@/lib/supabase-admin'

type SubmissionWithPartes = {
  partes_incluidos?: unknown
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

  // Legacy submissions without partes_incluidos cannot be checked safely, so keep
  // them. Current submissions always include liquidacion_id per part.
  if (ids.length === 0) return rows

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
