ALTER TABLE osde_cirugias
ADD COLUMN IF NOT EXISTS protocolo_enviado_en TIMESTAMPTZ;
