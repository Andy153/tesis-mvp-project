// app/api/submissions/active/route.ts
//
// GET: devuelve submissions con wizard activo (status='enviado', wizard no completado)
// Usado por el badge del sidebar y el banner del dashboard.

import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { filterSubmissionsWithLiveLiquidaciones } from '@/lib/monthlySubmissions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
    .eq('clerk_user_id', userId)
    .eq('status', 'enviado')
    .or('wizard_estado.is.null,wizard_estado.not.in.(aprobado,excepcion_enviada,descartado)')
    .order('enviado_en', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const active = await filterSubmissionsWithLiveLiquidaciones(userId, data ?? []);

  return NextResponse.json({ submissions: active });
}
