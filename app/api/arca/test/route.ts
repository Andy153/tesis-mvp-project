import { NextResponse } from 'next/server'
import { afipClient } from '@/lib/arca/client'

export async function GET() {
  try {
    const status = await afipClient.ElectronicBilling.getServerStatus()
    return NextResponse.json({ ok: true, status })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
