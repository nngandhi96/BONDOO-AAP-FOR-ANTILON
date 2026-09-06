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

const SUPER_ADMIN_EMAILS = ["makemyvash@gmail.com"];

/** Check if caller is admin or moderator */
async function checkAdminOrMod(supabase: any, userId: string, email?: string) {
  if (email && SUPER_ADMIN_EMAILS.includes(email.toLowerCase())) {
    return { isAdmin: true, isModerator: true };
  }
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  const roles = (data ?? []).map((r: { role: string }) => r.role);
  const isAdmin = roles.includes("admin");
  const isModerator = roles.includes("moderator");
  if (!isAdmin && !isModerator) {
    throw new Error("Unauthorized: Admin or Moderator access required");
  }
  return { isAdmin, isModerator };
}

/** Whether the current user has admin/moderator role. */
export const getMyAdminRole = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId, claims } = context as any;
    const email = claims?.email as string | undefined;
    const isSuperAdmin = Boolean(email && SUPER_ADMIN_EMAILS.includes(email.toLowerCase()));

    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (error && !isSuperAdmin) throw new Error(error.message);
    const roles = (data ?? []).map((r: { role: string }) => r.role as string);

    const isAdmin = isSuperAdmin || roles.includes("admin");
    const isModerator = isSuperAdmin || roles.includes("moderator");

    return {
      isAdmin,
      isModerator,
      canReview: isAdmin || isModerator,
    };
  });

function getAdminDb(context: any, supabaseAdmin: any) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceKey && !serviceKey.startsWith("sb_publishable_") && serviceKey.trim().length > 0) {
    return supabaseAdmin;
  }
  return context.supabase;
}

/** Platform overview statistics for the admin dashboard. */
export const getAdminOverviewStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await checkAdminOrMod(supabase, userId, (context as any).claims?.email);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = getAdminDb(context, supabaseAdmin);

    // Total users and verification breakdowns
    const { data: profiles, error: pErr } = await db
      .from("profiles")
      .select("id, phone_verified, gov_id_verified, selfie_verified, background_check_status, trust_score, created_at");
    if (pErr) throw new Error(pErr.message);

    const totalUsers = profiles?.length ?? 0;
    const phoneVerified = profiles?.filter((p) => p.phone_verified).length ?? 0;
    const govIdVerified = profiles?.filter((p) => p.gov_id_verified).length ?? 0;
    const selfieVerified = profiles?.filter((p) => p.selfie_verified).length ?? 0;
    const backgroundApproved = profiles?.filter((p) => p.background_check_status === "approved").length ?? 0;

    // Reports counts
    const { data: reports, error: rErr } = await supabaseAdmin
      .from("user_reports")
      .select("status");
    if (rErr) throw new Error(rErr.message);

    const openReports = reports?.filter((r) => r.status === "open").length ?? 0;
    const underReviewReports = reports?.filter((r) => r.status === "under_review").length ?? 0;
    const totalReports = reports?.length ?? 0;

    // Meetups & activities count
    const { count: totalMeetups } = await supabaseAdmin
      .from("meetups")
      .select("*", { count: "exact", head: true });

    const { count: totalActivities } = await supabaseAdmin
      .from("activities")
      .select("*", { count: "exact", head: true });

    const { count: totalReviews } = await supabaseAdmin
      .from("reviews")
      .select("*", { count: "exact", head: true });

    return {
      totalUsers,
      phoneVerified,
      govIdVerified,
      selfieVerified,
      backgroundApproved,
      openReports,
      underReviewReports,
      totalReports,
      totalMeetups: totalMeetups ?? 0,
      totalActivities: totalActivities ?? 0,
      totalReviews: totalReviews ?? 0,
    };
  });

/** List users with optional search and filter. */
export const listAdminUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        search: z.string().optional(),
        filter: z.enum(["all", "verified", "unverified"]).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await checkAdminOrMod(supabase, userId, (context as any).claims?.email);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = getAdminDb(context, supabaseAdmin);

    let q = db
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (data.search && data.search.trim()) {
      const s = data.search.trim();
      q = q.or(`display_name.ilike.%${s}%,neighbourhood.ilike.%${s}%,bio.ilike.%${s}%`);
    }

    if (data.filter === "verified") {
      q = q.eq("gov_id_verified", true);
    } else if (data.filter === "unverified") {
      q = q.eq("gov_id_verified", false);
    }

    const { data: users, error } = await q;
    if (error) throw new Error(error.message);

    // Fetch user roles
    const userIds = (users ?? []).map((u) => u.id);
    const { data: roles } = userIds.length
      ? await db
          .from("user_roles")
          .select("user_id, role")
          .in("user_id", userIds)
      : { data: [] };

    const rolesMap = new Map<string, string[]>();
    for (const r of roles ?? []) {
      const list = rolesMap.get(r.user_id) ?? [];
      list.push(r.role);
      rolesMap.set(r.user_id, list);
    }

    return (users ?? []).map((u) => ({
      ...u,
      roles: rolesMap.get(u.id) ?? [],
    }));
  });

/** Admin action to update verification or background status for a specific user. */
export const updateAdminUserVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        targetUserId: z.string().uuid(),
        phone_verified: z.boolean().optional(),
        gov_id_verified: z.boolean().optional(),
        selfie_verified: z.boolean().optional(),
        background_check_status: z.enum(["pending", "approved", "failed"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await checkAdminOrMod(supabase, userId, (context as any).claims?.email);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = getAdminDb(context, supabaseAdmin);

    type ProfileUpdate = {
      phone_verified?: boolean;
      gov_id_verified?: boolean;
      selfie_verified?: boolean;
      background_check_status?: "pending" | "approved" | "failed";
    };
    const patch: ProfileUpdate = {};
    if (data.phone_verified !== undefined) patch.phone_verified = data.phone_verified;
    if (data.gov_id_verified !== undefined) patch.gov_id_verified = data.gov_id_verified;
    if (data.selfie_verified !== undefined) patch.selfie_verified = data.selfie_verified;
    if (data.background_check_status !== undefined) patch.background_check_status = data.background_check_status;

    const { error } = await db
      .from("profiles")
      .update(patch)
      .eq("id", data.targetUserId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** List users awaiting verification review (Gov ID uploaded or selfie submitted). */
export const listPendingVerifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await checkAdminOrMod(supabase, userId, (context as any).claims?.email);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = getAdminDb(context, supabaseAdmin);

    const { data: users, error } = await db
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw new Error(error.message);

    // Return users that are either not fully verified or have background pending
    return (users ?? []).filter(
      (u) =>
        !u.gov_id_verified ||
        !u.selfie_verified ||
        u.background_check_status === "pending"
    );
  });

/** List meetups and activities for admin review. */
export const listAdminMeetups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await checkAdminOrMod(supabase, userId, (context as any).claims?.email);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: meetups, error: mErr } = await supabaseAdmin
      .from("meetups")
      .select("*")
      .order("scheduled_at", { ascending: false })
      .limit(50);
    if (mErr) throw new Error(mErr.message);

    const { data: activities, error: aErr } = await supabaseAdmin
      .from("activities")
      .select("*")
      .order("starts_at", { ascending: false })
      .limit(50);
    if (aErr) throw new Error(aErr.message);

    // Enrich with user profiles
    const userIds = Array.from(
      new Set([
        ...(meetups ?? []).flatMap((m) => [m.proposer_id, m.recipient_id]),
        ...(activities ?? []).map((a) => a.host_id),
      ]),
    );

    const { data: profiles } = userIds.length
      ? await supabaseAdmin
          .from("profiles")
          .select("id, display_name, trust_score")
          .in("id", userIds)
      : { data: [] };

    const pmap = new Map((profiles ?? []).map((p) => [p.id, p]));

    return {
      meetups: (meetups ?? []).map((m) => ({
        ...m,
        initiator: pmap.get(m.proposer_id) ?? null,
        partner: pmap.get(m.recipient_id) ?? null,
      })),
      activities: (activities ?? []).map((a) => ({
        ...a,
        host: pmap.get(a.host_id) ?? null,
      })),
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
    const { supabase, userId } = context;
    await checkAdminOrMod(supabase, userId, (context as any).claims?.email);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = getAdminDb(context, supabaseAdmin);

    let q = db
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
      ? await db
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
    await checkAdminOrMod(supabase, userId, (context as any).claims?.email);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = getAdminDb(context, supabaseAdmin);

    const isTerminal = data.status === "action_taken" || data.status === "dismissed";
    const updatePayload: Record<string, any> = {
      status: data.status,
      updated_at: new Date().toISOString(),
    };
    if (data.resolution !== undefined) updatePayload.resolution = data.resolution;
    if (data.adminNotes !== undefined) updatePayload.admin_notes = data.adminNotes;
    if (isTerminal) {
      updatePayload.reviewed_by = userId;
      updatePayload.reviewed_at = new Date().toISOString();
    }

    const { error } = await db
      .from("user_reports")
      .update(updatePayload)
      .eq("id", data.reportId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Admin stats for the dashboard header. */
export const getReportStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await checkAdminOrMod(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data, error } = await supabaseAdmin
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