-- Alinear CHECK de wizard_estado con los valores que usa la app (wizard route + swissCxSend).
-- Si el constraint se creó antes con otra lista (p. ej. sin factura_instrucciones), el paso 4 falla.

ALTER TABLE monthly_submissions
  DROP CONSTRAINT IF EXISTS monthly_submissions_wizard_estado_check;

-- Normalizar nombre legacy si existía en datos viejos
UPDATE monthly_submissions
SET wizard_estado = 'factura_instrucciones'
WHERE wizard_estado = 'factura_emitida';

ALTER TABLE monthly_submissions
  ADD CONSTRAINT monthly_submissions_wizard_estado_check
  CHECK (
    wizard_estado IS NULL
    OR wizard_estado IN (
      'esperando_comprobante',
      'comprobante_disponible',
      'comprobante_subido',
      'factura_instrucciones',
      'factura_adjuntada',
      'aprobado',
      'excepcion_enviada',
      'descartado'
    )
  );
