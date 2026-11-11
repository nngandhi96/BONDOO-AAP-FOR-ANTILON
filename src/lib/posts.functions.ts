import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PostRow = {
  id: string;
  user_id: string;
  author_name: string;
  author_avatar_url: string | null;
  author_trust: number | null;
  title: string;
  content: string | null;
  category: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  is_mine: boolean;
};

/**
 * Fetch posts from Supabase filtered by city using .ilike('city', currentCity)
 * and sorted by created_at DESC as required.
 */
export const listPosts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        city: z.string().trim().optional().nullable(),
      })
      .optional()
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<PostRow[]> => {
    const { supabase, userId } = context;

    let query = supabase
      .from("posts")
      .select("id, user_id, title, content, category, city, latitude, longitude, created_at");

    const targetCity = data?.city?.trim();
    if (targetCity && targetCity.toLowerCase() !== "all cities" && targetCity.toLowerCase() !== "all") {
      // High-performance city filtering using case-insensitive ilike
      query = query.ilike("city", `%${targetCity}%`);
    }

    // Always sort by created_at DESC
    query = query.order("created_at", { ascending: false });

    const { data: rows, error } = await query;
    if (error) {
      // If posts table does not exist or has an issue, log and return empty array gracefully
      console.warn("[Posts] listPosts query notice:", error.message);
      return [];
    }
    if (!rows || rows.length === 0) return [];

    const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, trust_score, avatar_path")
      .in("id", userIds);

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
      const p = pmap.get(r.user_id);
      return {
        id: r.id,
        user_id: r.user_id,
        author_name: p?.display_name || "Neighbour",
        author_avatar_url: p?.avatar_url ?? null,
        author_trust: p?.trust_score ?? null,
        title: r.title,
        content: r.content,
        category: r.category,
        city: r.city,
        latitude: r.latitude,
        longitude: r.longitude,
        created_at: r.created_at,
        is_mine: r.user_id === userId,
      };
    });
  });

/**
 * Create a new post attaching city, latitude, and longitude to the payload
 */
export const createPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        title: z.string().trim().min(3).max(200),
        content: z.string().trim().max(2000).optional().nullable(),
        category: z.string().trim().max(50).optional().nullable(),
        city: z.string().trim().max(100).optional().nullable(),
        latitude: z.number().min(-90).max(90).optional().nullable(),
        longitude: z.number().min(-180).max(180).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: row, error } = await supabase
      .from("posts")
      .insert({
        user_id: userId,
        title: data.title,
        content: data.content || null,
        category: data.category || null,
        city: data.city ? data.city.trim() : null,
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);
    return { id: row.id };
  });
