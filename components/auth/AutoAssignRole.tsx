'use client';

import { useEffect, useRef } from 'react';
import { useUser } from '@clerk/nextjs';
import { assignDefaultRoleIfNeeded } from '@/app/actions/assign-default-role';
import { useUserRole } from '@/lib/use-user-role';

export function AutoAssignRole() {
  const { user, isLoaded } = useUser();
  const { rol } = useUserRole();
  const hasRun = useRef(false);

  useEffect(() => {
    if (!isLoaded || !user || rol !== null || hasRun.current) return;

    hasRun.current = true;

    assignDefaultRoleIfNeeded().then(async (result) => {
      if (result.assigned) {
        await user.reload();
      }
    });
  }, [isLoaded, user, rol]);

  return null;
}
