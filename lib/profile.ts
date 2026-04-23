export type ThemeMode = 'light' | 'dark' | 'system';

export type ObraSocialCode = {
  obraSocial: string;
  codigo: string;
};

export type UserProfile = {
  displayName: string;
  profesion: string;
  avatarDataUrl?: string; // base64 data URL
  obras: ObraSocialCode[];
  theme: ThemeMode;
  updatedAt: string;
};

const STORAGE_KEY = 'traza.profile.v1';

export function applyThemeMode(mode: ThemeMode) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (mode === 'system') {
    root.removeAttribute('data-theme');
    return;
  }
  root.setAttribute('data-theme', mode);
}

export const DEFAULT_PROFILE: UserProfile = {
  displayName: 'Dra. M. Ferreira',
  profesion: 'Tocoginecología',
  obras: [],
  theme: 'system',
  updatedAt: new Date().toISOString(),
};

export function loadProfile(): UserProfile {
  if (typeof window === 'undefined') return DEFAULT_PROFILE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PROFILE;
    const parsed = JSON.parse(raw) as Partial<UserProfile>;
    return {
      ...DEFAULT_PROFILE,
      ...parsed,
      obras: Array.isArray(parsed.obras) ? parsed.obras : [],
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : DEFAULT_PROFILE.updatedAt,
    };
  } catch {
    return DEFAULT_PROFILE;
  }
}

export function saveProfile(p: UserProfile) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    // ignore
  }
}

const HONORIFIC = /^(dra?\.?|dr\.?|doctora?\.?|doctor\.?|ing\.?|lic\.?)$/i;

function normalizeToken(t: string) {
  return t.replace(/\./g, '').toLowerCase();
}

/** Iniciales para avatar (p. ej. «Dra. M. Ferreira» → «MF»; se ignoran prefijos tipo Dra./Dr.). */
export function getInitials(name: string): string {
  const raw = (name || '').trim();
  if (!raw) return 'U';
  const parts = raw.split(/\s+/).filter(Boolean);
  const significant = parts.filter((p) => !HONORIFIC.test(normalizeToken(p)));
  const sig = significant.length > 0 ? significant : parts;

  const letter = (token: string) => {
    const m = token.match(/[a-záéíóúñ]/i);
    return m ? m[0].toUpperCase() : (token[0] || '').toUpperCase();
  };

  if (sig.length === 0) return 'U';
  if (sig.length === 1) {
    const w = sig[0].replace(/[^a-záéíóúñ0-9]/gi, '');
    return w.slice(0, 2).toUpperCase() || 'U';
  }
  return (letter(sig[0]) + letter(sig[sig.length - 1])).slice(0, 2);
}

export async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function fileToAvatarDataUrl(
  file: File,
  opts?: { maxSize?: number; quality?: number },
): Promise<string> {
  const maxSize = opts?.maxSize ?? 256;
  const quality = opts?.quality ?? 0.86;
  const src = await fileToDataUrl(file);
  if (typeof document === 'undefined') return src;

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = src;
  });

  const w = img.naturalWidth || 1;
  const h = img.naturalHeight || 1;
  const scale = Math.min(1, maxSize / Math.max(w, h));
  const tw = Math.max(1, Math.round(w * scale));
  const th = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement('canvas');
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext('2d');
  if (!ctx) return src;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, tw, th);

  // Prefer webp when possible; fallback to jpeg.
  let out = '';
  try {
    out = canvas.toDataURL('image/webp', quality);
    if (!out.startsWith('data:image/webp')) out = '';
  } catch {
    out = '';
  }
  if (!out) out = canvas.toDataURL('image/jpeg', quality);
  return out;
}

