-- =============================================================================
-- Migration: 011 - Permitir múltiples submissions tipo=11 por período si están anuladas
-- =============================================================================
-- Sprint 7: post-NC, el flujo crea una nueva submission tipo=11 para re-emisión.
-- Los unique indexes parciales del Sprint 5 (`WHERE tipo_comprobante = 11`)
-- impiden eso. Hay que ajustarlos para que solo apliquen a submissions activas
-- (no anuladas).
--
-- Cambios:
--   1. monthly_submissions_user_periodo_obra_idx: agregar `AND anulada_at IS NULL`
--   2. monthly_submissions_unique_periodo_idx: idem
--
-- Razón: queremos garantizar "solo una factura activa por período/obra_social".
-- Submissions anuladas son historial y no compiten por uniqueness.
-- =============================================================================

-- 1) Recrear monthly_submissions_user_periodo_obra_idx
DROP INDEX IF EXISTS monthly_submissions_user_periodo_obra_idx;

CREATE UNIQUE INDEX monthly_submissions_user_periodo_obra_idx
  ON monthly_submissions (clerk_user_id, periodo, obra_social)
  WHERE tipo_comprobante = 11 AND anulada_at IS NULL;

-- 2) Recrear monthly_submissions_unique_periodo_idx
-- Nota: el WHERE original incluía filtro por status. Lo conservamos.
DROP INDEX IF EXISTS monthly_submissions_unique_periodo_idx;

CREATE UNIQUE INDEX monthly_submissions_unique_periodo_idx
  ON monthly_submissions (clerk_user_id, periodo, obra_social)
  WHERE status IN ('enviado', 'enviando')
    AND tipo_comprobante = 11
    AND anulada_at IS NULL;

-- Verificación:
--   SELECT indexname, indexdef
--   FROM pg_indexes
--   WHERE tablename = 'monthly_submissions'
--     AND indexname IN (
--       'monthly_submissions_user_periodo_obra_idx',
--       'monthly_submissions_unique_periodo_idx'
--     );
