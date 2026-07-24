import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Return a short-lived signed URL for another user's government ID image.
 * Access is restricted to users with an accepted connection to the target.
 * Every view is logged for audit.
 */
export const getGovIdSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ targetUserId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.targetUserId === userId) {
      throw new Error("Use your own profile page to view your ID.");
    }

    // 1. Require an accepted connection between viewer and target.
    const { data: conn, error: connErr } = await supabase
      .from("connections")
      .select("id, status")
      .or(
        `and(requester_id.eq.${userId},recipient_id.eq.${data.targetUserId}),and(requester_id.eq.${data.targetUserId},recipient_id.eq.${userId})`,
      )
      .maybeSingle();
    if (connErr) throw new Error(connErr.message);
    if (!conn || conn.status !== "accepted") {
      throw new Error("You must be connected with this user to view their ID.");
    }

    // 2. Fetch the target's gov_id_path (RLS on profiles allows read).
    const { data: profile, error: pErr } = await supabase
      .from("profiles")
      .select("gov_id_path, gov_id_verified, display_name")
      .eq("id", data.targetUserId)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!profile?.gov_id_path) {
      throw new Error("This user has not uploaded a Government ID.");
    }

    // 3. Create a short-lived signed URL via admin client (bucket is private).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error: sErr } = await supabaseAdmin.storage
      .from("gov-ids")
      .createSignedUrl(profile.gov_id_path, 60);
    if (sErr || !signed?.signedUrl) {
      throw new Error(sErr?.message || "Could not generate secure link.");
    }

    // 4. Log the view (both viewer and target can see this row).
    await supabase.from("gov_id_views").insert({
      viewer_id: userId,
      target_id: data.targetUserId,
    });

    return {
      url: signed.signedUrl,
      expiresInSeconds: 60,
      verified: !!profile.gov_id_verified,
      targetName: profile.display_name || "Member",
    };
  });

/** List who has viewed my Government ID. */
export const listMyGovIdViewers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("gov_id_views")
      .select("id, viewer_id, viewed_at")
      .eq("target_id", userId)
      .order("viewed_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });