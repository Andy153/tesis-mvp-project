'use server';

import { auth, clerkClient } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { UserMetadata, RolUsuario } from '@/lib/roles';
import crypto from 'crypto';

const EXPIRATION_DAYS = 7;
const TOKEN_BYTES = 32; // 32 bytes -> 64 chars hex

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

// Lee el rol desde sessionClaims; si el JWT no lo trae (no hay session template
// configurado en Clerk Dashboard), hace fallback a publicMetadata vía clerkClient.
// Devuelve un objeto plano (no discriminated union) porque el tsconfig del proyecto
// tiene "strict": false y no narrowea uniones discriminadas con literales boolean.
type MedicoCheck = { userId: string | null; error: string | null };

async function getCurrentMedicoUserId(): Promise<MedicoCheck> {
  const { userId, sessionClaims } = await auth();
  if (!userId) return { userId: null, error: 'No autenticado' };

  const claims = sessionClaims as
    | { metadata?: { rol?: RolUsuario }; publicMetadata?: { rol?: RolUsuario } }
    | undefined;
  const rolFromClaims = claims?.metadata?.rol ?? claims?.publicMetadata?.rol;

  if (rolFromClaims === 'medico') return { userId, error: null };
  if (rolFromClaims) {
    return {
      userId: null,
      error: 'Solo los médicos pueden generar invitaciones',
    };
  }

  // Fallback: el JWT no trae el rol -> leer publicMetadata directo.
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const metadata = (user.publicMetadata ?? {}) as UserMetadata;
  if (metadata.rol !== 'medico') {
    return {
      userId: null,
      error: 'Solo los médicos pueden generar invitaciones',
    };
  }
  return { userId, error: null };
}

function generateToken(): string {
  return crypto.randomBytes(TOKEN_BYTES).toString('hex');
}

export async function generateInvitationToken(): Promise<
  ActionResult<{ token: string; expiresAt: string }>
> {
  try {
    const medicoAuth = await getCurrentMedicoUserId();
    if (medicoAuth.error || !medicoAuth.userId) {
      return { success: false, error: medicoAuth.error ?? 'No autenticado' };
    }

    // Invalidar (eliminar) cualquier token previo del mismo médico
    const { error: delError } = await supabaseAdmin
      .from('invitations')
      .delete()
      .eq('medico_clerk_id', medicoAuth.userId);

    if (delError) {
      console.error('[invitations] delete previous error:', delError);
      return { success: false, error: 'No se pudieron invalidar tokens previos' };
    }

    const token = generateToken();
    const expiresAt = new Date(Date.now() + EXPIRATION_DAYS * 24 * 60 * 60 * 1000);

    const { error: insError } = await supabaseAdmin
      .from('invitations')
      .insert({
        token,
        medico_clerk_id: medicoAuth.userId,
        expires_at: expiresAt.toISOString(),
      });

    if (insError) {
      console.error('[invitations] insert error:', insError);
      return { success: false, error: 'Error al generar la invitación' };
    }

    return {
      success: true,
      data: { token, expiresAt: expiresAt.toISOString() },
    };
  } catch (e) {
    console.error('[invitations] generateInvitationToken unexpected:', e);
    return { success: false, error: 'Error inesperado' };
  }
}

export async function getActiveInvitation(): Promise<
  ActionResult<{ token: string; expiresAt: string } | null>
> {
  try {
    const medicoAuth = await getCurrentMedicoUserId();
    if (medicoAuth.error || !medicoAuth.userId) {
      return { success: false, error: medicoAuth.error ?? 'No autenticado' };
    }

    const nowIso = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from('invitations')
      .select('token, expires_at')
      .eq('medico_clerk_id', medicoAuth.userId)
      .is('used_at', null)
      .gt('expires_at', nowIso)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[invitations] getActive error:', error);
      return { success: false, error: 'Error consultando invitación activa' };
    }

    if (!data) return { success: true, data: null };

    return {
      success: true,
      data: { token: data.token as string, expiresAt: data.expires_at as string },
    };
  } catch (e) {
    console.error('[invitations] getActiveInvitation unexpected:', e);
    return { success: false, error: 'Error inesperado' };
  }
}

export async function validateInvitationToken(
  token: string,
): Promise<ActionResult<{ medicoClerkId: string }>> {
  try {
    if (!token || typeof token !== 'string' || token.length !== TOKEN_BYTES * 2) {
      return { success: false, error: 'Token inválido' };
    }

    const { data, error } = await supabaseAdmin
      .from('invitations')
      .select('medico_clerk_id, expires_at, used_at')
      .eq('token', token)
      .maybeSingle();

    if (error) {
      console.error('[invitations] validate query error:', error);
      return { success: false, error: 'Error consultando la invitación' };
    }

    if (!data) {
      return { success: false, error: 'Invitación no encontrada' };
    }

    if (data.used_at) {
      return { success: false, error: 'Esta invitación ya fue utilizada' };
    }

    if (new Date(data.expires_at) <= new Date()) {
      return { success: false, error: 'Esta invitación expiró' };
    }

    return {
      success: true,
      data: { medicoClerkId: data.medico_clerk_id as string },
    };
  } catch (e) {
    console.error('[invitations] validateInvitationToken unexpected:', e);
    return { success: false, error: 'Error inesperado' };
  }
}

export async function markInvitationAsUsed(
  token: string,
  secretariaClerkId: string,
): Promise<ActionResult<{ medicoClerkId: string }>> {
  try {
    if (!token || token.length !== TOKEN_BYTES * 2) {
      return { success: false, error: 'Token inválido' };
    }
    if (!secretariaClerkId) {
      return { success: false, error: 'secretariaClerkId requerido' };
    }

    const { data, error } = await supabaseAdmin
      .from('invitations')
      .update({
        used_at: new Date().toISOString(),
        secretaria_clerk_id: secretariaClerkId,
      })
      .eq('token', token)
      .is('used_at', null)
      .select('medico_clerk_id')
      .maybeSingle();

    if (error) {
      console.error('[invitations] markUsed error:', error);
      return { success: false, error: 'Error registrando uso de invitación' };
    }
    if (!data) {
      return { success: false, error: 'Invitación no encontrada o ya utilizada' };
    }

    return {
      success: true,
      data: { medicoClerkId: data.medico_clerk_id as string },
    };
  } catch (e) {
    console.error('[invitations] markInvitationAsUsed unexpected:', e);
    return { success: false, error: 'Error inesperado' };
  }
}
