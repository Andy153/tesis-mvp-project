-- =============================================================================
-- Migration: 007 - numero_comprobante en monthly_submissions
-- =============================================================================
-- Sprint 5 (parte 2/2): agregar columna numero_comprobante para guardar el
-- número correlativo del comprobante en ARCA (sin el PV).
--
-- Necesario para:
--   - Mostrar "Factura N° 0010-00000007" en la UI sin tener que parsear el
--     factura_path o llamar a ARCA cada vez.
--   - Construir el bloque CbtesAsoc de las Notas de Crédito (la NC necesita
--     referenciar el número de la factura original que está anulando).
--
-- Backfill:
--   Las filas anteriores quedan con numero_comprobante NULL. No se intenta
--   completar retroactivamente — si se necesita emitir NC sobre una factura
--   pre-Sprint 5, hay que poblar este campo manualmente leyendo el PDF o
--   consultando ARCA.
-- =============================================================================

ALTER TABLE monthly_submissions
  ADD COLUMN IF NOT EXISTS numero_comprobante INTEGER;

-- Verificación:
--   SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--   WHERE table_name = 'monthly_submissions'
--     AND column_name = 'numero_comprobante';
