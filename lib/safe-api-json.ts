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
  return fetch(input, {
    credentials: 'same-origin',
    redirect: 'manual',
    ...init,
  });
}

function messageForRedirectResponse(r: Response): string {
  const location = r.headers.get('location') ?? '';
  if (location.includes('activacion-pendiente')) {
    return 'Tu cuenta está pendiente de activación.';
  }
  if (location.includes('sign-in')) {
    return 'Iniciá sesión para continuar.';
  }
  return 'No se pudo completar la solicitud (redirección inesperada).';
}

export async function fetchApiJson<T>(
  input: string,
  init?: RequestInit,
): Promise<{ ok: true; data: T } | { ok: false; status: number; message: string }> {
  const r = await apiFetch(input, init);

  if (r.type === 'opaqueredirect' || r.status === 301 || r.status === 302 || r.status === 307 || r.status === 308) {
    return { ok: false, status: r.status || 0, message: messageForRedirectResponse(r) };
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
