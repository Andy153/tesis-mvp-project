import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { isDemoUser } from '@/lib/demo-user';
import { syncAccionCobros } from '@/lib/notifications-generate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Actualiza avisos de seguimiento de cobro (in-app, sin push). Llamar en background desde Avisos. */
export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (isDemoUser(userId)) {
    return NextResponse.json({ ok: true, skipped: 'demo' });
  }

  try {
    await syncAccionCobros(userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.warn(
      '[TRAZA] notifications:sync_cobros_failed',
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: 'Error al sincronizar cobros' }, { status: 500 });
  }
}
