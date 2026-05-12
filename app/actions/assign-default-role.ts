'use server';

import { auth, clerkClient } from '@clerk/nextjs/server';
import type { UserMetadata, RolUsuario } from '@/lib/roles';
import { esRolValido } from '@/lib/roles';
import { createPinHash } from '@/lib/pin-utils';

const DEFAULT_PIN = '0000';

export async function assignDefaultRoleIfNeeded(): Promise<{
  assigned: boolean;
  rol: RolUsuario | null;
}> {
  const { userId } = await auth();
  if (!userId) return { assigned: false, rol: null };

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const metadata = (user.publicMetadata ?? {}) as UserMetadata;

  if (esRolValido(metadata.rol)) {
    return { assigned: false, rol: metadata.rol };
  }

  const { hash, salt } = await createPinHash(DEFAULT_PIN);

  await client.users.updateUserMetadata(userId, {
    publicMetadata: {
      ...metadata,
      rol: 'medico' as RolUsuario,
      pinHash: hash,
      pinSalt: salt,
    },
  });

  return { assigned: true, rol: 'medico' };
}
