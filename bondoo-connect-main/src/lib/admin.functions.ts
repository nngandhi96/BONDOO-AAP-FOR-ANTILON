import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const REPORT_STATUSES = [
  "open",
  "under_review",
  "action_taken",
  "dismissed",
] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const REPORT_RESOLUTIONS = [
  "warning",
  "account_suspended",
  "account_banned",
  "no_action",
  "duplicate",
] as const;
export type ReportResolution = (typeof REPORT_RESOLUTIONS)[number];

/** Whether the current user has admin/moderator role. */
export const getMyAdminRole = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    const roles = (data ?? []).map((r) => r.role as string);
    return {
      isAdmin: roles.includes("admin"),
      isModerator: roles.includes("moderator"),
      canReview: roles.includes("admin") || roles.includes("moderator"),
    };
  });

/** List reports for admin review (RLS enforces admin/mod-only). */
export const listReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        status: z.enum(REPORT_STATUSES).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("user_reports")
      .select(
        "id, reporter_id, reported_id, reason, details, context, conversation_id, status, resolution, admin_notes, reviewed_by, reviewed_at, created_at, updated_at",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    // Enrich with reporter/reported display names
    const ids = Array.from(
      new Set((rows ?? []).flatMap((r) => [r.reporter_id, r.reported_id])),
    );
    const { data: profiles } = ids.length
      ? await supabase
          .from("profiles")
          .select("id, display_name, trust_score")
          .in("id", ids)
      : { data: [] };
    const pmap = new Map((profiles ?? []).map((p) => [p.id, p]));
    return (rows ?? []).map((r) => ({
      ...r,
      reporter: pmap.get(r.reporter_id) ?? null,
      reported: pmap.get(r.reported_id) ?? null,
    }));
  });

/** Update a report's review status + resolution + notes. */
export const updateReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        reportId: z.string().uuid(),
        status: z.enum(REPORT_STATUSES),
        resolution: z.enum(REPORT_RESOLUTIONS).nullable().optional(),
        adminNotes: z.string().max(2000).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const isTerminal = data.status === "action_taken" || data.status === "dismissed";
    const { error } = await supabase
      .from("user_reports")
      .update({
        status: data.status,
        resolution: data.resolution ?? null,
        admin_notes: data.adminNotes ?? null,
        reviewed_by: isTerminal ? userId : null,
        reviewed_at: isTerminal ? new Date().toISOString() : null,
      })
      .eq("id", data.reportId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Admin stats for the dashboard header. */
export const getReportStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("user_reports")
      .select("status");
    if (error) throw new Error(error.message);
    const counts: Record<string, number> = {
      open: 0,
      under_review: 0,
      action_taken: 0,
      dismissed: 0,
    };
    for (const r of data ?? []) counts[r.status as string] = (counts[r.status as string] ?? 0) + 1;
    return counts;
  });