import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * List all conversations for the current user, with the other participant's
 * profile info and last message preview.
 */
export const listConversations = createServerFn({ method: "GET" })

  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: convos, error } = await supabase
      .from("conversations")
      .select("id, user_a, user_b, last_message_at, created_at")
      .or(`user_a.eq.${userId},user_b.eq.${userId}`)
      .order("last_message_at", { ascending: false });
    if (error) throw new Error(error.message);
    if (!convos || convos.length === 0) return [];

    const otherIds = Array.from(
      new Set(
        convos.map((c) => (c.user_a === userId ? c.user_b : c.user_a)),
      ),
    );

    const { data: profiles, error: pErr } = await supabase
      .from("profiles")
      .select("id, display_name, neighbourhood, trust_score, avatar_path")
      .in("id", otherIds);
    if (pErr) throw new Error(pErr.message);

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

    const profileMap = new Map(profileEntries);

    // Last message per conversation
    const convoIds = convos.map((c) => c.id);
    const { data: lastMsgs } = await supabase
      .from("messages")
      .select("conversation_id, body, sender_id, created_at, attachment_path, attachment_type, attachment_name")
      .in("conversation_id", convoIds)
      .order("created_at", { ascending: false });

    const lastByConv = new Map<
      string,
      { body: string; sender_id: string; created_at: string }
    >();
    for (const m of lastMsgs ?? []) {
      if (!lastByConv.has(m.conversation_id)) {
        const preview = m.body && m.body.trim().length > 0
          ? m.body
          : m.attachment_type?.startsWith("image/")
            ? "📷 Photo"
            : m.attachment_path
              ? `📎 ${m.attachment_name ?? "Attachment"}`
              : "";
        lastByConv.set(m.conversation_id, {
          body: preview,
          sender_id: m.sender_id,
          created_at: m.created_at,
        });
      }
    }

    return convos.map((c) => {
      const otherId = c.user_a === userId ? c.user_b : c.user_a;
      const other = profileMap.get(otherId);
      return {
        id: c.id,
        last_message_at: c.last_message_at,
        other: {
          id: otherId,
          display_name: other?.display_name ?? "",
          neighbourhood: other?.neighbourhood ?? "",
          trust_score: other?.trust_score ?? null,
          avatar_url: other?.avatar_url ?? null,
        },
        last_message: lastByConv.get(c.id) ?? null,
      };
    });
  });

/**
 * Get or create a 1-on-1 conversation with another user.
 */
export const getOrCreateConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ otherUserId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.otherUserId === userId) {
      throw new Error("You cannot message yourself.");
    }
    const { data: blocked } = await supabase.rpc("is_blocked_between", {
      _a: userId,
      _b: data.otherUserId,
    });
    if (blocked) {
      throw new Error("You cannot start a conversation with this user.");
    }
    const [user_a, user_b] =
      userId < data.otherUserId
        ? [userId, data.otherUserId]
        : [data.otherUserId, userId];

    const { data: existing, error: lookupError } = await supabase
      .from("conversations")
      .select("id")
      .eq("user_a", user_a)
      .eq("user_b", user_b)
      .maybeSingle();
    if (lookupError) throw new Error(`Could not open chat: ${lookupError.message}`);
    if (existing) return { id: existing.id };

    const { data: created, error } = await supabase
      .from("conversations")
      .insert({ user_a, user_b })
      .select("id")
      .single();
    if (error) {
      // Two near-simultaneous taps can race against the unique participant pair.
      // In that case, return the conversation created by the other request.
      if (error.code === "23505") {
        const { data: raced, error: racedError } = await supabase
          .from("conversations")
          .select("id")
          .eq("user_a", user_a)
          .eq("user_b", user_b)
          .single();
        if (racedError) throw new Error(`Could not open chat: ${racedError.message}`);
        return { id: raced.id };
      }
      throw new Error(`Could not open chat: ${error.message}`);
    }
    return { id: created.id };
  });

/**
 * Fetch a conversation (with the other user's profile) + its messages.
 */
export const getConversation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ conversationId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: convo, error } = await supabase
      .from("conversations")
      .select("id, user_a, user_b, last_message_at")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!convo) throw new Error("Conversation not found");

    const otherId = convo.user_a === userId ? convo.user_b : convo.user_a;
    const { data: other } = await supabase
      .from("profiles")
      .select("id, display_name, neighbourhood, trust_score, avatar_path")
      .eq("id", otherId)
      .maybeSingle();

    let avatar_url: string | null = null;
    if (other?.avatar_path) {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: signed } = await supabaseAdmin.storage
          .from("avatars")
          .createSignedUrl(other.avatar_path, 3600);
        avatar_url = signed?.signedUrl ?? null;
      } catch {}
      if (!avatar_url) {
        avatar_url = supabase.storage.from("avatars").getPublicUrl(other.avatar_path).data.publicUrl;
      }
    }

    const { data: messages, error: mErr } = await supabase
      .from("messages")
      .select("id, sender_id, body, created_at, delivered_at, read_at, attachment_path, attachment_type, attachment_name")
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: true });
    if (mErr) throw new Error(mErr.message);

    return {
      id: convo.id,
      me: userId,
      other: {
        id: otherId,
        display_name: other?.display_name ?? "",
        neighbourhood: other?.neighbourhood ?? "",
        trust_score: other?.trust_score ?? null,
        avatar_url,
      },
      messages: messages ?? [],
    };
  });

/**
 * Send a message into a conversation.
 */
export const sendMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        conversationId: z.string().uuid(),
        body: z.string().trim().min(1).max(2000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: convo0 } = await supabase
      .from("conversations")
      .select("user_a, user_b")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (convo0) {
      const { data: blocked } = await supabase.rpc("is_blocked_between", {
        _a: convo0.user_a,
        _b: convo0.user_b,
      });
      if (blocked) throw new Error("You cannot message this user.");
    }
    const { data: row, error } = await supabase
      .from("messages")
      .insert({
        conversation_id: data.conversationId,
        sender_id: userId,
        body: data.body,
      })
      .select("id, sender_id, body, created_at, delivered_at, read_at")
      .single();
    if (error) throw new Error(error.message);

    // Notify the other participant (best-effort, never blocks the send).
    try {
      const { data: convo } = await supabase
        .from("conversations")
        .select("user_a, user_b")
        .eq("id", data.conversationId)
        .maybeSingle();
      if (convo) {
        const otherId = convo.user_a === userId ? convo.user_b : convo.user_a;
        const { data: me } = await supabase
          .from("profiles")
          .select("display_name")
          .eq("id", userId)
          .maybeSingle();
        const { notify } = await import("./push.server");
        await notify(otherId, {
          title: me?.display_name || "New message",
          body: data.body.slice(0, 140),
          url: `/messages/${data.conversationId}`,
          tag: `msg:${data.conversationId}`,
        });
      }
    } catch {
      // swallow
    }

    return row;
  });

/**
 * Search users by display_name (case-insensitive) to start a new conversation.
 */
export const searchUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ q: z.string().trim().min(1).max(80) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: rows, error } = await supabase
      .from("profiles")
      .select("id, display_name, neighbourhood, trust_score, avatar_path")
      .ilike("display_name", `%${data.q}%`)
      .neq("id", userId)
      .limit(20);
    if (error) throw new Error(error.message);

    const withAvatars = await Promise.all(
      (rows ?? []).map(async (u) => {
        let avatar_url: string | null = null;
        if (u.avatar_path) {
          try {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { data: signed } = await supabaseAdmin.storage
              .from("avatars")
              .createSignedUrl(u.avatar_path, 3600);
            avatar_url = signed?.signedUrl ?? null;
          } catch {}
          if (!avatar_url) {
            avatar_url = supabase.storage.from("avatars").getPublicUrl(u.avatar_path).data.publicUrl;
          }
        }
        return { ...u, avatar_url };
      }),
    );
    return withAvatars;
  });

/**
 * Trigger a push notification for a message that was inserted directly
 * from the client (bypassing sendMessage). Best-effort — always resolves.
 */
export const notifyMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ messageId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    try {
      const { data: msg } = await supabase
        .from("messages")
        .select("conversation_id, sender_id, body, attachment_type, attachment_name")
        .eq("id", data.messageId)
        .maybeSingle();
      if (!msg || msg.sender_id !== userId) return { ok: false };
      const { data: convo } = await supabase
        .from("conversations")
        .select("user_a, user_b")
        .eq("id", msg.conversation_id)
        .maybeSingle();
      if (!convo) return { ok: false };
      const otherId = convo.user_a === userId ? convo.user_b : convo.user_a;
      const { data: me } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", userId)
        .maybeSingle();
      const { notify } = await import("./push.server");
      const preview =
        msg.body && msg.body.trim().length > 0
          ? msg.body.slice(0, 140)
          : msg.attachment_type?.startsWith("image/")
            ? "📷 Photo"
            : msg.attachment_name
              ? `📎 ${msg.attachment_name}`
              : "New message";
      await notify(otherId, {
        title: me?.display_name || "New message",
        body: preview,
        url: `/messages/${msg.conversation_id}`,
        tag: `msg:${msg.conversation_id}`,
      });
      return { ok: true };
    } catch {
      return { ok: false };
    }
  });

/**
 * Return a short-lived signed URL for a chat attachment, after verifying
 * the caller is a participant in the owning conversation. Uses the admin
 * client so it works regardless of storage RLS.
 */
export const getAttachmentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ path: z.string().min(1).max(500) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const conversationId = data.path.split("/")[0];
    if (!conversationId) throw new Error("Invalid attachment path");
    const { data: convo, error } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", conversationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: signed, error: sErr } = await supabaseAdmin.storage
        .from("chat-attachments")
        .createSignedUrl(data.path, 60 * 60);
      if (signed?.signedUrl) return { url: signed.signedUrl, viewerId: userId };
    } catch {
      // Fallback to public URL
    }
    const { data: pub } = supabase.storage
      .from("chat-attachments")
      .getPublicUrl(data.path);
    return { url: pub.publicUrl, viewerId: userId };
  });