-- Push Web (PWA) — suscripciones por dispositivo/navegador

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id   TEXT NOT NULL,
  endpoint        TEXT NOT NULL,
  subscription    JSONB NOT NULL,
  user_agent      TEXT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_endpoint_idx
  ON push_subscriptions (endpoint);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx
  ON push_subscriptions (clerk_user_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
