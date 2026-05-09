'use server';

import { auth, clerkClient } from '@clerk/nextjs/server';
import type { UserMetadata, RolUsuario } from '@/lib/roles';
import { esRolValido } from '@/lib/roles';

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

  await client.users.updateUserMetadata(userId, {
    publicMetadata: {
      ...metadata,
      rol: 'medico' as RolUsuario,
    },
  });

  return { assigned: true, rol: 'medico' };
}
