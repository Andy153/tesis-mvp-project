-- Registro de procesos iniciados (envío mensual SMG; extensible a OSDE).
-- Solo se crea cuando el médico inicia el envío (enviando) o posterior.

CREATE TABLE IF NOT EXISTS workflow_processes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id text NOT NULL,
  obra_social text NOT NULL,
  periodo text NOT NULL,
  tipo text NOT NULL DEFAULT 'envio_mensual',
  etapa text NOT NULL,
  monthly_submission_id uuid NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL,
  CONSTRAINT workflow_processes_unique_period
    UNIQUE (clerk_user_id, obra_social, periodo, tipo)
);

CREATE INDEX IF NOT EXISTS idx_workflow_processes_user_obra
  ON workflow_processes (clerk_user_id, obra_social);

CREATE INDEX IF NOT EXISTS idx_workflow_processes_submission
  ON workflow_processes (monthly_submission_id)
  WHERE monthly_submission_id IS NOT NULL;

-- Backfill desde envíos Swiss ya existentes
INSERT INTO workflow_processes (
  clerk_user_id,
  obra_social,
  periodo,
  tipo,
  etapa,
  monthly_submission_id,
  metadata,
  started_at,
  updated_at,
  completed_at
)
SELECT
  ms.clerk_user_id,
  ms.obra_social,
  ms.periodo,
  'envio_mensual',
  CASE
    WHEN ms.wizard_completado_en IS NOT NULL
      AND ms.wizard_estado IN ('aprobado', 'excepcion_enviada', 'descartado')
      THEN 'completado'
    WHEN ms.status = 'enviado' AND ms.wizard_estado IS NOT NULL
      THEN 'cobros_wizard'
    WHEN ms.status = 'enviado' THEN 'enviado'
    WHEN ms.status = 'enviando' THEN 'enviando'
    WHEN ms.status = 'fallido' THEN 'fallido'
    ELSE 'enviado'
  END,
  ms.id,
  jsonb_build_object(
    'wizard_estado', ms.wizard_estado,
    'wizard_paso', ms.wizard_paso,
    'status', ms.status,
    'backfilled', true
  ),
  COALESCE(ms.enviado_en, ms.created_at, now()),
  COALESCE(ms.updated_at, now()),
  ms.wizard_completado_en
FROM monthly_submissions ms
WHERE ms.obra_social = 'swiss_medical'
  AND ms.status IN ('enviando', 'enviado', 'fallido')
ON CONFLICT (clerk_user_id, obra_social, periodo, tipo) DO NOTHING;
