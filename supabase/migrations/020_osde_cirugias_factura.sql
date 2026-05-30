ALTER TABLE osde_cirugias
  ADD COLUMN IF NOT EXISTS cae_numero TEXT,
  ADD COLUMN IF NOT EXISTS cae_vencimiento TEXT,
  ADD COLUMN IF NOT EXISTS numero_comprobante INT,
  ADD COLUMN IF NOT EXISTS factura_path TEXT;
