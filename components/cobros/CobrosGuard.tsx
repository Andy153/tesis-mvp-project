'use client';

import { useUserRole } from '@/lib/use-user-role';
import { usePinSession } from '@/lib/use-pin-session';
import { PinPromptScreen } from './PinPromptScreen';
import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
};

export function CobrosGuard({ children }: Props) {
  const { rol, isLoaded } = useUserRole();
  const pinUnlocked = usePinSession();

  if (!isLoaded) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
        Cargando...
      </div>
    );
  }

  // Médicos: acceso libre
  if (rol === 'medico') {
    return <>{children}</>;
  }

  // Secretarías que ya ingresaron PIN: acceso libre
  if (rol === 'secretaria' && pinUnlocked) {
    return <>{children}</>;
  }

  // Secretarías sin PIN ingresado: bloqueo (Fase 4.5 reemplazará esto por una pantalla bonita)
  if (rol === 'secretaria') {
    return <PinPromptScreen onUnlock={() => {}} />;
  }

  // Sin rol asignado
  return (
    <div
      style={{
        padding: 48,
        textAlign: 'center',
        backgroundColor: 'var(--bg-panel)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        margin: 24,
      }}
    >
      <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
      <h2 style={{ margin: 0, marginBottom: 8 }}>Sin rol asignado</h2>
      <p style={{ margin: 0, color: 'var(--text-muted)' }}>
        Tu cuenta aún no tiene un rol asignado. Contactá al administrador.
      </p>
    </div>
  );
}

