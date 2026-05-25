'use client';

import { useEffect, useState } from 'react';

export function useCountUp(
  to: number,
  active: boolean,
  options?: { duration?: number; decimals?: number },
) {
  const duration = options?.duration ?? 1400;
  const decimals = options?.decimals ?? 0;
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!active) {
      setValue(0);
      return;
    }

    let start: number | null = null;
    let raf = 0;
    const factor = 10 ** decimals;

    const step = (ts: number) => {
      if (start === null) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      const eased = 1 - (1 - p) ** 3;
      const raw = eased * to;
      setValue(Math.round(raw * factor) / factor);
      if (p < 1) raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [active, to, duration, decimals]);

  return value;
}

export function formatCountEs(value: number, decimals = 0) {
  return value.toLocaleString('es-AR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
