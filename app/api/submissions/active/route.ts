// app/api/submissions/active/route.ts
//
// GET: devuelve submissions con wizard activo (status='enviado', wizard no completado)
// Usado por el banner del dashboard.

import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { isDemoUser } from '@/lib/demo-user';
import { fetchActiveSubmissions } from '@/lib/active-submissions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (isDemoUser(userId)) {
    return NextResponse.json({ submissions: [] });
  }

  const active = await fetchActiveSubmissions(userId);

  return NextResponse.json({ submissions: active });
}
