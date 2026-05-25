'use client';

import { useEffect, useState } from 'react';

/** Montos fijos del relevamiento: de 500 hasta 1.600 USD/mes */
export const PERDIDOS_STEPS = [500, 700, 900, 1100, 1300, 1600] as const;

const MIN = PERDIDOS_STEPS[0];
const MAX = PERDIDOS_STEPS[PERDIDOS_STEPS.length - 1];
const STEP_MS = 550;

export function formatPerdidosUsd(amount: number) {
  return `${amount.toLocaleString('es-AR')} USD`;
}

export function formatPerdidosAmount(amount: number) {
  return amount.toLocaleString('es-AR');
}

/** 0 = verde (bajo), 1 = rojo (hasta 1.600) */
export function perdidosBarColor(t: number) {
  const p = Math.min(1, Math.max(0, t));
  const lerp = (from: number, to: number) => Math.round(from + (to - from) * p);

  const topR = lerp(125, 242);
  const topG = lerp(206, 120);
  const topB = lerp(168, 90);
  const botR = lerp(42, 155);
  const botG = lerp(107, 46);
  const botB = lerp(82, 46);

  return `linear-gradient(180deg, rgb(${topR},${topG},${topB}) 0%, rgb(${botR},${botG},${botB}) 100%)`;
}

export function perdidosBarGlow(t: number) {
  const p = Math.min(1, Math.max(0, t));
  if (p < 0.5) {
    return `0 0 18px rgba(125, 206, 168, ${0.25 + p * 0.2})`;
  }
  return `0 0 20px rgba(242, 139, 130, ${0.35 + (p - 0.5) * 0.4})`;
}

export function usePerdidosRange(active: boolean) {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (!active) {
      setStepIndex(0);
      return;
    }

    setStepIndex(0);
    const id = window.setInterval(() => {
      setStepIndex((i) => {
        if (i >= PERDIDOS_STEPS.length - 1) return i;
        return i + 1;
      });
    }, STEP_MS);

    return () => window.clearInterval(id);
  }, [active]);

  const amount = PERDIDOS_STEPS[stepIndex];
  const barPercent = ((amount - MIN) / (MAX - MIN)) * 100;

  const heat = barPercent / 100;

  return {
    amount,
    barPercent,
    heat,
    atMax: stepIndex >= PERDIDOS_STEPS.length - 1,
  };
}
