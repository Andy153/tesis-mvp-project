/**
 * TEMPORAL — testing push en dispositivo (ej. Vercel + celular).
 * GET /api/push/test — inserta aviso de prueba y dispara push al usuario autenticado.
 */
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { isDemoUser } from '@/lib/demo-user';
import { insertNotificationOnce } from '@/lib/notifications';
import { userHasPushSubscription } from '@/lib/push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (isDemoUser(userId)) {
    return NextResponse.json(
      { error: 'Endpoint deshabilitado para usuario demo' },
      { status: 403 },
    );
  }

  const dedupeKey = `test_push:${Date.now()}`;
  const titulo = 'Test push';
  const mensaje = 'Si ves esto, las notificaciones push funcionan.';

  const { inserted } = await insertNotificationOnce({
    clerkUserId: userId,
    tipo: 'recordatorio_envio',
    titulo,
    mensaje,
    dedupeKey,
    metadata: { navigate_to: 'alerts', test: true },
  });

  const hasSubscription = await userHasPushSubscription(userId);

  return NextResponse.json({
    ok: true,
    inserted,
    push_attempted: inserted,
    has_push_subscription: hasSubscription,
    dedupe_key: dedupeKey,
    hint: inserted
      ? hasSubscription
        ? 'Revisá el sistema y la bandeja de Avisos.'
        : 'Notificación creada, pero no hay suscripción push. Activá push en Avisos primero.'
      : 'No se insertó (error de DB). Revisá logs.',
  });
}
