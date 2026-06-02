'use client';

import type { ReactNode } from 'react';
import { useAuthLightTheme } from '@/components/auth/useAuthLightTheme';

const AUTH_SHELL_STYLE = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#F4F8F5',
  padding: '24px',
} as const;

export function AuthPageShell({ children }: { children: ReactNode }) {
  useAuthLightTheme();

  return <div style={AUTH_SHELL_STYLE}>{children}</div>;
}

export { AUTH_SHELL_STYLE };
