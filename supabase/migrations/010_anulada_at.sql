-- =============================================================================
-- Migration: 010 - anulada_at en monthly_submissions
-- =============================================================================
-- Sprint 6: agregar timestamp de anulación a las facturas que tienen NC emitida.
--
-- Contexto:
--   Hoy, cuando se emite una NC sobre una factura, `revertirWizardAPasoFacturaTrasNotaCredito`
--   limpia los datos fiscales de la factura original (cae_numero, numero_comprobante,
--   factura_path → NULL) y vuelve el wizard al paso 4 para re-emitir.
--
--   Eso atiende el flujo operativo (poder emitir factura nueva), pero pierde la
--   señal "esta factura fue anulada" para listados, reportes y auditoría.
--
--   `anulada_at` agrega esa señal sin tocar el flujo del wizard.
--
-- Cambios:
--   1. Agregar columna `anulada_at TIMESTAMPTZ NULL` a monthly_submissions.
--   2. Index parcial para acelerar queries que filtran/excluyen anuladas.
--      Solo indexamos las filas con anulada_at IS NOT NULL (minoría).
-- =============================================================================

ALTER TABLE monthly_submissions
  ADD COLUMN IF NOT EXISTS anulada_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_monthly_submissions_anulada_at
  ON monthly_submissions(anulada_at)
  WHERE anulada_at IS NOT NULL;
