import { z } from 'zod';
import { PROMPT_BONO_AUTORIZACION, PROMPT_PARTE_QUIRURGICO } from './prompts';
import { BonoAutorizacionSchema, ParteQuirurgicoSchema } from './schemas';

/**
 * NVIDIA Integrate (OpenAI-compatible) endpoint for chat completions.
 */
export const GEMMA_ENDPOINT = 'https://integrate.api.nvidia.com/v1/chat/completions';

/**
 * Model used for extraction.
 */
export const GEMMA_MODEL = 'google/gemma-3-27b-it';

/**
 * Supported document types.
 */
export type DocumentType = 'parte_quirurgico' | 'bono_autorizacion';

export type GemmaErrorCode = 'NETWORK' | 'API_ERROR' | 'INVALID_JSON' | 'VALIDATION_FAILED' | 'TIMEOUT';

export type GemmaOk<T> = { ok: true; data: T; tokensUsed: number; elapsedMs: number };
export type GemmaErr = { ok: false; error: string; errorCode: GemmaErrorCode };

export type CallGemmaParams = {
  /** Image as a data URL (e.g. `data:image/jpeg;base64,...`). */
  imageBase64: string;
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
 * Calls NVIDIA Gemma to extract structured JSON from an image.
 *
 * This function runs server-side. It reads `process.env.NVIDIA_API_KEY`.
 */
export async function callGemma(params: CallGemmaParams) {
  const startedAt = Date.now();

  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    return { ok: false, error: 'API key not configured', errorCode: 'API_ERROR' } satisfies GemmaErr;
  }

  const prompt = getPrompt(params.documentType);
  const schema = getSchema(params.documentType);

  const timeoutController = new AbortController();
  const signal = mergeAbortSignals(timeoutController, params.signal);
  const timeout = setTimeout(() => timeoutController.abort(), 60_000);

  try {
    const resp = await fetch(GEMMA_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        model: GEMMA_MODEL,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: params.imageBase64 } },
            ],
          },
        ],
        max_tokens: 2048,
        temperature: 0.0,
        top_p: 0.7,
        stream: false,
      }),
      signal,
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      return {
        ok: false,
        error: `Gemma API error (${resp.status}): ${text || resp.statusText || 'Unknown error'}`,
        errorCode: 'API_ERROR',
      } satisfies GemmaErr;
    }

    const json = (await resp.json()) as unknown;
    const parsed = OpenAIChatCompletionSchema.safeParse(json);
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Gemma response shape is not OpenAI-compatible',
        errorCode: 'API_ERROR',
      } satisfies GemmaErr;
    }

    const contentRaw = parsed.data.choices[0]?.message?.content ?? '';
    const content = stripMarkdownFences(String(contentRaw || ''));
    let dataUnknown: unknown;
    try {
      dataUnknown = JSON.parse(content);
    } catch {
      return {
        ok: false,
        error: 'Gemma returned invalid JSON',
        errorCode: 'INVALID_JSON',
      } satisfies GemmaErr;
    }

    const validated = schema.safeParse(dataUnknown);
    if (!validated.success) {
      return {
        ok: false,
        error: 'Gemma JSON did not match expected schema',
        errorCode: 'VALIDATION_FAILED',
      } satisfies GemmaErr;
    }

    const elapsedMs = Date.now() - startedAt;
    const tokensUsed = parsed.data.usage?.total_tokens ?? 0;
    return { ok: true, data: validated.data, tokensUsed, elapsedMs } as GemmaOk<typeof validated.data>;
  } catch (e) {
    if (isAbortError(e)) {
      const elapsedMs = Date.now() - startedAt;
      return { ok: false, error: `Gemma request timed out after ${elapsedMs}ms`, errorCode: 'TIMEOUT' } satisfies GemmaErr;
    }
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg || 'Network error', errorCode: 'NETWORK' } satisfies GemmaErr;
  } finally {
    clearTimeout(timeout);
  }
}

