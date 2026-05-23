"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { WizardStepId } from "@/components/profile/wizard-arca/types";

export async function toggleWizardManualStep(
  stepId: WizardStepId,
  completed: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const { userId } = await auth();
  if (!userId) {
    return { ok: false, error: "No autenticado" };
  }

  const { data: current, error: readErr } = await supabaseAdmin
    .from("profiles")
    .select("arca_wizard_manual_steps")
    .eq("clerk_user_id", userId)
    .single();

  if (readErr) {
    return { ok: false, error: readErr.message };
  }

  const manuales =
    (current?.arca_wizard_manual_steps as Record<string, boolean>) ?? {};

  if (completed) {
    manuales[stepId] = true;
  } else {
    delete manuales[stepId];
  }

  const { error: writeErr } = await supabaseAdmin
    .from("profiles")
    .update({ arca_wizard_manual_steps: manuales })
    .eq("clerk_user_id", userId);

  if (writeErr) {
    return { ok: false, error: writeErr.message };
  }

  revalidatePath("/perfil");
  return { ok: true };
}
