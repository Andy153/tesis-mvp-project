'use client';

import { useEffect, useState } from 'react';
import { pinFueIngresadoEnSesion, subscribePinSession } from './pin-session';

export function usePinSession() {
  const [pinUnlocked, setPinUnlocked] = useState(false);

  useEffect(() => {
    setPinUnlocked(pinFueIngresadoEnSesion());
    const unsubscribe = subscribePinSession(() => {
      setPinUnlocked(pinFueIngresadoEnSesion());
    });
    return unsubscribe;
  }, []);

  return pinUnlocked;
}

