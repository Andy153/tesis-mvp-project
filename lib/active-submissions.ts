import { supabaseAdmin } from '@/lib/supabase-admin';
import { filterSubmissionsWithLiveLiquidaciones } from '@/lib/monthlySubmissions';

export type ActiveSubmission = {
  id: string;
  periodo: string;
  obra_social: string;
  status: string;
  wizard_estado: string | null;
  wizard_paso: number | null;
  enviado_en: string;
  cantidad_partes: number | null;
  factura_adjuntada_en: string | null;
};

/** Un envío activo por período (el más reciente por enviado_en). */
export function dedupeActiveSubmissionsByPeriodo<T extends Pick<ActiveSubmission, 'periodo' | 'enviado_en'>>(
  rows: T[],
): T[] {
  const byPeriodo = new Map<string, T>();
  for (const row of rows) {
    const prev = byPeriodo.get(row.periodo);
    if (!prev || new Date(row.enviado_en).getTime() > new Date(prev.enviado_en).getTime()) {
      byPeriodo.set(row.periodo, row);
    }
  }
  return [...byPeriodo.values()].sort(
    (a, b) => new Date(b.enviado_en).getTime() - new Date(a.enviado_en).getTime(),
  );
}

/** Misma selección que GET /api/submissions/active */
export async function fetchActiveSubmissions(clerkUserId: string): Promise<ActiveSubmission[]> {
  const { data, error } = await supabaseAdmin
    .from('monthly_submissions')
    .select(
      `
      id, periodo, obra_social, status,
      wizard_estado, wizard_paso,
      enviado_en, cantidad_partes,
      factura_adjuntada_en,
      partes_incluidos
    `,
    )
    .eq('clerk_user_id', clerkUserId)
    .eq('status', 'enviado')
    .eq('tipo_comprobante', 11)
    .is('anulada_at', null)
    .or('wizard_estado.is.null,wizard_estado.not.in.(aprobado,excepcion_enviada,descartado)')
    .order('enviado_en', { ascending: false });

  if (error) {
    console.warn('[TRAZA] active_submissions:fetch_error', error.message);
    return [];
  }

  const filtered = await filterSubmissionsWithLiveLiquidaciones(clerkUserId, data ?? []);
  return dedupeActiveSubmissionsByPeriodo(filtered);
}
