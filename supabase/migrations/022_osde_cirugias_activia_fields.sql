-- supabase/migrations/022_osde_cirugias_activia_fields.sql
-- Agrega campos para integración Activia: número de autorización OSDE y código de prestación.
-- Ambos se pre-cargan desde la extracción IA y el médico puede editarlos en el wizard V2.

ALTER TABLE osde_cirugias
  ADD COLUMN IF NOT EXISTS nro_autorizacion_osde TEXT,
  ADD COLUMN IF NOT EXISTS cod_prestacion TEXT;

COMMENT ON COLUMN osde_cirugias.nro_autorizacion_osde IS
  'Número de autorización OSDE (6-8 dígitos). Viene del bono o lo ingresa el médico.';
COMMENT ON COLUMN osde_cirugias.cod_prestacion IS
  'Código de prestación del nomenclador OSDE. Extraído por IA del parte quirúrgico.';
