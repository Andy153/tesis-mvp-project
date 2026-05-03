'use server';

import { auth, clerkClient } from '@clerk/nextjs/server';
import type { UserMetadata } from '@/lib/roles';
import { createPinHash, verifyPin } from '@/lib/pin-utils';

export async function setMedicoPin(pin: string) {
  const { userId } = await auth();
  if (!userId) throw new Error('No autenticado');

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const metadata = (user.publicMetadata ?? {}) as UserMetadata;

  if (metadata.rol !== 'medico') {
    throw new Error('Solo los usuarios con rol médico pueden configurar PIN');
  }

  const { hash, salt } = await createPinHash(pin);

  await client.users.updateUserMetadata(userId, {
    publicMetadata: {
      ...metadata,
      pinHash: hash,
      pinSalt: salt,
    },
  });

  return { ok: true };
}

export async function clearMedicoPin() {
  const { userId } = await auth();
  if (!userId) throw new Error('No autenticado');

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const metadata = (user.publicMetadata ?? {}) as UserMetadata;

  if (metadata.rol !== 'medico') {
    throw new Error('Solo los usuarios con rol médico pueden eliminar el PIN');
  }

  const { pinHash: _h, pinSalt: _s, ...rest } = metadata;

  await client.users.updateUserMetadata(userId, {
    publicMetadata: rest,
  });

  return { ok: true };
}

export async function verificarPinDelMedico(pinIngresado: string): Promise<{ ok: boolean; error?: string }> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: 'No autenticado' };

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const metadata = (user.publicMetadata ?? {}) as UserMetadata;

  // Nota (fase 4.1): el PIN está guardado en la cuenta del médico.
  // Para pruebas iniciales (1 cuenta), verificamos contra el usuario actual.
  // En el futuro esto se moverá a un contexto "consultorio/organización".

  if (!metadata.pinHash || !metadata.pinSalt) {
    return { ok: false, error: 'El médico aún no configuró un PIN' };
  }

  const isValid = await verifyPin(pinIngresado, metadata.pinHash, metadata.pinSalt);

  if (!isValid) {
    return { ok: false, error: 'PIN incorrecto' };
  }

  return { ok: true };
}

