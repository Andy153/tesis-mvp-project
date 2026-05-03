'use client';

let pinIngresadoEnSesion = false;

type Listener = () => void;
const listeners = new Set<Listener>();

export function marcarPinIngresado() {
  pinIngresadoEnSesion = true;
  listeners.forEach((fn) => fn());
}

export function pinFueIngresadoEnSesion(): boolean {
  return pinIngresadoEnSesion;
}

export function limpiarPinSesion() {
  pinIngresadoEnSesion = false;
  listeners.forEach((fn) => fn());
}

export function subscribePinSession(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

