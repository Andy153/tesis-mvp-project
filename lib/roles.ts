export type RolUsuario = 'medico' | 'secretaria';

export type UserMetadata = {
  rol?: RolUsuario;
  pinHash?: string;
  pinSalt?: string;
};

export function esRolValido(rol: unknown): rol is RolUsuario {
  return rol === 'medico' || rol === 'secretaria';
}

export const LABELS_ROL: Record<RolUsuario, string> = {
  medico: 'Médico/a',
  secretaria: 'Secretaría',
};

