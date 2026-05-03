function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function generateSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

export async function hashPin(pin: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${pin}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return bytesToHex(new Uint8Array(hashBuffer));
}

export async function createPinHash(pin: string): Promise<{ hash: string; salt: string }> {
  if (!/^\d{4}$/.test(pin)) {
    throw new Error('El PIN debe ser exactamente 4 dígitos numéricos');
  }
  const salt = generateSalt();
  const hash = await hashPin(pin, salt);
  return { hash, salt };
}

export async function verifyPin(pin: string, storedHash: string, storedSalt: string): Promise<boolean> {
  if (!/^\d{4}$/.test(pin)) return false;
  const computedHash = await hashPin(pin, storedSalt);
  return computedHash === storedHash;
}

