import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("*")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    let avatar_url: string | null = null;
    if (data.avatar_path) {
      const { data: signed } = await context.supabase.storage
        .from("avatars")
        .createSignedUrl(data.avatar_path, 3600);
      avatar_url =
        signed?.signedUrl ??
        context.supabase.storage.from("avatars").getPublicUrl(data.avatar_path).data.publicUrl;
    }
    return { ...data, avatar_url };
  });

export const getUserProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ userId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("profiles")
      .select(
        "id, display_name, pronouns, neighbourhood, bio, avatar_path, phone_verified, gov_id_verified, selfie_verified, background_check_status, community_reviews_count, attended_meets_count, trust_score, created_at",
      )
      .eq("id", data.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Profile not found");
    let avatar_url: string | null = null;
    if (row.avatar_path) {
      const { data: signed } = await context.supabase.storage
        .from("avatars")
        .createSignedUrl(row.avatar_path, 3600);
      avatar_url =
        signed?.signedUrl ??
        context.supabase.storage.from("avatars").getPublicUrl(row.avatar_path).data.publicUrl;
    }
    return { ...row, avatar_url };
  });

const updateSchema = z.object({
  display_name: z.string().trim().max(80),
  pronouns: z.string().trim().max(40),
  neighbourhood: z.string().trim().max(120),
  bio: z.string().trim().max(500),
  interests: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
  home_city: z.string().trim().max(120).optional().nullable(),
  home_lat: z.number().min(-90).max(90).optional().nullable(),
  home_lng: z.number().min(-180).max(180).optional().nullable(),
});

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("profiles")
      .update(data)
      .eq("id", context.userId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const completeOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: row, error } = await context.supabase
      .from("profiles")
      .update({ onboarded_at: new Date().toISOString() })
      .eq("id", context.userId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

/** Return a fresh signed URL for the current user's avatar (or null). */
export const getMyAvatarUrl = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: row } = await context.supabase
      .from("profiles")
      .select("avatar_path")
      .eq("id", context.userId)
      .maybeSingle();
    if (!row?.avatar_path) return { url: null as string | null };
    const { data: signed } = await context.supabase.storage
      .from("avatars")
      .createSignedUrl(row.avatar_path, 3600);
    return { url: signed?.signedUrl ?? null };
  });

/** Save an uploaded avatar path onto the caller's profile. */
export const setMyAvatarPath = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ path: z.string().min(1).max(300) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    // Ensure the path is inside the caller's folder.
    if (!data.path.startsWith(`${context.userId}/`))
      throw new Error("Invalid avatar path");
    const { error } = await context.supabase
      .from("profiles")
      .update({ avatar_path: data.path })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    const { data: signed } = await context.supabase.storage
      .from("avatars")
      .createSignedUrl(data.path, 3600);
    return { url: signed?.signedUrl ?? null };
  });