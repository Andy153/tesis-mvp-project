import { z } from 'zod';
import { PROMPT_BONO_AUTORIZACION, PROMPT_PARTE_QUIRURGICO } from './prompts';
import { BonoAutorizacionSchema, ParteQuirurgicoSchema } from './schemas';

const PIPE = '[TRAZA_PIPELINE]';

/**
 * OpenAI Chat Completions endpoint (OpenAI-compatible).
 */
export const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

/**
 * Model used for extraction (vision + JSON). Slug API: `gpt-4o-mini`.
 */
export const OPENAI_MODEL = 'gpt-4o-mini';

/**
 * Supported document types.
 */
export type DocumentType = 'parte_quirurgico' | 'bono_autorizacion';

export type OpenAIErrorCode = 'NETWORK' | 'API_ERROR' | 'INVALID_JSON' | 'VALIDATION_FAILED' | 'TIMEOUT';

export type OpenAIOk<T> = { ok: true; data: T; tokensUsed: number; elapsedMs: number };
export type OpenAIErr = { ok: false; error: string; errorCode: OpenAIErrorCode };

export type CallOpenAIParams = {
  /** Image as a data URL (e.g. `data:image/jpeg;base64,...`). */
  imageBase64: string;
  /** Optional multiple images (up to 3). If provided, `imageBase64` is treated as the first image. */
  imagesBase64?: string[];
  /** Document type to extract. */
  documentType: DocumentType;
  /** Optional abort signal (e.g. client cancellation). */
  signal?: AbortSignal;
};

const OpenAIChatCompletionSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string().nullable().optional(),
        }),
      }),
    )
    .min(1),
  usage: z
    .object({
      total_tokens: z.number().int().optional(),
    })
    .optional(),
});

function getPrompt(documentType: DocumentType) {
  return documentType === 'parte_quirurgico' ? PROMPT_PARTE_QUIRURGICO : PROMPT_BONO_AUTORIZACION;
}

function getSchema(documentType: DocumentType) {
  return documentType === 'parte_quirurgico' ? ParteQuirurgicoSchema : BonoAutorizacionSchema;
}

function stripMarkdownFences(s: string) {
  const trimmed = (s || '').trim();
  if (!trimmed) return trimmed;
  // Handles:
  // ```json
  // { ... }
  // ```
  if (trimmed.startsWith('```')) {
    const withoutStart = trimmed.replace(/^```[a-zA-Z]*\s*/m, '');
    return withoutStart.replace(/\s*```$/m, '').trim();
  }
  return trimmed;
}

function flattenFieldStatus(value: unknown, path = '', out: string[] = [], depth = 0): string[] {
  if (depth > 6) return out;
  if (value === null) {
    out.push(`${path}=null`);
    return out;
  }
  if (value === undefined) {
    out.push(`${path}=undefined`);
    return out;
  }
  const t = typeof value;
  if (t === 'string') {
    const s = String(value);
    out.push(`${path}=string(${s.trim().length === 0 ? 'empty' : 'len' + s.length})`);
    return out;
  }
  if (t === 'number') {
    out.push(`${path}=number`);
    return out;
  }
  if (t === 'boolean') {
    out.push(`${path}=boolean`);
    return out;
  }
  if (Array.isArray(value)) {
    out.push(`${path}=array(len${value.length})`);
    return out;
  }
  if (t === 'object') {
    const obj = value as Record<string, unknown>;
    for (const k of Object.keys(obj)) {
      flattenFieldStatus(obj[k], path ? `${path}.${k}` : k, out, depth + 1);
      if (out.length >= 80) break;
    }
    return out;
  }
  out.push(`${path}=${t}`);
  return out;
}

function isAbortError(e: unknown) {
  return (
    !!e &&
    typeof e === 'object' &&
    'name' in e &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (e as any).name === 'AbortError'
  );
}

function mergeAbortSignals(timeoutController: AbortController, upstream?: AbortSignal) {
  if (!upstream) return timeoutController.signal;
  if (upstream.aborted) timeoutController.abort();
  const onAbort = () => timeoutController.abort();
  upstream.addEventListener('abort', onAbort, { once: true });
  return timeoutController.signal;
}

/**
 * Calls OpenAI to extract structured JSON from an image.
 *
 * This function runs server-side. It reads `process.env.OPENAI_API_KEY`.
 */
export async function callOpenAI(params: CallOpenAIParams) {
  const startedAt = Date.now();
  const images = (params.imagesBase64 && params.imagesBase64.length ? params.imagesBase64 : [params.imageBase64]).slice(0, 5);
  console.log(
    `${PIPE} openai:call start docType=${params.documentType} model=${OPENAI_MODEL} images=${images.length} img_lens=${images.map((s) => s.length).join(',')}`,
  );

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { ok: false, error: 'OpenAI API key not configured', errorCode: 'API_ERROR' } satisfies OpenAIErr;
  }

  const prompt = getPrompt(params.documentType);
  const schema = getSchema(params.documentType);

  const timeoutController = new AbortController();
  const signal = mergeAbortSignals(timeoutController, params.signal);
  const timeout = setTimeout(() => timeoutController.abort(), 60_000);

  try {
    const tFetch0 = Date.now();
    const resp = await fetch(OPENAI_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              ...images.map((url) => ({
                type: 'image_url' as const,
                image_url: { url, detail: 'high' as const },
              })),
            ],
          },
        ],
        max_tokens: 2048,
        temperature: 0.0,
        top_p: 0.7,
        stream: false,
        response_format: { type: 'json_object' },
      }),
      signal,
    });
    console.log(`${PIPE} openai:http status=${resp.status} ok=${resp.ok} fetch_ms=${Date.now() - tFetch0}`);

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      return {
        ok: false,
        error: `OpenAI API error (${resp.status}): ${text || resp.statusText || 'Unknown error'}`,
        errorCode: 'API_ERROR',
      } satisfies OpenAIErr;
    }

    const json = (await resp.json()) as unknown;
    const parsed = OpenAIChatCompletionSchema.safeParse(json);
    if (!parsed.success) {
      return {
        ok: false,
        error: 'OpenAI response shape is not OpenAI-compatible',
        errorCode: 'API_ERROR',
      } satisfies OpenAIErr;
    }

    const contentRaw = parsed.data.choices[0]?.message?.content ?? '';
    const content = stripMarkdownFences(String(contentRaw || ''));
    console.log(`${PIPE} openai:content chars=${content.length} tokensUsed=${parsed.data.usage?.total_tokens ?? 0}`);
    let dataUnknown: unknown;
    try {
      dataUnknown = JSON.parse(content);
    } catch {
      return {
        ok: false,
        error: 'OpenAI returned invalid JSON',
        errorCode: 'INVALID_JSON',
      } satisfies OpenAIErr;
    }

    const validated = schema.safeParse(dataUnknown);
    if (!validated.success) {
      return {
        ok: false,
        error: 'OpenAI JSON did not match expected schema',
        errorCode: 'VALIDATION_FAILED',
      } satisfies OpenAIErr;
    }

    const elapsedMs = Date.now() - startedAt;
    const tokensUsed = parsed.data.usage?.total_tokens ?? 0;
    const fieldStatus = flattenFieldStatus(validated.data);
    console.log(`${PIPE} openai:validated ok fields=${fieldStatus.join(' | ')}`);
    return { ok: true, data: validated.data, tokensUsed, elapsedMs } as OpenAIOk<typeof validated.data>;
  } catch (e) {
    if (isAbortError(e)) {
      const elapsedMs = Date.now() - startedAt;
      return { ok: false, error: `OpenAI request timed out after ${elapsedMs}ms`, errorCode: 'TIMEOUT' } satisfies OpenAIErr;
    }
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg || 'Network error', errorCode: 'NETWORK' } satisfies OpenAIErr;
  } finally {
    clearTimeout(timeout);
  }
}
