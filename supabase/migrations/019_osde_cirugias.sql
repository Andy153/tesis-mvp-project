-- supabase/migrations/012_osde_cirugias.sql
-- Persistencia del wizard-guía de cobro de cirugía OSDE (CobrosWizardOsde).
-- ADITIVA: tabla nueva. No toca monthly_submissions, ai_extractions ni nada de Swiss.
--
-- Es el espejo OSDE de los campos wizard_* que monthly_submissions usa para Swiss,
-- pero modelado POR CIRUGÍA (no por liquidación mensual): cada fila = una cirugía
-- que el médico está cobrando, con el avance de los 6 pasos del wizard.
--
-- Nota: cuando se destrabe la integración con Activia, esta tabla se podrá vincular
-- con osde_transacciones (los envíos XML reales). Por ahora es autónoma.

CREATE TABLE IF NOT EXISTS osde_cirugias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Dueño (convención del proyecto: clerk_user_id, NO user_id).
  clerk_user_id TEXT NOT NULL,

  -- Parte del que salió esta cirugía (lo que extrajo la IA). Opcional: el médico
  -- también podría arrancar el wizard manualmente sin un parte cargado.
  ai_extraction_id UUID REFERENCES ai_extractions(id) ON DELETE SET NULL,

  -- Contexto para mostrar en la tarjeta sin re-consultar la extracción.
  paciente TEXT,
  afiliado TEXT,
  fecha_cirugia DATE,
  monto_estimado NUMERIC(14,2),

  -- Estado del wizard.
  wizard_paso INT NOT NULL DEFAULT 1
    CHECK (wizard_paso BETWEEN 1 AND 7),                 -- 7 = completado (paso > 6)
  wizard_estado TEXT NOT NULL DEFAULT 'en_curso'
    CHECK (wizard_estado IN ('en_curso', 'rechazado', 'cobrado', 'descartado')),

  -- Datos que el médico registra en cada paso (todos opcionales).
  numero_tramite_apligem TEXT,                           -- paso 1
  numero_registracion_protocolo TEXT,                    -- paso 2
  resultado_consulta TEXT
    CHECK (resultado_consulta IS NULL OR resultado_consulta IN ('pendiente', 'aprobado', 'rechazado')), -- paso 3
  factura_emitida_en TIMESTAMPTZ,                         -- paso 4
  comprobante_cargado_en TIMESTAMPTZ,                     -- paso 5
  cobrado_en TIMESTAMPTZ,                                 -- paso 6

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_osde_cirugias_user ON osde_cirugias (clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_osde_cirugias_extraction ON osde_cirugias (ai_extraction_id);
-- Para listar las cirugías en curso del médico en el dashboard.
CREATE INDEX IF NOT EXISTS idx_osde_cirugias_user_estado ON osde_cirugias (clerk_user_id, wizard_estado);

-- El acceso se filtra por clerk_user_id desde el endpoint (con supabaseAdmin),
-- igual que el resto del proyecto. No se agregan policies RLS para mantener el
-- mismo patrón que las tablas de Swiss.
