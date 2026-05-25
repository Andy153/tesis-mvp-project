-- =============================================================================
-- Migration: 009 - partial unique index periodo (unique_periodo_idx)
-- =============================================================================
-- Sprint 5 - Bugfix detectado en testing E2E (segundo índice duplicado):
--   Existía un segundo índice único pre-existente sobre la misma tupla
--   (clerk_user_id, periodo, obra_social):
--
--     monthly_submissions_unique_periodo_idx
--     WHERE status IN ('enviado', 'enviando')
--
--   La NC se inserta con status='enviado', clerk_user_id/periodo/obra_social
--   idénticos a los de la factura original. El índice disparaba y bloqueaba
--   la inserción.
--
--   En la migración 008 relajamos `monthly_submissions_user_periodo_obra_idx`
--   pero nos faltó este segundo.
--
-- Solución:
--   Agregar el filtro tipo_comprobante = 11 al WHERE de este índice, de
--   modo que la unicidad solo se exija a facturas (mismo criterio que en 008).
--
-- Deuda técnica (para Sprint 6+):
--   Los dos índices ahora cumplen funciones casi idénticas. Evaluar
--   consolidarlos a uno solo. No hacerlo ahora porque podría haber
--   ON CONFLICT en el código que referencie un nombre de índice
--   específicamente.
-- =============================================================================

DROP INDEX IF EXISTS monthly_submissions_unique_periodo_idx;

CREATE UNIQUE INDEX monthly_submissions_unique_periodo_idx
  ON monthly_submissions (clerk_user_id, periodo, obra_social)
  WHERE status IN ('enviado', 'enviando')
    AND tipo_comprobante = 11;

-- Verificación:
--   SELECT indexdef
--   FROM pg_indexes
--   WHERE indexname = 'monthly_submissions_unique_periodo_idx';
