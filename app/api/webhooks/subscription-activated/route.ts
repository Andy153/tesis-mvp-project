import { clerkClient } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { MAIL_FROM } from '@/lib/swissCxSend'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type SubscriptionActivatedPayload = {
  type: string
  table: string
  record: {
    clerk_user_id: string
    subscription_status: string
    [key: string]: unknown
  }
  old_record: {
    subscription_status: string
    [key: string]: unknown
  }
}

function verifyWebhookSecret(req: Request): boolean {
  const expected = process.env.SUPABASE_WEBHOOK_SECRET?.trim()
  if (!expected) return false
  const provided = req.headers.get('x-webhook-secret')?.trim()
  return provided === expected
}

function buildActivationEmailHtml(appUrl: string): string {
  const loginUrl = appUrl.replace(/\/+$/, '')
  return `<!doctype html>
<html><body style="font-family:Arial,sans-serif;color:#1c1c1c;max-width:520px;">
  <h1 style="color:#1f5d3a;font-size:22px;">¡Bienvenido a Trazá!</h1>
  <p>Tu cuenta ya fue activada. Podés ingresar desde el siguiente link:</p>
  <p style="margin:24px 0;">
    <a href="${loginUrl}" style="display:inline-block;background:#1f5d3a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:600;">Ingresar a Trazá</a>
  </p>
  <p style="color:#666;font-size:14px;">Cualquier consulta respondé este mail.</p>
</body></html>`
}

export async function POST(req: Request) {
  if (!verifyWebhookSecret(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  let payload: SubscriptionActivatedPayload
  try {
    payload = (await req.json()) as SubscriptionActivatedPayload
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 500 })
  }

  const { type, table, record, old_record: oldRecord } = payload
  if (
    type !== 'UPDATE' ||
    table !== 'profiles' ||
    record?.subscription_status !== 'active' ||
    oldRecord?.subscription_status === 'active'
  ) {
    return NextResponse.json({ ok: true })
  }

  const clerkUserId = record.clerk_user_id?.trim()
  if (!clerkUserId) {
    return NextResponse.json(
      { ok: false, error: 'Missing clerk_user_id in record' },
      { status: 500 },
    )
  }

  try {
    const client = await clerkClient()
    const user = await client.users.getUser(clerkUserId)
    const email = user.emailAddresses[0]?.emailAddress?.trim()
    if (!email) {
      return NextResponse.json(
        { ok: false, error: 'No email found for user' },
        { status: 500 },
      )
    }

    const resendApiKey = process.env.RESEND_API_KEY?.trim()
    if (!resendApiKey) {
      return NextResponse.json(
        { ok: false, error: 'RESEND_API_KEY no configurado' },
        { status: 500 },
      )
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim()
    if (!appUrl) {
      return NextResponse.json(
        { ok: false, error: 'NEXT_PUBLIC_APP_URL no configurado' },
        { status: 500 },
      )
    }

    const resend = new Resend(resendApiKey)
    const sendResult = await resend.emails.send({
      from: MAIL_FROM,
      to: [email],
      subject: '¡Tu cuenta de Trazá ya está activa!',
      html: buildActivationEmailHtml(appUrl),
    })

    if (sendResult.error) {
      return NextResponse.json(
        { ok: false, error: sendResult.error.message },
        { status: 500 },
      )
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[TRAZA] webhook:subscription-activated:error', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
