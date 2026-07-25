import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CATEGORIES = [
  "Coffee & Chat",
  "Walk",
  "Study",
  "Sports",
  "Food",
] as const;

const CATEGORY_EMOJI: Record<(typeof CATEGORIES)[number], string> = {
  "Coffee & Chat": "☕",
  Walk: "🌳",
  Study: "📖",
  Sports: "🏸",
  Food: "🍜",
};

export type ActivityRow = {
  id: string;
  host_id: string;
  host_name: string;
  host_avatar_url: string | null;
  host_trust: number | null;
  title: string;
  category: (typeof CATEGORIES)[number];
  emoji: string;
  starts_at: string;
  location_name: string | null;
  location_lat: number | null;
  location_lng: number | null;
  spots_total: number;
  spots_filled: number;
  distance_hint: string | null;
  is_mine: boolean;
};

export const listActivities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ActivityRow[]> => {
    const { supabase, userId } = context;
    const { data: rows, error } = await supabase
      .from("activities")
      .select(
        "id, host_id, title, category, emoji, starts_at, location_name, location_lat, location_lng, spots_total, spots_filled, distance_hint",
      )
      .eq("status", "active")
      .order("starts_at", { ascending: true });
    if (error) throw new Error(error.message);
    if (!rows || rows.length === 0) return [];

    const hostIds = Array.from(new Set(rows.map((r) => r.host_id)));
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, trust_score, avatar_path")
      .in("id", hostIds);

    const profileEntries = await Promise.all(
      (profiles ?? []).map(async (p) => {
        let avatar_url: string | null = null;
        if (p.avatar_path) {
          try {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { data: signed } = await supabaseAdmin.storage
              .from("avatars")
              .createSignedUrl(p.avatar_path, 3600);
            avatar_url = signed?.signedUrl ?? null;
          } catch {}
          if (!avatar_url) {
            avatar_url = supabase.storage.from("avatars").getPublicUrl(p.avatar_path).data.publicUrl;
          }
        }
        return [p.id, { ...p, avatar_url }] as const;
      }),
    );
    const pmap = new Map(profileEntries);

    return rows.map((r) => {
      const cat = r.category as (typeof CATEGORIES)[number];
      const p = pmap.get(r.host_id);
      return {
        id: r.id,
        host_id: r.host_id,
        host_name: p?.display_name || "Someone",
        host_avatar_url: p?.avatar_url ?? null,
        host_trust: p?.trust_score ?? null,
        title: r.title,
        category: cat,
        emoji: r.emoji || CATEGORY_EMOJI[cat],
        starts_at: r.starts_at,
        location_name: r.location_name,
        location_lat: r.location_lat ?? null,
        location_lng: r.location_lng ?? null,
        spots_total: r.spots_total,
        spots_filled: r.spots_filled,
        distance_hint: r.distance_hint,
        is_mine: r.host_id === userId,
      };
    });
  });

export const createActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        title: z.string().trim().min(3).max(120),
        category: z.enum(CATEGORIES),
        starts_at: z.string().min(1),
        location_name: z.string().trim().max(120).optional().nullable(),
        location_lat: z.number().min(-90).max(90).optional().nullable(),
        location_lng: z.number().min(-180).max(180).optional().nullable(),
        spots_total: z.number().int().min(2).max(20).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const starts = new Date(data.starts_at);
    if (Number.isNaN(starts.getTime())) throw new Error("Invalid start time.");
    const { data: row, error } = await supabase
      .from("activities")
      .insert({
        host_id: userId,
        title: data.title,
        category: data.category,
        emoji: CATEGORY_EMOJI[data.category],
        starts_at: starts.toISOString(),
        location_name: data.location_name || null,
        location_lat: data.location_lat ?? null,
        location_lng: data.location_lng ?? null,
        spots_total: data.spots_total ?? 4,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const cancelActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ activityId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("activities")
      .update({ status: "cancelled" })
      .eq("id", data.activityId)
      .eq("host_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
