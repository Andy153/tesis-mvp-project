// lib/feature-flags.ts
// Usuarios con acceso a funcionalidades beta.
// Importable desde cliente y servidor.

const ACTIVIA_BETA_USERS: string[] = [
  'user_3DDcvSkcq7q2zOP9n3YM0FNDeR6', // Andres Garcia Skinner (dev/test)
  'user_3DeNG0MVgyVLGQoJnStB8WVrIVw',   // usuario activo en browser (dev/test)
]

/** true si el usuario tiene habilitada la integración directa con Activia/OSDE */
export function hasActiviaIntegration(userId: string): boolean {
  return ACTIVIA_BETA_USERS.includes(userId)
}
