-- migrations/20260523_wizard_arca_manual_steps.sql
--
-- Agrega columna para persistir los checks manuales del Wizard de configuración ARCA.
-- Los pasos que ocurren dentro del portal de ARCA no se pueden auto-detectar desde Trazá,
-- así que el médico los marca como completos manualmente.
--
-- Forma de los datos:
--   { "crear-pv-webservices": true, "entrar-portal-certs": true, ... }
--
-- Solo aparecen las keys de pasos marcados. Si una key no está, el paso no está marcado.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS arca_wizard_manual_steps jsonb
    NOT NULL
    DEFAULT '{}'::jsonb;

-- Opcional: si Juana ya está operando en producción y queremos darle el wizard "completo"
-- retroactivamente, podés correr esto manualmente apuntando a su user_id:
--
-- UPDATE profiles
-- SET arca_wizard_manual_steps = '{
--   "crear-pv-webservices": true,
--   "entrar-portal-certs": true,
--   "crear-certificado": true,
--   "adherir-servicios": true,
--   "descargar-crt": true
-- }'::jsonb
-- WHERE user_id = 'user_3DDcvSkcq7q2zOP9n3YM0FNDeR6';
