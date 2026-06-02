import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { fetchCobrosCentroForUser } from '@/lib/cobros-centro';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const mes = req.nextUrl.searchParams.get('mes')?.trim() ?? '';
  if (!/^\d{4}-\d{2}$/.test(mes)) {
    return NextResponse.json({ error: 'Parámetro mes inválido (YYYY-MM)' }, { status: 400 });
  }

  try {
    const items = await fetchCobrosCentroForUser(userId, mes);
    return NextResponse.json({ mes, items });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al cargar cobros';
    console.warn('[TRAZA] cobros_centro:get_error', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
