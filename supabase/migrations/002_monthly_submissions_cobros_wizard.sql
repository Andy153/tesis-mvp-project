-- Wizard post-envío Swiss (seguimiento de cobro).
ALTER TABLE monthly_submissions
  ADD COLUMN IF NOT EXISTS wizard_estado text DEFAULT NULL;

ALTER TABLE monthly_submissions
  ADD COLUMN IF NOT EXISTS wizard_paso integer DEFAULT 1;

ALTER TABLE monthly_submissions
  ADD COLUMN IF NOT EXISTS monto_total numeric DEFAULT NULL;

ALTER TABLE monthly_submissions
  ADD COLUMN IF NOT EXISTS comprobante_smg_path text DEFAULT NULL;

ALTER TABLE monthly_submissions
  ADD COLUMN IF NOT EXISTS factura_path text DEFAULT NULL;

ALTER TABLE monthly_submissions
  ADD COLUMN IF NOT EXISTS cai_numero text DEFAULT NULL;

ALTER TABLE monthly_submissions
  ADD COLUMN IF NOT EXISTS cai_vencimiento text DEFAULT NULL;

ALTER TABLE monthly_submissions
  ADD COLUMN IF NOT EXISTS factura_adjuntada_en timestamptz DEFAULT NULL;

ALTER TABLE monthly_submissions
  ADD COLUMN IF NOT EXISTS wizard_completado_en timestamptz DEFAULT NULL;

-- Legacy (primer borrador); puede ignorarse si no se usa.
ALTER TABLE monthly_submissions
  ADD COLUMN IF NOT EXISTS cobros_wizard_state jsonb DEFAULT NULL;
