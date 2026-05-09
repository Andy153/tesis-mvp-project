'use server';

import { clerkClient } from '@clerk/nextjs/server';
import type { UserMetadata } from '@/lib/roles';

export async function assignSecretariaRole(
  secretariaClerkId: string,
  medicoClerkId: string,
): Promise<{ success: boolean; error?: string }> {
  if (!secretariaClerkId) {
    return { success: false, error: 'secretariaClerkId requerido' };
  }
  if (!medicoClerkId) {
    return { success: false, error: 'medicoClerkId requerido' };
  }

  try {
    const client = await clerkClient();

    const user = await client.users.getUser(secretariaClerkId);
    const prevMetadata = (user.publicMetadata ?? {}) as UserMetadata & {
      medicoClerkId?: string;
    };

    await client.users.updateUser(secretariaClerkId, {
      publicMetadata: {
        ...prevMetadata,
        rol: 'secretaria',
        medicoClerkId,
      },
    });

    return { success: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error inesperado';
    console.error('[assignSecretariaRole] error:', e);
    return { success: false, error: msg };
  }
}
