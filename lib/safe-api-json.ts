/** Evita el error críptico de Safari al parsear HTML como JSON. */
export async function readJsonResponse<T>(r: Response): Promise<T | null> {
  const ct = r.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) return null;
  try {
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

export function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  return fetch(input, { credentials: 'same-origin', ...init });
}

export async function fetchApiJson<T>(
  input: string,
  init?: RequestInit,
): Promise<{ ok: true; data: T } | { ok: false; status: number; message: string }> {
  const r = await apiFetch(input, init);
  if (r.redirected) {
    return { ok: false, status: r.status, message: 'Sesión expirada. Volvé a iniciar sesión.' };
  }
  const data = await readJsonResponse<T>(r);
  if (data === null) {
    return {
      ok: false,
      status: r.status,
      message: r.ok
        ? 'Respuesta inválida del servidor.'
        : `Error del servidor (${r.status}).`,
    };
  }
  if (!r.ok) {
    const err =
      typeof data === 'object' && data !== null && 'error' in data
        ? String((data as { error?: unknown }).error)
        : `Error (${r.status})`;
    return { ok: false, status: r.status, message: err };
  }
  return { ok: true, data };
}
