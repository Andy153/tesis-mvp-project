import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { fetchCobrosEvolucionForUser } from '@/lib/cobros-centro-evolucion';
import { cobrosMesKeys } from '@/lib/cobros-mes-opciones';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const points = await fetchCobrosEvolucionForUser(userId, cobrosMesKeys());
    return NextResponse.json({ points });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al cargar evolución';
    console.warn('[TRAZA] cobros_centro:evolucion_error', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
