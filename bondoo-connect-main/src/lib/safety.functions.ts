import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const REPORT_REASONS = [
  "Harassment or abuse",
  "Inappropriate / sexual content",
  "Spam or scam",
  "Fake profile / impersonation",
  "Unsafe behaviour",
  "Other",
] as const;

/** Check if the current user has blocked the given user. */
export const isBlocked = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ userId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("user_blocks")
      .select("id")
      .eq("blocker_id", userId)
      .eq("blocked_id", data.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { blocked: !!row };
  });

/** Block a user. */
export const blockUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ userId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.userId === userId) throw new Error("You cannot block yourself");
    const { error } = await supabase
      .from("user_blocks")
      .insert({ blocker_id: userId, blocked_id: data.userId });
    if (error && !error.message.toLowerCase().includes("duplicate")) {
      throw new Error(error.message);
    }
    return { blocked: true };
  });

/** Unblock a user. */
export const unblockUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ userId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("user_blocks")
      .delete()
      .eq("blocker_id", userId)
      .eq("blocked_id", data.userId);
    if (error) throw new Error(error.message);
    return { blocked: false };
  });

/** File a report against another user. */
export const reportUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        reason: z.string().trim().min(2).max(80),
        details: z.string().trim().max(1000).optional().or(z.literal("")),
        context: z.enum(["profile", "chat"]).optional(),
        conversationId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.userId === userId) throw new Error("You cannot report yourself");
    const { error } = await supabase.from("user_reports").insert({
      reporter_id: userId,
      reported_id: data.userId,
      reason: data.reason,
      details: data.details || null,
      context: data.context ?? null,
      conversation_id: data.conversationId ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });