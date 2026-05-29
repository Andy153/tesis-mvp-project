-- Aviso si el wizard de cobro quedó abandonado (paso 4+, sin actividad 24 h).

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_tipo_check;

ALTER TABLE notifications ADD CONSTRAINT notifications_tipo_check CHECK (
  tipo IN (
    'recordatorio_envio',
    'recordatorio_envio_29',
    'recordatorio_envio_5',
    'recordatorio_envio_8',
    'partes_con_errores',
    'perfil_fiscal_incompleto',
    'wizard_abandonado',
    '48h_cumplidas',
    'factura_emitida',
    'error_critico',
    'accion_cobros'
  )
);
