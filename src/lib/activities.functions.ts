import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { haversineDistance, DEFAULT_RADIUS_KM } from "@/lib/location";

const CATEGORIES = [
  "Coffee & Chat",
  "Walk",
  "Study",
  "Sports",
  "Food",
  "Music Jam",
  "House Party",
  "Youth Meetup",
  "Birthday Party",
  "Fun Hangout",
] as const;

const CATEGORY_EMOJI: Record<(typeof CATEGORIES)[number], string> = {
  "Coffee & Chat": "☕",
  Walk: "🌳",
  Study: "📖",
  Sports: "🏸",
  Food: "🍜",
  "Music Jam": "🎸",
  "House Party": "🏠",
  "Youth Meetup": "👥",
  "Birthday Party": "🎂",
  "Fun Hangout": "🍿",
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
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  spots_total: number;
  spots_filled: number;
  distance_hint: string | null;
  is_mine: boolean;
};

export const listActivities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        city: z.string().trim().optional().nullable(),
        latitude: z.number().optional().nullable(),
        longitude: z.number().optional().nullable(),
        radiusKm: z.number().optional().nullable(),
      })
      .optional()
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<ActivityRow[]> => {
    const { supabase, userId } = context;
    let query = supabase
      .from("activities")
      .select(
        "id, host_id, title, category, emoji, starts_at, location_name, location_lat, location_lng, city, latitude, longitude, spots_total, spots_filled, distance_hint, created_at",
      )
      .eq("status", "active");

    const targetCity = data?.city?.trim();
    const isAllCities =
      !targetCity ||
      targetCity.toLowerCase() === "all cities" ||
      targetCity.toLowerCase() === "all";

    // If city is specified and user explicitly wants to filter by city name
    if (!isAllCities && (!data?.latitude || !data?.longitude)) {
      query = query.ilike("city", `%${targetCity}%`);
    }

    query = query.order("created_at", { ascending: false });

    const { data: rawRows, error } = await query;
    if (error) throw new Error(error.message);
    if (!rawRows || rawRows.length === 0) return [];

    // Filter by radius (default 100km) when user coordinates are provided
    let rows = rawRows;
    const userLat = data?.latitude;
    const userLng = data?.longitude;
    const maxRadius = data?.radiusKm ?? DEFAULT_RADIUS_KM;

    if (userLat != null && userLng != null && !isAllCities) {
      rows = rawRows.filter((r) => {
        const rowLat = r.latitude ?? r.location_lat;
        const rowLng = r.longitude ?? r.location_lng;
        if (rowLat != null && rowLng != null) {
          const dist = haversineDistance(userLat, userLng, rowLat, rowLng);
          return dist <= maxRadius;
        }
        // Fallback for posts without coordinates: check city match
        if (r.city && targetCity) {
          return (
            r.city.toLowerCase().includes(targetCity.toLowerCase()) ||
            targetCity.toLowerCase().includes(r.city.toLowerCase())
          );
        }
        return false;
      });
    }

    if (rows.length === 0) return [];

    const hostIds = Array.from(new Set(rows.map((r) => r.host_id)));
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, trust_score, avatar_path")
      .in("id", hostIds);

    const { batchGetSignedAvatarUrls } = await import("@/lib/avatar.server");
    const avatarMap = await batchGetSignedAvatarUrls(
      (profiles ?? []).map((p) => p.avatar_path),
    );

    const pmap = new Map(
      (profiles ?? []).map((p) => [
        p.id,
        {
          ...p,
          avatar_url: p.avatar_path ? avatarMap.get(p.avatar_path) ?? null : null,
        },
      ]),
    );

    return rows.map((r) => {
      const cat = r.category as (typeof CATEGORIES)[number];
      const p = pmap.get(r.host_id);
      const lat = r.latitude ?? r.location_lat ?? null;
      const lng = r.longitude ?? r.location_lng ?? null;
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
        location_lat: lat,
        location_lng: lng,
        city: r.city ?? null,
        latitude: lat,
        longitude: lng,
        spots_total: r.spots_total,
        spots_filled: r.spots_filled,
        distance_hint: r.distance_hint,
        is_mine: r.host_id === userId,
      };
    });
  });

export const createActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        title: z.string().trim().min(3).max(120),
        category: z.enum(CATEGORIES),
        starts_at: z.string().min(1),
        location_name: z.string().trim().max(120).optional().nullable(),
        location_lat: z.number().min(-90).max(90).optional().nullable(),
        location_lng: z.number().min(-180).max(180).optional().nullable(),
        city: z.string().trim().max(100).optional().nullable(),
        latitude: z.number().min(-90).max(90).optional().nullable(),
        longitude: z.number().min(-180).max(180).optional().nullable(),
        spots_total: z.number().int().min(2).max(20).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const starts = new Date(data.starts_at);
    if (Number.isNaN(starts.getTime())) throw new Error("Invalid start time.");
    const lat = data.latitude ?? data.location_lat ?? null;
    const lng = data.longitude ?? data.location_lng ?? null;
    const { data: row, error } = await supabase
      .from("activities")
      .insert({
        host_id: userId,
        title: data.title,
        category: data.category,
        emoji: CATEGORY_EMOJI[data.category],
        starts_at: starts.toISOString(),
        location_name: data.location_name || null,
        location_lat: lat,
        location_lng: lng,
        city: data.city ? data.city.trim() : null,
        latitude: lat,
        longitude: lng,
        spots_total: data.spots_total ?? 4,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const cancelActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
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

export const updateActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        activityId: z.string().uuid(),
        title: z.string().trim().min(3).max(120),
        category: z.enum(CATEGORIES),
        starts_at: z.string().min(1),
        location_name: z.string().trim().max(120).optional().nullable(),
        location_lat: z.number().min(-90).max(90).optional().nullable(),
        location_lng: z.number().min(-180).max(180).optional().nullable(),
        city: z.string().trim().max(100).optional().nullable(),
        latitude: z.number().min(-90).max(90).optional().nullable(),
        longitude: z.number().min(-180).max(180).optional().nullable(),
        spots_total: z.number().int().min(2).max(20).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const starts = new Date(data.starts_at);
    if (Number.isNaN(starts.getTime())) throw new Error("Invalid start time.");
    const lat = data.latitude ?? data.location_lat;
    const lng = data.longitude ?? data.location_lng;
    const { error } = await supabase
      .from("activities")
      .update({
        title: data.title,
        category: data.category,
        emoji: CATEGORY_EMOJI[data.category],
        starts_at: starts.toISOString(),
        location_name: data.location_name || null,
        ...(data.city !== undefined ? { city: data.city ? data.city.trim() : null } : {}),
        ...(lat !== undefined ? { location_lat: lat, latitude: lat } : {}),
        ...(lng !== undefined ? { location_lng: lng, longitude: lng } : {}),
        ...(data.spots_total !== undefined ? { spots_total: data.spots_total } : {}),
      })
      .eq("id", data.activityId)
      .eq("host_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ activityId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("activities")
      .delete()
      .eq("id", data.activityId)
      .eq("host_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

