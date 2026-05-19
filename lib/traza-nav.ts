/** Navegación entre pestañas de TrazaApp (SPA en `/`). */
export function navigateToTrazaView(view: string) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('traza:navigate', { detail: { view } }))
}

export function navigateToPerfil() {
  navigateToTrazaView('settings')
}
