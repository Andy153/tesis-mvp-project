-- =============================================================================
-- Migration: 006 - Notas de Crédito y persistencia de receptor
-- =============================================================================
-- Sprint 5 (parte 1/2): preparar el schema para soportar Notas de Crédito
-- y persistir los datos del receptor del comprobante en monthly_submissions.
--
-- Cambios:
--   1. Agregar tipo_comprobante con default 11 (Factura C). NCs usan 13.
--   2. Agregar submission_anulada_id como FK a la factura original (solo NC).
--   3. Agregar motivo_anulacion para registro interno (no se envía a ARCA).
--   4. Agregar columnas de receptor para no consultar el padrón cada vez:
--      receptor_cuit, receptor_razon_social, receptor_condicion_iva_id.
--   5. Check constraint: NC (tipo 13) DEBE tener submission_anulada_id,
--      factura (tipo 11) NO DEBE tenerlo.
-- =============================================================================

-- 1. tipo_comprobante (11 = Factura C, 13 = Nota de Crédito C)
ALTER TABLE monthly_submissions
  ADD COLUMN IF NOT EXISTS tipo_comprobante INTEGER NOT NULL DEFAULT 11;

-- 2. submission_anulada_id: FK a la factura original (solo NC la usa)
ALTER TABLE monthly_submissions
  ADD COLUMN IF NOT EXISTS submission_anulada_id UUID
    REFERENCES monthly_submissions(id);

-- 3. motivo_anulacion: texto libre opcional, para registro interno
ALTER TABLE monthly_submissions
  ADD COLUMN IF NOT EXISTS motivo_anulacion TEXT;

-- 4. Receptor persistido (snapshot al momento de emisión)
ALTER TABLE monthly_submissions
  ADD COLUMN IF NOT EXISTS receptor_cuit TEXT;

ALTER TABLE monthly_submissions
  ADD COLUMN IF NOT EXISTS receptor_razon_social TEXT;

ALTER TABLE monthly_submissions
  ADD COLUMN IF NOT EXISTS receptor_condicion_iva_id INTEGER;

-- 5. Check constraint: relación tipo <-> submission_anulada_id
ALTER TABLE monthly_submissions
  DROP CONSTRAINT IF EXISTS chk_nc_referencia;

ALTER TABLE monthly_submissions
  ADD CONSTRAINT chk_nc_referencia CHECK (
    (tipo_comprobante = 13 AND submission_anulada_id IS NOT NULL)
    OR
    (tipo_comprobante <> 13 AND submission_anulada_id IS NULL)
  );

-- Verificación:
--   SELECT column_name, data_type, column_default
--   FROM information_schema.columns
--   WHERE table_name = 'monthly_submissions'
--     AND column_name IN (
--       'tipo_comprobante', 'submission_anulada_id', 'motivo_anulacion',
--       'receptor_cuit', 'receptor_razon_social', 'receptor_condicion_iva_id'
--     );
