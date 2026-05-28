import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { isDemoUser } from '@/lib/demo-user';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { DEMO_COMPROBANTE_BUCKET, DEMO_COMPROBANTE_PATH } from '@/lib/demo-swiss-cobros';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BUCKET_SUBMISSIONS = 'submissions';
const BUCKET_DOCUMENTOS = 'documentos-medicos';
const SIGNED_URL_TTL_SEC = 3600;

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: sub, error } = await supabaseAdmin
    .from('monthly_submissions')
    .select('id, periodo, comprobante_smg_path')
    .eq('id', params.id)
    .eq('clerk_user_id', userId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!sub) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const filename = `comprobante_smg_${sub.periodo ?? 'periodo'}.pdf`;

  if (isDemoUser(userId)) {
    const bucketsToTry = [DEMO_COMPROBANTE_BUCKET, BUCKET_DOCUMENTOS, BUCKET_SUBMISSIONS] as const;
    const tried: { bucket: string; error?: string }[] = [];

    for (const bucket of bucketsToTry) {
      const { data: signed, error: signErr } = await supabaseAdmin.storage
        .from(bucket)
        .createSignedUrl(DEMO_COMPROBANTE_PATH, SIGNED_URL_TTL_SEC);

      if (!signErr && signed?.signedUrl) {
        return NextResponse.json({ url: signed.signedUrl, filename });
      }

      tried.push({ bucket, error: signErr?.message ?? 'No se pudo firmar la URL' });
    }

    // Diagnóstico demo: si el path no coincide exactamente, listamos candidatos
    // en el bucket demo para guiar corrección del path.
    try {
      const candidates: string[] = [];
      const { data: list1 } = await supabaseAdmin.storage
        .from(DEMO_COMPROBANTE_BUCKET)
        .list('', { limit: 200, search: 'comprobante' });
      for (const it of list1 ?? []) {
        if (typeof (it as any)?.name === 'string') candidates.push((it as any).name);
      }

      // Si encontramos un match único cercano, intentamos firmarlo automáticamente.
      const needle = 'comprobante_swiss_medical_demo';
      const near = candidates.filter((n) => n.toLowerCase().includes(needle));
      if (near.length === 1) {
        const { data: signed2, error: signErr2 } = await supabaseAdmin.storage
          .from(DEMO_COMPROBANTE_BUCKET)
          .createSignedUrl(near[0], SIGNED_URL_TTL_SEC);
        if (!signErr2 && signed2?.signedUrl) {
          return NextResponse.json({ url: signed2.signedUrl, filename, resolvedDemoPath: near[0] });
        }
      }

      // Si no podemos resolverlo, devolvemos algunas sugerencias.
      const suggestions = near.length > 0 ? near.slice(0, 20) : candidates.slice(0, 20);
      tried.push({
        bucket: DEMO_COMPROBANTE_BUCKET,
        error: `Sugerencias en bucket demo: ${suggestions.join(', ') || '—'}`,
      });
    } catch {
      /* best-effort diagnóstico */
    }

    // Si no existe el objeto, Supabase devuelve "Object not found".
    const notFound = tried.some((t) => (t.error ?? '').toLowerCase().includes('not found'));
    return NextResponse.json(
      {
        error: notFound ? 'Comprobante demo no encontrado en Storage' : 'No se pudo obtener el comprobante demo',
        demo_path: DEMO_COMPROBANTE_PATH,
        tried,
      },
      { status: notFound ? 404 : 500 },
    );
  }

  const path = sub.comprobante_smg_path?.trim();
  if (!path) {
    return NextResponse.json({ error: 'No hay comprobante cargado' }, { status: 404 });
  }

  const { data: signed, error: signErr } = await supabaseAdmin.storage
    .from(BUCKET_SUBMISSIONS)
    .createSignedUrl(path, SIGNED_URL_TTL_SEC);

  if (signErr || !signed?.signedUrl) {
    return NextResponse.json({ error: signErr?.message ?? 'No se pudo firmar la URL' }, { status: 500 });
  }

  return NextResponse.json({ url: signed.signedUrl, filename });
}
