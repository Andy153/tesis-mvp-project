import { supabaseAdmin } from '@/lib/supabase-admin'

export type WorkflowObraSocial = 'swiss_medical' | 'osde'
export type WorkflowTipo = 'envio_mensual'
export type WorkflowEtapa =
  | 'enviando'
  | 'enviado'
  | 'cobros_wizard'
  | 'completado'
  | 'fallido'
  | 'cancelado'

/** Etapas en las que no se puede eliminar el documento/liquidación. */
export const BLOCKING_ETAPAS: WorkflowEtapa[] = [
  'enviando',
  'enviado',
  'cobros_wizard',
  'completado',
  'fallido',
]

export type DeletionPolicyResult = {
  allowed: boolean
  code?: 'SMG_PROCESS_LOCKED' | 'NOT_FOUND'
  message?: string
  etapa?: WorkflowEtapa | null
  periodo?: string | null
  /** Si está bloqueado solo por proceso del período, se puede sacar de Trazá con confirmación extra. */
  canForceDelete?: boolean
}

export type UpsertWorkflowInput = {
  clerkUserId: string
  obraSocial: WorkflowObraSocial
  periodo: string
  tipo?: WorkflowTipo
  etapa: WorkflowEtapa
  monthlySubmissionId?: string | null
  metadata?: Record<string, unknown>
  completedAt?: string | null
}

function includedLiquidacionIds(partesIncluidos: unknown): string[] {
  if (!Array.isArray(partesIncluidos)) return []
  return partesIncluidos
    .map((p) => (p && typeof p === 'object' ? (p as { liquidacion_id?: string }).liquidacion_id : null))
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
}

export async function upsertWorkflowProcess(input: UpsertWorkflowInput): Promise<void> {
  const now = new Date().toISOString()
  const row = {
    clerk_user_id: input.clerkUserId,
    obra_social: input.obraSocial,
    periodo: input.periodo,
    tipo: input.tipo ?? 'envio_mensual',
    etapa: input.etapa,
    monthly_submission_id: input.monthlySubmissionId ?? null,
    metadata: input.metadata ?? {},
    updated_at: now,
    ...(input.etapa === 'enviando' ? { started_at: now } : {}),
    ...(input.completedAt !== undefined ? { completed_at: input.completedAt } : {}),
  }

  const { error } = await supabaseAdmin.from('workflow_processes').upsert(row, {
    onConflict: 'clerk_user_id,obra_social,periodo,tipo',
  })

  if (error) {
    console.warn('[workflow] upsert_error', error.message, row)
  }
}

export async function syncWorkflowFromSubmission(
  submissionId: string,
  clerkUserId: string,
): Promise<void> {
  const { data: sub, error } = await supabaseAdmin
    .from('monthly_submissions')
    .select(
      'id, periodo, obra_social, status, wizard_estado, wizard_paso, wizard_completado_en, partes_incluidos, enviado_en',
    )
    .eq('id', submissionId)
    .eq('clerk_user_id', clerkUserId)
    .maybeSingle()

  if (error || !sub) return

  let etapa: WorkflowEtapa
  if (sub.wizard_completado_en) {
    etapa =
      sub.wizard_estado === 'descartado' ? 'cancelado' : 'completado'
  } else if (sub.status === 'fallido') {
    etapa = 'fallido'
  } else if (sub.status === 'enviando') {
    etapa = 'enviando'
  } else if (sub.status === 'enviado') {
    etapa = sub.wizard_estado ? 'cobros_wizard' : 'enviado'
  } else {
    return
  }

  await upsertWorkflowProcess({
    clerkUserId,
    obraSocial: (sub.obra_social as WorkflowObraSocial) || 'swiss_medical',
    periodo: sub.periodo,
    etapa,
    monthlySubmissionId: sub.id,
    metadata: {
      status: sub.status,
      wizard_estado: sub.wizard_estado,
      wizard_paso: sub.wizard_paso,
      liquidacion_ids: includedLiquidacionIds(sub.partes_incluidos),
    },
    completedAt: sub.wizard_completado_en ?? null,
  })
}

async function isLiquidacionInActiveSubmission(
  userId: string,
  liquidacionId: string,
): Promise<boolean> {
  const { data: subs, error } = await supabaseAdmin
    .from('monthly_submissions')
    .select('id, status, partes_incluidos')
    .eq('clerk_user_id', userId)
    .in('status', ['enviando', 'enviado'])

  if (error || !subs?.length) return false

  for (const sub of subs) {
    const ids = includedLiquidacionIds(sub.partes_incluidos)
    if (ids.includes(liquidacionId)) return true
  }
  return false
}

async function isPeriodBlockedByWorkflow(
  userId: string,
  periodo: string | null,
  liquidacionId: string,
): Promise<{ blocked: boolean; etapa?: WorkflowEtapa }> {
  if (!periodo) return { blocked: false }

  const { data: proc, error } = await supabaseAdmin
    .from('workflow_processes')
    .select('etapa, metadata')
    .eq('clerk_user_id', userId)
    .eq('obra_social', 'swiss_medical')
    .eq('periodo', periodo)
    .eq('tipo', 'envio_mensual')
    .maybeSingle()

  if (error || !proc) return { blocked: false }
  if (!BLOCKING_ETAPAS.includes(proc.etapa as WorkflowEtapa)) return { blocked: false }

  const metaIds = includedLiquidacionIds(
    (proc.metadata as { liquidacion_ids?: unknown })?.liquidacion_ids ?? [],
  )
  // Solo bloquea partes explícitamente vinculados al envío; no todo el período.
  if (metaIds.includes(liquidacionId)) {
    return { blocked: true, etapa: proc.etapa as WorkflowEtapa }
  }
  return { blocked: false }
}

export async function getDeletionPolicyForLiquidacion(
  userId: string,
  liquidacionId: string,
  options?: { force?: boolean },
): Promise<DeletionPolicyResult> {
  const { data: liq, error } = await supabaseAdmin
    .from('liquidaciones')
    .select('id, periodo, estado, clerk_user_id')
    .eq('id', liquidacionId)
    .eq('clerk_user_id', userId)
    .maybeSingle()

  if (error) return { allowed: false, code: 'NOT_FOUND', message: error.message }
  if (!liq) return { allowed: false, code: 'NOT_FOUND', message: 'Liquidación no encontrada' }

  const inActiveSubmission = await isLiquidacionInActiveSubmission(userId, liquidacionId)

  if (liq.estado === 'presentado') {
    if (options?.force) return { allowed: true }
    return {
      allowed: false,
      code: 'SMG_PROCESS_LOCKED',
      message:
        'Este parte ya fue enviado a Swiss Medical por mail. Ese envío no se puede deshacer desde Trazá; para cambios en Swiss, contactalos directamente. Si solo querés sacarlo de tu historial en Trazá, podés hacerlo abajo.',
      etapa: 'enviado',
      periodo: liq.periodo,
      canForceDelete: true,
    }
  }

  if (inActiveSubmission) {
    if (options?.force) return { allowed: true }
    return {
      allowed: false,
      code: 'SMG_PROCESS_LOCKED',
      message:
        'Este parte está incluido en un envío a Swiss Medical en curso o ya enviado. Para modificaciones ante la prepaga, contactá a Swiss Medical. Si querés quitarlo solo de Trazá, podés hacerlo abajo.',
      etapa: 'enviado',
      periodo: liq.periodo,
      canForceDelete: true,
    }
  }

  const wf = await isPeriodBlockedByWorkflow(userId, liq.periodo, liquidacionId)
  if (wf.blocked && !options?.force) {
    const msg =
      wf.etapa === 'enviando'
        ? 'Ya iniciaste el envío a Swiss Medical para este período. Esperá a que termine o contactá a Swiss Medical si necesitás cambios.'
        : 'Hay un proceso de cobro Swiss Medical activo para este período. Si este parte no fue incluido en el mail, podés sacarlo de Trazá igualmente.'
    return {
      allowed: false,
      code: 'SMG_PROCESS_LOCKED',
      message: msg,
      etapa: wf.etapa ?? null,
      periodo: liq.periodo,
      canForceDelete: true,
    }
  }

  return { allowed: true }
}

export async function getDeletionPolicyForDocument(
  userId: string,
  documentId: string,
  options?: { force?: boolean },
): Promise<DeletionPolicyResult> {
  const { data: liqs, error } = await supabaseAdmin
    .from('liquidaciones')
    .select('id')
    .eq('clerk_user_id', userId)
    .eq('document_id', documentId)

  if (error) return { allowed: false, code: 'NOT_FOUND', message: error.message }
  if (!liqs?.length) return { allowed: true }

  for (const liq of liqs) {
    const policy = await getDeletionPolicyForLiquidacion(userId, liq.id, options)
    if (!policy.allowed) return policy
  }
  return { allowed: true }
}
