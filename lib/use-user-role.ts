'use client';

import { useUser } from '@clerk/nextjs';
import type { RolUsuario, UserMetadata } from './roles';
import { esRolValido } from './roles';

export function useUserRole() {
  const { user, isLoaded, isSignedIn } = useUser();

  if (!isLoaded) {
    return { rol: null, isLoaded: false, isSignedIn: false, hasPin: false, metadata: null };
  }

  if (!isSignedIn || !user) {
    return { rol: null, isLoaded: true, isSignedIn: false, hasPin: false, metadata: null };
  }

  const metadata = (user.publicMetadata ?? {}) as UserMetadata;
  const rol: RolUsuario | null = esRolValido(metadata.rol) ? metadata.rol : null;
  const hasPin = Boolean(metadata.pinHash && metadata.pinSalt);

  return {
    rol,
    isLoaded: true,
    isSignedIn: true,
    hasPin,
    metadata,
  };
}

