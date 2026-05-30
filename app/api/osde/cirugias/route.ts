// app/api/osde/cirugias/route.ts
//
// GET:  lista las cirugías OSDE del usuario (para el dashboard), sin las descartadas.
// POST: crea una cirugía nueva para arrancar el cobro. Opcionalmente la asocia a un
//       parte (document_id) y precarga paciente/afiliado/fecha/monto.
//
// Aditivo: tabla osde_cirugias. No toca nada de Swiss.

import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COLUMNS = `
  id, document_id, paciente, afiliado, fecha_cirugia, monto_estimado,
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

  // Normalizar fecha a YYYY-MM-DD (la IA puede devolver DD/MM/YYYY, DD/MM/YY, etc.)
  const parseDate = (v: unknown): string | null => {
    const s = str(v);
    if (!s) return null;
    // Ya es YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    // DD/MM/YYYY
    const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m1) return `${m1[3]}-${m1[2].padStart(2,'0')}-${m1[1].padStart(2,'0')}`;
    // DD/MM/YY
    const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
    if (m2) return `20${m2[3]}-${m2[2].padStart(2,'0')}-${m2[1].padStart(2,'0')}`;
    return null; // formato no reconocido, no insertar basura
  };

  const insert = {
    clerk_user_id: userId,
    document_id: str(body.document_id),
    paciente: str(body.paciente),
    afiliado: str(body.afiliado),
    fecha_cirugia: parseDate(body.fecha_cirugia), // 'YYYY-MM-DD'
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
