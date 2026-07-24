import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1. Collect storage paths owned by this user (avatar + gov id)
    const { data: profile } = await supabase
      .from("profiles")
      .select("avatar_path, gov_id_path")
      .eq("id", userId)
      .maybeSingle();

    const removals: Array<Promise<unknown>> = [];
    if (profile?.avatar_path) {
      removals.push(supabaseAdmin.storage.from("avatars").remove([profile.avatar_path]));
    }
    if (profile?.gov_id_path) {
      removals.push(supabaseAdmin.storage.from("gov-ids").remove([profile.gov_id_path]));
    }

    // Also sweep any stray objects under the user's folder (defensive)
    for (const bucket of ["avatars", "gov-ids"] as const) {
      const { data: files } = await supabaseAdmin.storage.from(bucket).list(userId, { limit: 1000 });
      if (files && files.length > 0) {
        const paths = files.map((f) => `${userId}/${f.name}`);
        removals.push(supabaseAdmin.storage.from(bucket).remove(paths));
      }
    }
    await Promise.allSettled(removals);

    // 2. Delete app data rows (order respects FKs)
    const admin = supabaseAdmin;
    await admin.from("messages").delete().eq("sender_id", userId);
    await admin.from("meetup_acknowledgements").delete().eq("user_id", userId);
    await admin.from("meetups").delete().or(`proposer_id.eq.${userId},recipient_id.eq.${userId}`);
    await admin.from("conversations").delete().or(`user_a.eq.${userId},user_b.eq.${userId}`);
    await admin.from("connections").delete().or(`requester_id.eq.${userId},recipient_id.eq.${userId}`);
    await admin.from("user_blocks").delete().or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`);
    await admin.from("user_reports").delete().or(`reporter_id.eq.${userId},reported_id.eq.${userId}`);
    await admin.from("user_roles").delete().eq("user_id", userId);
    await admin.from("profiles").delete().eq("id", userId);

    // 3. Finally delete the auth user
    const { error: authErr } = await admin.auth.admin.deleteUser(userId);
    if (authErr) throw new Error(authErr.message);

    return { ok: true };
  });