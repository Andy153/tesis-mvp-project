// app/api/osde/cirugias/route.ts
//
// GET:  lista las cirugías OSDE del usuario (para el dashboard), sin las descartadas.
// POST: crea una cirugía nueva para arrancar el cobro. Opcionalmente la asocia a un
//       parte (ai_extraction_id) y precarga paciente/afiliado/fecha/monto.
//
// Aditivo: tabla osde_cirugias. No toca nada de Swiss.

import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COLUMNS = `
  id, ai_extraction_id, paciente, afiliado, fecha_cirugia, monto_estimado,
  wizard_paso, wizard_estado, resultado_consulta, created_at, updated_at
`;

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from('osde_cirugias')
    .select(COLUMNS)
    .eq('clerk_user_id', userId)
    .neq('wizard_estado', 'descartado')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cirugias: data ?? [] });
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // cuerpo vacío permitido: se puede crear una cirugía en blanco
  }

  const num = (v: unknown) =>
    v != null && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : null;
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

  const insert = {
    clerk_user_id: userId,
    ai_extraction_id: str(body.ai_extraction_id),
    paciente: str(body.paciente),
    afiliado: str(body.afiliado),
    fecha_cirugia: str(body.fecha_cirugia), // 'YYYY-MM-DD'
    monto_estimado: num(body.monto_estimado),
    wizard_paso: 1,
    wizard_estado: 'en_curso',
    
  };

  const { data, error } = await supabaseAdmin
    .from('osde_cirugias')
    .insert(insert)
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}
