-- migrations/20260524b_numero_comprobante.sql
-- Sprint 5 (Paso B): agrega numero_comprobante a monthly_submissions.
--
-- Razón: para emitir Nota de Crédito, ARCA exige el bloque CbtesAsoc con
-- (Tipo, PtoVta, Nro) del comprobante original. Hoy guardamos CAE pero
-- no el número del comprobante, así que no podemos referenciarlo.
--
-- Compatibilidad: nullable porque las filas previas no tienen este dato
-- guardado. El código que emite factura (post-refactor) lo va a poblar
-- en todas las emisiones nuevas. Para emitir NC sobre facturas viejas
-- sin número guardado, hace falta o backfill manual o que el médico
-- recargue ese dato a mano (no esperable que tengan NC pendientes
-- sobre facturas pre-Sprint 5).

BEGIN;

ALTER TABLE monthly_submissions
  ADD COLUMN IF NOT EXISTS numero_comprobante integer;

COMMENT ON COLUMN monthly_submissions.numero_comprobante IS
  'Número de comprobante asignado por ARCA al autorizar el CAE. Sin este dato no se puede emitir NC referenciando esta factura.';

CREATE INDEX IF NOT EXISTS idx_monthly_submissions_pv_nro
  ON monthly_submissions(clerk_user_id, tipo_comprobante, numero_comprobante)
  WHERE numero_comprobante IS NOT NULL;

COMMIT;

-- Verificación post-migración:
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'monthly_submissions' AND column_name = 'numero_comprobante';
