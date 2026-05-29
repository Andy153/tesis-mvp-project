-- Recordatorios de envío escalonados (días 29, 5 y 8).

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_tipo_check;

ALTER TABLE notifications ADD CONSTRAINT notifications_tipo_check CHECK (
  tipo IN (
    'recordatorio_envio',
    'recordatorio_envio_29',
    'recordatorio_envio_5',
    'recordatorio_envio_8',
    '48h_cumplidas',
    'factura_emitida',
    'error_critico',
    'accion_cobros'
  )
);
