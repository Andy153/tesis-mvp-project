-- migrations/20260524_notas_credito_y_receptor.sql
-- Sprint 5: habilita Notas de Crédito sobre monthly_submissions
-- y agrega persistencia de datos del receptor al emitir factura.
--
-- Cambios:
--   1) tipo_comprobante: distingue Factura C (11) de Nota de Crédito C (13)
--   2) submission_anulada_id: en NC, apunta a la factura original
--   3) motivo_anulacion: texto libre del médico (no va a ARCA)
--   4) receptor_cuit / receptor_razon_social / receptor_condicion_iva:
--      persiste los datos del receptor al emitir, para no depender del padrón
--      en consultas posteriores (NC, reportes, auditoría).
--
-- Es seguro aplicar: todas las columnas nuevas son nullable o tienen default,
-- y los constraints solo aplican a filas con tipo_comprobante = 13 (NC),
-- que aún no existen. Las filas actuales (todas Factura C) quedan en tipo 11.

BEGIN;

-- ============================================================
-- 1) NC: tipo de comprobante + referencia + motivo
-- ============================================================

ALTER TABLE monthly_submissions
  ADD COLUMN IF NOT EXISTS tipo_comprobante integer NOT NULL DEFAULT 11;

ALTER TABLE monthly_submissions
  ADD COLUMN IF NOT EXISTS submission_anulada_id uuid
    REFERENCES monthly_submissions(id);

ALTER TABLE monthly_submissions
  ADD COLUMN IF NOT EXISTS motivo_anulacion text;

-- Lookup rápido: ¿esta factura ya tiene NC asociada?
CREATE INDEX IF NOT EXISTS idx_monthly_submissions_anulada
  ON monthly_submissions(submission_anulada_id)
  WHERE submission_anulada_id IS NOT NULL;

-- Integridad: solo las NC pueden tener submission_anulada_id.
-- (Usamos NOT VALID + VALIDATE en dos pasos para no escanear la tabla entera
-- con un lock fuerte; en una tabla chica esto da igual pero es buena costumbre.)
ALTER TABLE monthly_submissions
  ADD CONSTRAINT chk_nc_referencia
  CHECK (
    (tipo_comprobante = 13 AND submission_anulada_id IS NOT NULL)
    OR
    (tipo_comprobante <> 13 AND submission_anulada_id IS NULL)
  ) NOT VALID;

ALTER TABLE monthly_submissions VALIDATE CONSTRAINT chk_nc_referencia;

-- ============================================================
-- 2) Receptor: persistencia al emitir
-- ============================================================
-- Estos campos se completan en cada emisión nueva.
-- Las filas existentes los tendrán NULL (deuda técnica controlada):
-- al emitir NC sobre una factura vieja con receptor NULL, fallback a padrón.

ALTER TABLE monthly_submissions
  ADD COLUMN IF NOT EXISTS receptor_cuit text;

ALTER TABLE monthly_submissions
  ADD COLUMN IF NOT EXISTS receptor_razon_social text;

ALTER TABLE monthly_submissions
  ADD COLUMN IF NOT EXISTS receptor_condicion_iva_id integer;

-- Documentamos las columnas para que sea claro en pgAdmin / Supabase Studio
COMMENT ON COLUMN monthly_submissions.tipo_comprobante IS
  'Código ARCA: 11 = Factura C, 13 = Nota de Crédito C';
COMMENT ON COLUMN monthly_submissions.submission_anulada_id IS
  'Solo en NC (tipo 13): FK a la factura original que esta NC anula';
COMMENT ON COLUMN monthly_submissions.motivo_anulacion IS
  'Motivo opcional escrito por el médico al emitir NC. No se envía a ARCA.';
COMMENT ON COLUMN monthly_submissions.receptor_cuit IS
  'CUIT del receptor del comprobante (sin guiones). NULL en filas previas al Sprint 5.';
COMMENT ON COLUMN monthly_submissions.receptor_razon_social IS
  'Razón social del receptor al momento de emitir.';
COMMENT ON COLUMN monthly_submissions.receptor_condicion_iva_id IS
  'Código ARCA de condición frente al IVA del receptor (ver CONDICION_IVA_LABELS).';

COMMIT;

-- ============================================================
-- Verificación post-migración
-- ============================================================
-- Después de aplicar, correr para confirmar:
--
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'monthly_submissions'
--   AND column_name IN (
--     'tipo_comprobante', 'submission_anulada_id', 'motivo_anulacion',
--     'receptor_cuit', 'receptor_razon_social', 'receptor_condicion_iva_id'
--   )
-- ORDER BY column_name;
--
-- Deberías ver las 6 columnas nuevas.
