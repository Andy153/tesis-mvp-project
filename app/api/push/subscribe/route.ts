import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { isDemoUser } from '@/lib/demo-user';
import { savePushSubscription, type PushSubscriptionJson } from '@/lib/push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (isDemoUser(userId)) {
    return NextResponse.json({ ok: true });
  }

  let body: { subscription?: PushSubscriptionJson };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const subscription = body.subscription;
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    return NextResponse.json({ error: 'Suscripción inválida' }, { status: 400 });
  }

  const userAgent = req.headers.get('user-agent');
  await savePushSubscription(userId, subscription, userAgent);

  return NextResponse.json({ ok: true });
}
