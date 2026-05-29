-- Centro de Avisos in-app (Fase 1). Acceso vía API Clerk + service role; RLS bloquea anon directo.

CREATE TABLE IF NOT EXISTS notifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id TEXT NOT NULL,
  tipo          TEXT NOT NULL,
  titulo        TEXT NOT NULL,
  mensaje       TEXT NOT NULL,
  leida         BOOLEAN NOT NULL DEFAULT false,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key    TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at       TIMESTAMPTZ NULL,
  CONSTRAINT notifications_tipo_check CHECK (
    tipo IN (
      'recordatorio_envio',
      '48h_cumplidas',
      'factura_emitida',
      'error_critico',
      'accion_cobros'
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS notifications_user_dedupe_idx
  ON notifications (clerk_user_id, dedupe_key);

CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON notifications (clerk_user_id, leida, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_user_created_idx
  ON notifications (clerk_user_id, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
