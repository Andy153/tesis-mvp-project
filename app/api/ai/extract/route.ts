import { NextResponse } from 'next/server';
import { z } from 'zod';
import { callOpenAI, type DocumentType } from '@/lib/ai/openai';

const BodySchema = z.object({
  imageBase64: z.string().min(1),
  documentType: z.enum(['parte_quirurgico', 'bono_autorizacion']),
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
  try {
    const body = (await req.json()) as unknown;
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'Invalid request body', errorCode: 'API_ERROR' },
        { status: 400 },
      );
    }

    const { imageBase64, documentType } = parsed.data as { imageBase64: string; documentType: DocumentType };

    const bytes = dataUrlApproxBytes(imageBase64);
    const MAX_BYTES = 10 * 1024 * 1024; // 10MB
    if (bytes > MAX_BYTES) {
      return NextResponse.json(
        { ok: false, error: 'Image too large (max 10MB)', errorCode: 'API_ERROR' },
        { status: 413 },
      );
    }

    const result = await callOpenAI({ imageBase64, documentType });
    return NextResponse.json(result, { status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: msg || 'Unexpected server error', errorCode: 'API_ERROR' },
      { status: 500 },
    );
  }
}

