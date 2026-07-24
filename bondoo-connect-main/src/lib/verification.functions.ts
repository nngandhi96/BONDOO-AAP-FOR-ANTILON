import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const stepSchema = z.object({
  step: z.enum(["phone", "selfie", "background"]),
});

/**
 * Demo verification updater. Trust-field trigger blocks direct updates from
 * the user role, so we go through the admin client after re-checking the
 * caller's identity via requireSupabaseAuth.
 */
export const markVerificationStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => stepSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );

    const patch =
      data.step === "phone"
        ? { phone_verified: true }
        : data.step === "selfie"
          ? { selfie_verified: true }
          : { background_check_status: "approved" as const };

    const { error } = await supabaseAdmin
      .from("profiles")
      .update(patch)
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });