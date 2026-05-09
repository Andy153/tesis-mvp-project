-- Tabla de invitaciones para secretarias
-- Token activo = used_at IS NULL AND expires_at > NOW()
-- Un médico tiene un solo token activo a la vez (ver server action generateInvitationToken,
-- que hace DELETE de tokens previos del mismo medico_clerk_id antes de insertar el nuevo).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS invitations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  medico_clerk_id TEXT NOT NULL,
  secretaria_clerk_id TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ DEFAULT NULL
);

-- Índice para búsqueda rápida por token (validación pre-registro)
CREATE INDEX IF NOT EXISTS invitations_token_idx ON invitations(token);

-- Índice para buscar el token activo de un médico
CREATE INDEX IF NOT EXISTS invitations_medico_idx ON invitations(medico_clerk_id);
