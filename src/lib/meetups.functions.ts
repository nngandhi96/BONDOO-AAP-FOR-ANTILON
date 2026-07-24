import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** List meetups in a conversation (most recent first). */
export const listMeetups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ conversationId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("meetups")
      .select(
        "id, conversation_id, proposer_id, recipient_id, place, address, scheduled_at, note, status, responded_at, created_at, reschedule_by, reschedule_place, reschedule_address, reschedule_scheduled_at, reschedule_note, reschedule_requested_at",
      )
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/** Fetch a single meetup with participant display info. */
export const getMeetup = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ meetupId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: m, error } = await supabase
      .from("meetups")
      .select(
        "id, conversation_id, proposer_id, recipient_id, place, address, scheduled_at, note, status, responded_at, created_at, reschedule_by, reschedule_place, reschedule_address, reschedule_scheduled_at, reschedule_note, reschedule_requested_at",
      )
      .eq("id", data.meetupId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!m) throw new Error("Meetup not found");

    const { data: people } = await supabase
      .from("profiles")
      .select("id, display_name, neighbourhood, trust_score")
      .in("id", [m.proposer_id, m.recipient_id]);
    const proposer = people?.find((p) => p.id === m.proposer_id) ?? null;
    const recipient = people?.find((p) => p.id === m.recipient_id) ?? null;

    return { meetup: m, proposer, recipient, me: userId };
  });

/** Propose a new meetup inside a conversation. */
export const proposeMeetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        conversationId: z.string().uuid(),
        place: z.string().trim().min(2).max(120),
        address: z.string().trim().max(200).optional().or(z.literal("")),
        scheduledAt: z.string().min(1),
        note: z.string().trim().max(500).optional().or(z.literal("")),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const when = new Date(data.scheduledAt);
    if (Number.isNaN(when.getTime())) throw new Error("Invalid date/time");
    if (when.getTime() < Date.now() - 60_000)
      throw new Error("Pick a future time");

    const { data: convo, error: cErr } = await supabase
      .from("conversations")
      .select("id, user_a, user_b")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!convo) throw new Error("Conversation not found");
    const recipient_id = convo.user_a === userId ? convo.user_b : convo.user_a;

    const { data: row, error } = await supabase
      .from("meetups")
      .insert({
        conversation_id: data.conversationId,
        proposer_id: userId,
        recipient_id,
        place: data.place,
        address: data.address || null,
        scheduled_at: when.toISOString(),
        note: data.note || null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    // Post a system-style message in chat so both users see it inline.
    const whenLabel = when.toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    await supabase.from("messages").insert({
      conversation_id: data.conversationId,
      sender_id: userId,
      body: `📍 Proposed meetup — ${data.place} · ${whenLabel}`,
    });

    try {
      const { data: me } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", userId)
        .maybeSingle();
      const { notify } = await import("./push.server");
      await notify(recipient_id, {
        title: "New meetup proposed",
        body: `${me?.display_name || "Someone"} · ${data.place} · ${whenLabel}`,
        url: `/meetup/${row.id}`,
        tag: `meetup:${row.id}`,
      });
    } catch {}

    return { id: row.id };
  });

/** Respond to a meetup: confirm, decline, or (proposer) cancel. */
export const respondMeetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        meetupId: z.string().uuid(),
        action: z.enum(["confirm", "decline", "cancel"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: m, error: gErr } = await supabase
      .from("meetups")
      .select("id, conversation_id, proposer_id, recipient_id, status, place, scheduled_at")
      .eq("id", data.meetupId)
      .maybeSingle();
    if (gErr) throw new Error(gErr.message);
    if (!m) throw new Error("Meetup not found");
    if (m.status !== "pending") throw new Error("Already responded");

    let newStatus: "confirmed" | "declined" | "cancelled";
    if (data.action === "cancel") {
      if (userId !== m.proposer_id) throw new Error("Only the proposer can cancel");
      newStatus = "cancelled";
    } else {
      if (userId !== m.recipient_id)
        throw new Error("Only the recipient can confirm or decline");
      newStatus = data.action === "confirm" ? "confirmed" : "declined";
    }

    const { error } = await supabase
      .from("meetups")
      .update({ status: newStatus, responded_at: new Date().toISOString() })
      .eq("id", data.meetupId);
    if (error) throw new Error(error.message);

    const label =
      newStatus === "confirmed"
        ? "✅ Meetup confirmed"
        : newStatus === "declined"
          ? "❌ Meetup declined"
          : "🚫 Meetup cancelled";
    await supabase.from("messages").insert({
      conversation_id: m.conversation_id,
      sender_id: userId,
      body: `${label} — ${m.place}`,
    });

    try {
      const otherId = userId === m.proposer_id ? m.recipient_id : m.proposer_id;
      const { notify } = await import("./push.server");
      await notify(otherId, {
        title: label,
        body: m.place,
        url: `/meetup/${m.id}`,
        tag: `meetup:${m.id}`,
      });
    } catch {}

    return { status: newStatus };
  });
/** Request a reschedule on a confirmed meetup. Either participant can call. */
export const requestReschedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        meetupId: z.string().uuid(),
        place: z.string().trim().min(2).max(120),
        address: z.string().trim().max(200).optional().or(z.literal("")),
        scheduledAt: z.string().min(1),
        note: z.string().trim().max(500).optional().or(z.literal("")),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const when = new Date(data.scheduledAt);
    if (Number.isNaN(when.getTime())) throw new Error("Invalid date/time");
    if (when.getTime() < Date.now() - 60_000) throw new Error("Pick a future time");

    const { data: m, error: gErr } = await supabase
      .from("meetups")
      .select("id, conversation_id, proposer_id, recipient_id, status")
      .eq("id", data.meetupId)
      .maybeSingle();
    if (gErr) throw new Error(gErr.message);
    if (!m) throw new Error("Meetup not found");
    if (m.status !== "confirmed") throw new Error("Only confirmed meetups can be rescheduled");
    if (userId !== m.proposer_id && userId !== m.recipient_id)
      throw new Error("Not a participant");

    const { error } = await supabase
      .from("meetups")
      .update({
        status: "reschedule_pending",
        reschedule_by: userId,
        reschedule_place: data.place,
        reschedule_address: data.address || null,
        reschedule_scheduled_at: when.toISOString(),
        reschedule_note: data.note || null,
        reschedule_requested_at: new Date().toISOString(),
      })
      .eq("id", data.meetupId);
    if (error) throw new Error(error.message);

    const whenLabel = when.toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    await supabase.from("messages").insert({
      conversation_id: m.conversation_id,
      sender_id: userId,
      body: `🔁 Reschedule proposed — ${data.place} · ${whenLabel}`,
    });

    try {
      const otherId = userId === m.proposer_id ? m.recipient_id : m.proposer_id;
      const { notify } = await import("./push.server");
      await notify(otherId, {
        title: "Reschedule proposed",
        body: `${data.place} · ${whenLabel}`,
        url: `/meetup/${m.id}`,
        tag: `meetup:${m.id}`,
      });
    } catch {}

    return { ok: true };
  });

/** List safety-guideline acknowledgements for a meetup. */
export const listMeetupAcknowledgements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ meetupId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("meetup_acknowledgements")
      .select("meetup_id, user_id, acknowledged_at")
      .eq("meetup_id", data.meetupId);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/** Record the current user's acknowledgement of safety guidelines for a meetup. */
export const acknowledgeMeetupSafety = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ meetupId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: m, error: gErr } = await supabase
      .from("meetups")
      .select("id, proposer_id, recipient_id")
      .eq("id", data.meetupId)
      .maybeSingle();
    if (gErr) throw new Error(gErr.message);
    if (!m) throw new Error("Meetup not found");
    if (userId !== m.proposer_id && userId !== m.recipient_id)
      throw new Error("Not a participant");

    const { error } = await supabase
      .from("meetup_acknowledgements")
      .upsert(
        { meetup_id: data.meetupId, user_id: userId },
        { onConflict: "meetup_id,user_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Respond to a pending reschedule: accept / decline / (requester) cancel. */
export const respondReschedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        meetupId: z.string().uuid(),
        action: z.enum(["accept", "decline", "cancel"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: m, error: gErr } = await supabase
      .from("meetups")
      .select(
        "id, conversation_id, proposer_id, recipient_id, status, reschedule_by, reschedule_place, reschedule_address, reschedule_scheduled_at, reschedule_note",
      )
      .eq("id", data.meetupId)
      .maybeSingle();
    if (gErr) throw new Error(gErr.message);
    if (!m) throw new Error("Meetup not found");
    if (m.status !== "reschedule_pending") throw new Error("No pending reschedule");

    const isParticipant = userId === m.proposer_id || userId === m.recipient_id;
    if (!isParticipant) throw new Error("Not a participant");

    let systemLabel: string;
    const update: {
      status: "confirmed";
      place?: string;
      address?: string | null;
      scheduled_at?: string;
      note?: string | null;
      responded_at?: string;
      reschedule_by: null;
      reschedule_place: null;
      reschedule_address: null;
      reschedule_scheduled_at: null;
      reschedule_note: null;
      reschedule_requested_at: null;
    } = {
      status: "confirmed",
      reschedule_by: null,
      reschedule_place: null,
      reschedule_address: null,
      reschedule_scheduled_at: null,
      reschedule_note: null,
      reschedule_requested_at: null,
    };

    if (data.action === "cancel") {
      if (userId !== m.reschedule_by) throw new Error("Only the requester can cancel");
      systemLabel = "🚫 Reschedule cancelled — keeping original meetup";
    } else {
      if (userId === m.reschedule_by)
        throw new Error("The other person must accept or decline");
      if (data.action === "accept") {
        if (!m.reschedule_place || !m.reschedule_scheduled_at)
          throw new Error("Reschedule details missing");
        update.place = m.reschedule_place;
        update.address = m.reschedule_address ?? null;
        update.scheduled_at = m.reschedule_scheduled_at;
        update.note = m.reschedule_note ?? null;
        update.responded_at = new Date().toISOString();
        systemLabel = `✅ Reschedule accepted — ${m.reschedule_place}`;
      } else {
        systemLabel = "❌ Reschedule declined — keeping original meetup";
      }
    }

    const { error } = await supabase.from("meetups").update(update).eq("id", data.meetupId);
    if (error) throw new Error(error.message);

    await supabase.from("messages").insert({
      conversation_id: m.conversation_id,
      sender_id: userId,
      body: systemLabel,
    });

    try {
      const otherId = userId === m.proposer_id ? m.recipient_id : m.proposer_id;
      const { notify } = await import("./push.server");
      await notify(otherId, {
        title: systemLabel,
        body: "",
        url: `/meetup/${m.id}`,
        tag: `meetup:${m.id}`,
      });
    } catch {}

    return { ok: true };
  });
