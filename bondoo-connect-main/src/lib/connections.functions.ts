import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ConnectionState =
  | { status: "none" }
  | { status: "outgoing_pending"; id: string }
  | { status: "incoming_pending"; id: string }
  | { status: "connected"; id: string }
  | { status: "declined"; id: string; byMe: boolean };

/** Get the current user's connection state with another user. */
export const getConnectionState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ otherUserId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<ConnectionState> => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("connections")
      .select("id, requester_id, recipient_id, status")
      .or(
        `and(requester_id.eq.${userId},recipient_id.eq.${data.otherUserId}),and(requester_id.eq.${data.otherUserId},recipient_id.eq.${userId})`,
      )
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return { status: "none" };
    if (row.status === "accepted") return { status: "connected", id: row.id };
    if (row.status === "declined")
      return { status: "declined", id: row.id, byMe: row.recipient_id === userId };
    // pending
    return row.requester_id === userId
      ? { status: "outgoing_pending", id: row.id }
      : { status: "incoming_pending", id: row.id };
  });

/** Send a new connection request to another user. */
export const sendConnectionRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ recipientId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.recipientId === userId) {
      throw new Error("You cannot connect with yourself.");
    }
    const { data: blocked } = await supabase.rpc("is_blocked_between", {
      _a: userId,
      _b: data.recipientId,
    });
    if (blocked) {
      throw new Error("You cannot send a connect request to this user.");
    }

    // If a row already exists in either direction, handle it gracefully.
    const { data: existing } = await supabase
      .from("connections")
      .select("id, requester_id, recipient_id, status")
      .or(
        `and(requester_id.eq.${userId},recipient_id.eq.${data.recipientId}),and(requester_id.eq.${data.recipientId},recipient_id.eq.${userId})`,
      )
      .maybeSingle();

    if (existing) {
      if (existing.status === "accepted") return { id: existing.id, status: "connected" as const };
      if (existing.status === "pending") {
        // If the other party already asked me, accept it.
        if (existing.recipient_id === userId) {
          const { data: upd, error: uErr } = await supabase
            .from("connections")
            .update({ status: "accepted", responded_at: new Date().toISOString() })
            .eq("id", existing.id)
            .select("id")
            .single();
          if (uErr) throw new Error(uErr.message);
          return { id: upd.id, status: "connected" as const };
        }
        return { id: existing.id, status: "outgoing_pending" as const };
      }
      // declined — reopen as pending from current user
      const { data: upd, error: uErr } = await supabase
        .from("connections")
        .update({
          status: "pending",
          requester_id: userId,
          recipient_id: data.recipientId,
          responded_at: null,
        })
        .eq("id", existing.id)
        .select("id")
        .single();
      if (uErr) throw new Error(uErr.message);
      return { id: upd.id, status: "outgoing_pending" as const };
    }

    const { data: created, error } = await supabase
      .from("connections")
      .insert({ requester_id: userId, recipient_id: data.recipientId, status: "pending" })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    try {
      const { data: me } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", userId)
        .maybeSingle();
      const { notify } = await import("./push.server");
      await notify(data.recipientId, {
        title: "New connect request",
        body: `${me?.display_name || "Someone"} wants to connect on Bondoo`,
        url: "/requests",
        tag: `connect:${created.id}`,
      });
    } catch {}
    return { id: created.id, status: "outgoing_pending" as const };
  });

/** Recipient accepts or declines a pending request. */
export const respondToConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        connectionId: z.string().uuid(),
        action: z.enum(["accept", "decline"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("connections")
      .select("id, recipient_id, status")
      .eq("id", data.connectionId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Request not found.");
    if (row.recipient_id !== userId) throw new Error("Only the recipient can respond.");
    if (row.status !== "pending") throw new Error("Request already resolved.");

    const nextStatus = data.action === "accept" ? "accepted" : "declined";
    const { error: uErr } = await supabase
      .from("connections")
      .update({ status: nextStatus, responded_at: new Date().toISOString() })
      .eq("id", data.connectionId);
    if (uErr) throw new Error(uErr.message);
    if (data.action === "accept") {
      try {
        const { data: full } = await supabase
          .from("connections")
          .select("requester_id")
          .eq("id", data.connectionId)
          .maybeSingle();
        const { data: me } = await supabase
          .from("profiles")
          .select("display_name")
          .eq("id", userId)
          .maybeSingle();
        if (full) {
          const { notify } = await import("./push.server");
          await notify(full.requester_id, {
            title: "Connect accepted",
            body: `${me?.display_name || "Someone"} accepted your request`,
            url: "/requests",
            tag: `connect:${data.connectionId}`,
          });
        }
      } catch {}
    }
    return { id: data.connectionId, status: nextStatus };
  });

/** Requester cancels their own pending request. */
export const cancelConnectionRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ connectionId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("connections")
      .delete()
      .eq("id", data.connectionId)
      .eq("requester_id", userId)
      .eq("status", "pending");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Incoming pending requests for the current user. */
export const listIncomingRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: rows, error } = await supabase
      .from("connections")
      .select("id, requester_id, created_at")
      .eq("recipient_id", userId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    if (!rows || rows.length === 0) return [];

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, neighbourhood, trust_score")
      .in("id", rows.map((r) => r.requester_id));
    const map = new Map((profiles ?? []).map((p) => [p.id, p]));
    return rows.map((r) => ({
      id: r.id,
      created_at: r.created_at,
      from: map.get(r.requester_id) ?? {
        id: r.requester_id,
        display_name: "",
        neighbourhood: "",
        trust_score: null,
      },
    }));
  });

/** Accepted connections for the current user. */
export const listConnections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: rows, error } = await supabase
      .from("connections")
      .select("id, requester_id, recipient_id, responded_at, created_at")
      .eq("status", "accepted")
      .or(`requester_id.eq.${userId},recipient_id.eq.${userId}`)
      .order("responded_at", { ascending: false });
    if (error) throw new Error(error.message);
    if (!rows || rows.length === 0) return [];

    const otherIds = rows.map((r) => (r.requester_id === userId ? r.recipient_id : r.requester_id));
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, neighbourhood, trust_score")
      .in("id", otherIds);
    const map = new Map((profiles ?? []).map((p) => [p.id, p]));
    return rows.map((r) => {
      const otherId = r.requester_id === userId ? r.recipient_id : r.requester_id;
      return {
        id: r.id,
        since: r.responded_at ?? r.created_at,
        other: map.get(otherId) ?? {
          id: otherId,
          display_name: "",
          neighbourhood: "",
          trust_score: null,
        },
      };
    });
  });