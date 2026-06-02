-- Montos del ciclo de cobro: comprobante → facturado (ARCA) → cobrado.
-- Espejo en osde_cirugias + columnas OSDE que ya usa la app.

ALTER TABLE monthly_submissions
  ADD COLUMN IF NOT EXISTS monto_comprobante NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS monto_facturado NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS monto_cobrado NUMERIC(14, 2);

UPDATE monthly_submissions
SET
  monto_comprobante = COALESCE(monto_comprobante, monto_total),
  monto_facturado = COALESCE(
    monto_facturado,
    CASE WHEN cae_numero IS NOT NULL THEN monto_total END
  )
WHERE monto_total IS NOT NULL;

ALTER TABLE osde_cirugias
  ADD COLUMN IF NOT EXISTS monto_extranet NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS nro_tramite_osde TEXT,
  ADD COLUMN IF NOT EXISTS monthly_submission_id UUID REFERENCES monthly_submissions (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fecha_corte_estimada DATE,
  ADD COLUMN IF NOT EXISTS tiene_debito BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS monto_comprobante NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS monto_facturado NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS monto_cobrado NUMERIC(14, 2);

UPDATE osde_cirugias
SET monto_comprobante = COALESCE(monto_comprobante, monto_extranet)
WHERE monto_extranet IS NOT NULL;

ALTER TABLE osde_cirugias
  DROP CONSTRAINT IF EXISTS osde_cirugias_wizard_estado_check;

ALTER TABLE osde_cirugias
  ADD CONSTRAINT osde_cirugias_wizard_estado_check
  CHECK (
    wizard_estado IN ('en_curso', 'rechazado', 'cobrado', 'descartado', 'completado')
  );
