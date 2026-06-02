'use client';

import { useEffect } from 'react';

/** Fuerza tema claro en páginas de auth; restaura el valor anterior al desmontar. */
export function useAuthLightTheme() {
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.getAttribute('data-theme');
    root.setAttribute('data-theme', 'light');
    return () => {
      if (previous != null) {
        root.setAttribute('data-theme', previous);
      } else {
        root.removeAttribute('data-theme');
      }
    };
  }, []);
}
