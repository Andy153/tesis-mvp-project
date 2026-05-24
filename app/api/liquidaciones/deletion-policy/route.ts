import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getDeletionPolicyForDocument, getDeletionPolicyForLiquidacion } from '@/lib/workflow-processes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const documentId = url.searchParams.get('document_id')
  const liquidacionId = url.searchParams.get('liquidacion_id')
  const force = url.searchParams.get('force') === '1'

  if (!documentId && !liquidacionId) {
    return NextResponse.json(
      { error: 'Indicá document_id o liquidacion_id' },
      { status: 400 },
    )
  }

  const policy = documentId
    ? await getDeletionPolicyForDocument(userId, documentId, { force })
    : await getDeletionPolicyForLiquidacion(userId, liquidacionId!, { force })

  return NextResponse.json(policy)
}
