import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { isDemoUser } from '@/lib/demo-user';
import { removePushSubscription } from '@/lib/push';

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

  let body: { endpoint?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const endpoint = body.endpoint?.trim();
  if (!endpoint) {
    return NextResponse.json({ error: 'Falta endpoint' }, { status: 400 });
  }

  await removePushSubscription(userId, endpoint);

  return NextResponse.json({ ok: true });
}
