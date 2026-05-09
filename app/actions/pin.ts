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
  // medicoClerkId aún no está declarado en UserMetadata; se escribe desde
  // assign-secretaria-role.ts. Lo leemos vía intersección local.
  const metadata = (user.publicMetadata ?? {}) as UserMetadata & {
    medicoClerkId?: string;
  };

  let pinHash: string | undefined;
  let pinSalt: string | undefined;

  if (metadata.rol === 'medico') {
    pinHash = metadata.pinHash;
    pinSalt = metadata.pinSalt;
  } else if (metadata.rol === 'secretaria') {
    const medicoClerkId = metadata.medicoClerkId;
    if (!medicoClerkId) {
      return { ok: false, error: 'Tu cuenta no está vinculada a ningún médico' };
    }
    try {
      const medicoUser = await client.users.getUser(medicoClerkId);
      const medicoMetadata = (medicoUser.publicMetadata ?? {}) as UserMetadata;
      pinHash = medicoMetadata.pinHash;
      pinSalt = medicoMetadata.pinSalt;
    } catch (e) {
      console.error('[verificarPinDelMedico] error fetching medico:', e);
      return { ok: false, error: 'No se pudo encontrar al médico vinculado' };
    }
  } else {
    return { ok: false, error: 'Tu cuenta no tiene un rol válido' };
  }

  if (!pinHash || !pinSalt) {
    return { ok: false, error: 'El médico aún no configuró un PIN' };
  }

  const isValid = await verifyPin(pinIngresado, pinHash, pinSalt);

  if (!isValid) {
    return { ok: false, error: 'PIN incorrecto' };
  }

  return { ok: true };
}

