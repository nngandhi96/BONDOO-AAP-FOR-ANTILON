import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ReviewRow = {
  id: string;
  meetup_id: string;
  reviewer_id: string;
  reviewee_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  reviewer_name?: string;
};

export const submitReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        meetupId: z.string().uuid(),
        rating: z.number().int().min(1).max(5),
        comment: z.string().trim().max(500).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: mt, error: mErr } = await supabase
      .from("meetups")
      .select("id, status, proposer_id, recipient_id, scheduled_at")
      .eq("id", data.meetupId)
      .maybeSingle();
    if (mErr) throw new Error(mErr.message);
    if (!mt) throw new Error("Meetup not found");
    if (mt.status !== "confirmed") throw new Error("Only confirmed meetups can be reviewed");
    if (mt.proposer_id !== userId && mt.recipient_id !== userId)
      throw new Error("Not part of this meetup");
    if (new Date(mt.scheduled_at).getTime() > Date.now())
      throw new Error("You can review only after the meetup time");
    const revieweeId = mt.proposer_id === userId ? mt.recipient_id : mt.proposer_id;
    const { error } = await supabase.from("reviews").insert({
      meetup_id: data.meetupId,
      reviewer_id: userId,
      reviewee_id: revieweeId,
      rating: data.rating,
      comment: data.comment?.trim() || null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listReviewsForUser = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ userId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    // Reviews about a user are only visible to that user themselves (via RLS).
    // For public profile views, we return aggregated stats through admin only.
    const { data: rows, error } = await context.supabase
      .from("reviews")
      .select("id, rating, comment, created_at, reviewer_id")
      .eq("reviewee_id", data.userId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    if (!rows || rows.length === 0)
      return { reviews: [] as ReviewRow[], average: null as number | null, count: 0 };
    const ids = Array.from(new Set(rows.map((r) => r.reviewer_id)));
    const { data: profs } = await context.supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", ids);
    const map = new Map((profs ?? []).map((p) => [p.id, p.display_name]));
    const reviews: ReviewRow[] = rows.map((r) => ({
      id: r.id,
      meetup_id: "",
      reviewer_id: r.reviewer_id,
      reviewee_id: data.userId,
      rating: r.rating,
      comment: r.comment,
      created_at: r.created_at,
      reviewer_name: map.get(r.reviewer_id) || "Someone",
    }));
    const avg = rows.reduce((s, r) => s + r.rating, 0) / rows.length;
    return { reviews, average: Math.round(avg * 10) / 10, count: rows.length };
  });

/** Meetups the caller has confirmed, that are in the past, and they haven't yet reviewed. */
export const listMeetupsAwaitingMyReview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: meetups, error } = await supabase
      .from("meetups")
      .select("id, place, scheduled_at, proposer_id, recipient_id")
      .eq("status", "confirmed")
      .or(`proposer_id.eq.${userId},recipient_id.eq.${userId}`)
      .lt("scheduled_at", new Date().toISOString())
      .order("scheduled_at", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    if (!meetups || meetups.length === 0) return [];
    const ids = meetups.map((m) => m.id);
    const { data: mine } = await supabase
      .from("reviews")
      .select("meetup_id")
      .eq("reviewer_id", userId)
      .in("meetup_id", ids);
    const reviewed = new Set((mine ?? []).map((r) => r.meetup_id));
    const remaining = meetups.filter((m) => !reviewed.has(m.id));
    if (remaining.length === 0) return [];
    const otherIds = Array.from(
      new Set(remaining.map((m) => (m.proposer_id === userId ? m.recipient_id : m.proposer_id))),
    );
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", otherIds);
    const nameMap = new Map((profs ?? []).map((p) => [p.id, p.display_name]));
    return remaining.map((m) => {
      const otherId = m.proposer_id === userId ? m.recipient_id : m.proposer_id;
      return {
        meetup_id: m.id,
        place: m.place,
        scheduled_at: m.scheduled_at,
        other_id: otherId,
        other_name: nameMap.get(otherId) || "Someone",
      };
    });
  });

/** Has the caller already reviewed a specific meetup? */
export const haveIReviewed = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ meetupId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("reviews")
      .select("id")
      .eq("meetup_id", data.meetupId)
      .eq("reviewer_id", context.userId)
      .maybeSingle();
    return { reviewed: !!row };
  });