import { NextResponse } from 'next/server';
import { z } from 'zod';
import { callOpenAI, type DocumentType } from '@/lib/ai/openai';

const PIPE = '[TRAZA_PIPELINE]';

const BodySchema = z
  .object({
    documentType: z.enum(['parte_quirurgico', 'bono_autorizacion']),
    // Backwards compatible: accept either a single image or multiple.
    imageBase64: z.string().min(1).optional(),
    imagesBase64: z.array(z.string().min(1)).min(1).max(3).optional(),
  })
  .refine((v) => Boolean(v.imageBase64 || (v.imagesBase64 && v.imagesBase64.length > 0)), {
    message: 'Missing imageBase64/imagesBase64',
  });

function dataUrlApproxBytes(dataUrl: string) {
  // Expected: data:<mime>;base64,<payload>
  const s = (dataUrl || '').trim();
  const comma = s.indexOf(',');
  if (!s.startsWith('data:') || comma < 0) {
    // Not a data URL; fall back to counting the string bytes.
    return Buffer.byteLength(s, 'utf8');
  }
  const base64 = s.slice(comma + 1).trim();
  const len = base64.length;
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  // Base64 expansion: 4 chars -> 3 bytes
  return Math.max(0, Math.floor((len * 3) / 4) - padding);
}

/**
 * POST /api/ai/extract
 *
 * Receives a base64 data URL + documentType and returns the typed result
 * from `callOpenAI`. The request is considered "valid" even if extraction fails;
 * in that case we still return 200 with `{ ok: false, ... }` so the client can
 * decide on fallback (e.g. Tesseract) in later commits.
 */
export async function POST(req: Request) {
  const tAll0 = Date.now();
  try {
    const body = (await req.json()) as unknown;
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      console.log(
        `${PIPE} api_extract:invalid_body body=${JSON.stringify(body)} issues=${JSON.stringify(parsed.error.issues)}`,
      );
      return NextResponse.json(
        { ok: false, error: 'Invalid request body', errorCode: 'API_ERROR' },
        { status: 400 },
      );
    }

    const { documentType, imageBase64, imagesBase64 } = parsed.data as {
      documentType: DocumentType;
      imageBase64?: string;
      imagesBase64?: string[];
    };

    const images = (imagesBase64 && imagesBase64.length ? imagesBase64 : imageBase64 ? [imageBase64] : []).slice(0, 3);
    const bytes = images.reduce((acc, img) => acc + dataUrlApproxBytes(img), 0);
    const totalLen = images.reduce((acc, img) => acc + (img?.length || 0), 0);
    console.log(`${PIPE} api_extract:start docType=${documentType} images=${images.length} approx_bytes=${bytes} total_dataUrl_len=${totalLen}`);
    const MAX_BYTES = 10 * 1024 * 1024; // 10MB
    if (bytes > MAX_BYTES) {
      return NextResponse.json(
        { ok: false, error: 'Image too large (max 10MB)', errorCode: 'API_ERROR' },
        { status: 413 },
      );
    }

    const t0 = Date.now();
    const result = await callOpenAI({ imageBase64: images[0], imagesBase64: images, documentType });

    let persistedDocumentId: string | null = null
    if ((result as any)?.ok === true && (result as any)?.data) {
      try {
        const { auth } = await import('@clerk/nextjs/server')
        const { saveDocumentAndExtraction } = await import('@/lib/history-db')
        const { userId } = await auth()
        if (userId) {
          const extraction = (result as any).data
          const prepaga = extraction?.cobertura?.prepaga ?? 'desconocida'
          const storagePath = `${userId}/${Date.now()}_${documentType}`
          const saved = await saveDocumentAndExtraction(userId, {
            storagePath,
            nombreArchivo: `${documentType}_${Date.now()}`,
            tipo: documentType,
            prepaga,
            aiExtraction: extraction,
          })
          if (saved) persistedDocumentId = saved.documentId
        }
      } catch (persistErr) {
        console.log(`${PIPE} api_extract:persist_warn`, persistErr)
      }
    }

    // Agregar documentId a la respuesta para que el cliente pueda hacer PATCH
    const responseData = persistedDocumentId
      ? { ...(result as any), documentId: persistedDocumentId }
      : result
    console.log(
      `${PIPE} api_extract:done ms_total=${Date.now() - tAll0} ms_openai_call=${Date.now() - t0} ok=${(result as any)?.ok === true} errorCode=${(result as any)?.errorCode || ''} tokensUsed=${(result as any)?.tokensUsed ?? ''} elapsedMs=${(result as any)?.elapsedMs ?? ''}`,
    );
    return NextResponse.json(responseData, { status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`${PIPE} api_extract:error ms_total=${Date.now() - tAll0} msg=${msg || 'unknown'}`);
    return NextResponse.json(
      { ok: false, error: msg || 'Unexpected server error', errorCode: 'API_ERROR' },
      { status: 500 },
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const { auth } = await import('@clerk/nextjs/server')
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { document_id, codigo_nomenclador_validado } = body

    if (!document_id || !codigo_nomenclador_validado) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const { supabaseAdmin } = await import('@/lib/supabase')
    const { error } = await supabaseAdmin
      .from('ai_extractions')
      .update({ codigo_nomenclador: codigo_nomenclador_validado })
      .eq('document_id', document_id)
      .eq('clerk_user_id', userId)

    if (error) {
      console.error('Error updating codigo_nomenclador:', error)
      return NextResponse.json({ error: 'DB error' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 })
  }
}

