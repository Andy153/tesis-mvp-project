import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { isDemoUser } from '@/lib/demo-user';
import { userHasPushSubscription } from '@/lib/push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (isDemoUser(userId)) {
    return NextResponse.json({ subscribed: false });
  }

  const subscribed = await userHasPushSubscription(userId);
  return NextResponse.json({ subscribed });
}
