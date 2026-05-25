-- =============================================================================
-- Migration: 008 - partial unique index facturas (user_periodo_obra_idx)
-- =============================================================================
-- Sprint 5 - Bugfix detectado en testing E2E:
--   El índice único (clerk_user_id, periodo, obra_social) impedía insertar
--   una Nota de Crédito (tipo_comprobante = 13) sobre un período que ya
--   tenía una factura (tipo_comprobante = 11), porque ambas comparten esos
--   tres campos.
--
-- Solución:
--   Convertir el índice en parcial: la unicidad aplica SOLO a facturas
--   (tipo_comprobante = 11). Las NCs no tienen restricción de unicidad
--   sobre esa tupla, lo que permite múltiples NCs por período en caso de
--   re-emisión.
--
-- Reglas fiscales preservadas:
--   * Una sola factura por médico/mes/obra social → garantizado por el
--     partial index.
--   * NCs múltiples permitidas → cada NC se referencia a su factura via
--     submission_anulada_id (chk_nc_referencia ya valida eso).
-- =============================================================================

DROP INDEX IF EXISTS monthly_submissions_user_periodo_obra_idx;

CREATE UNIQUE INDEX monthly_submissions_user_periodo_obra_idx
  ON monthly_submissions (clerk_user_id, periodo, obra_social)
  WHERE tipo_comprobante = 11;

-- Verificación:
--   SELECT indexdef
--   FROM pg_indexes
--   WHERE indexname = 'monthly_submissions_user_periodo_obra_idx';
