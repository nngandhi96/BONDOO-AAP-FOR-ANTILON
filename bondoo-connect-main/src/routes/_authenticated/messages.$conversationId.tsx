import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getConversation } from "@/lib/chat.functions";
import { notifyMessage } from "@/lib/chat.functions";
import { listMeetups, proposeMeetup, respondMeetup } from "@/lib/meetups.functions";
import { SafetyMenu } from "@/components/safety-menu";
import { MapPreview } from "@/components/map-preview";
import { subscribePresence } from "@/lib/presence-store";
import { ChatAttachment } from "@/components/chat-attachment";

export const Route = createFileRoute("/_authenticated/messages/$conversationId")({
  head: () => ({
    meta: [
      { title: "Chat · Bondoo" },
      { name: "description", content: "Decide where to meet for coffee or tea." },
    ],
  }),
  component: ChatPage,
});

const SUGGESTIONS = [
  "☕ Coffee at a nearby café?",
  "🍵 Chai + walk?",
  "🌳 Park bench chat?",
  "📚 Library corner?",
];

function ChatPage() {
  const { conversationId } = useParams({ from: "/_authenticated/messages/$conversationId" });
  const fetchConvo = useServerFn(getConversation);
  const notifyMsg = useServerFn(notifyMessage);
  const fetchMeetups = useServerFn(listMeetups);
  const propose = useServerFn(proposeMeetup);
  const respond = useServerFn(respondMeetup);
  const qc = useQueryClient();

  const { data, isLoading, error: conversationError, refetch: refetchConversation } = useQuery({
    queryKey: ["conversation", conversationId],
    queryFn: () => fetchConvo({ data: { conversationId } }),
  });

  const { data: meetups } = useQuery({
    queryKey: ["meetups", conversationId],
    queryFn: () => fetchMeetups({ data: { conversationId } }),
  });

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [otherTyping, setOtherTyping] = useState(false);
  const [otherOnline, setOtherOnline] = useState(false);
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastTypingSentRef = useRef(0);
  const typingClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showSafety, setShowSafety] = useState(false);
  const [showPropose, setShowPropose] = useState(false);
  const [pPlace, setPPlace] = useState("");
  const [pAddress, setPAddress] = useState("");
  const [pWhen, setPWhen] = useState("");
  const [pNote, setPNote] = useState("");
  const [pBusy, setPBusy] = useState(false);
  const [pErr, setPErr] = useState<string | null>(null);
  const [respBusy, setRespBusy] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const messages = data?.messages ?? [];
  const me = data?.me;

  // Realtime channel: typing + instant message broadcast (bypasses RLS-postgres_changes lag)
  useEffect(() => {
    if (!me) return;
    const channel = supabase.channel(`conv:${conversationId}`, {
      config: { broadcast: { self: false } },
    });

    type BroadcastMsg = {
      id: string;
      sender_id: string;
      body: string | null;
      created_at: string;
      delivered_at?: string | null;
      read_at?: string | null;
      attachment_path?: string | null;
      attachment_type?: string | null;
      attachment_name?: string | null;
    };

    channel
      .on("broadcast", { event: "typing" }, (payload) => {
        const from = (payload.payload as { userId?: string } | undefined)?.userId;
        if (!from || from === me) return;
        setOtherTyping(true);
        if (typingClearRef.current) clearTimeout(typingClearRef.current);
        typingClearRef.current = setTimeout(() => setOtherTyping(false), 3000);
      })
      .on("broadcast", { event: "stop_typing" }, (payload) => {
        const from = (payload.payload as { userId?: string } | undefined)?.userId;
        if (!from || from === me) return;
        setOtherTyping(false);
        if (typingClearRef.current) clearTimeout(typingClearRef.current);
      })
      .on("broadcast", { event: "new_message" }, (payload) => {
        const msg = (payload.payload as { message?: BroadcastMsg } | undefined)?.message;
        if (!msg || msg.sender_id === me) return;
        setOtherTyping(false);
        qc.setQueryData(
          ["conversation", conversationId],
          (current: typeof data) =>
            current
              ? {
                  ...current,
                  messages: current.messages.some((item) => item.id === msg.id)
                    ? current.messages
                    : [...current.messages, msg],
                }
              : current,
        );
        qc.invalidateQueries({ queryKey: ["conversations"] });
        // Mark as delivered on recipient's device immediately
        const at = new Date().toISOString();
        void supabase
          .from("messages")
          .update({ delivered_at: at })
          .eq("id", msg.id)
          .is("delivered_at", null)
          .then(() => {
            typingChannelRef.current?.send({
              type: "broadcast",
              event: "delivered",
              payload: { userId: me, messageId: msg.id, at },
            });
          });
      })
      .on("broadcast", { event: "delivered" }, (payload) => {
        const p = payload.payload as { userId?: string; messageId?: string; at?: string } | undefined;
        if (!p?.userId || p.userId === me) return;
        const at = p.at ?? new Date().toISOString();
        qc.setQueryData(
          ["conversation", conversationId],
          (current: typeof data) =>
            current
              ? {
                  ...current,
                  messages: current.messages.map((m) =>
                    m.sender_id === me && !m.delivered_at && (!p.messageId || m.id === p.messageId)
                      ? { ...m, delivered_at: at }
                      : m,
                  ),
                }
              : current,
        );
      })
      .on("broadcast", { event: "read" }, (payload) => {
        const p = payload.payload as { userId?: string; at?: string } | undefined;
        if (!p?.userId || p.userId === me) return;
        const at = p.at ?? new Date().toISOString();
        qc.setQueryData(
          ["conversation", conversationId],
          (current: typeof data) =>
            current
              ? {
                  ...current,
                  messages: current.messages.map((m) =>
                    m.sender_id === me && !m.read_at
                      ? { ...m, read_at: at, delivered_at: m.delivered_at ?? at }
                      : m,
                  ),
                }
              : current,
        );
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void channel.track({ userId: me, at: new Date().toISOString() });
        }
      });
    typingChannelRef.current = channel;
    return () => {
      if (typingClearRef.current) clearTimeout(typingClearRef.current);
      void channel.untrack();
      supabase.removeChannel(channel);
      typingChannelRef.current = null;
    };
  }, [conversationId, me, qc]);

  // Global online presence: watch whether the other user is signed into the app
  const otherId = data?.other.id;
  useEffect(() => {
    if (!otherId) return;
    const unsub = subscribePresence((online) => setOtherOnline(online.has(otherId)));
    return () => {
      unsub();
      setOtherOnline(false);
    };
  }, [otherId]);

  const broadcastTyping = (event: "typing" | "stop_typing") => {
    const ch = typingChannelRef.current;
    if (!ch || !me) return;
    ch.send({ type: "broadcast", event, payload: { userId: me } });
  };

  const handleTypingChange = (value: string) => {
    setText(value);
    if (!me) return;
    if (value.trim().length === 0) {
      broadcastTyping("stop_typing");
      lastTypingSentRef.current = 0;
      return;
    }
    const now = Date.now();
    if (now - lastTypingSentRef.current > 1500) {
      broadcastTyping("typing");
      lastTypingSentRef.current = now;
    }
  };

  // Scroll to bottom on new messages
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages.length]);

  // Mark incoming messages as read when this chat is open & visible
  useEffect(() => {
    if (!me || messages.length === 0) return;
    const unread = messages.filter((m) => m.sender_id !== me && !m.read_at);
    if (unread.length === 0) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    const ids = unread.map((m) => m.id);
    const at = new Date().toISOString();
    (async () => {
      const { error } = await supabase
        .from("messages")
        .update({ read_at: at, delivered_at: at })
        .in("id", ids);
      if (error) return;
      qc.setQueryData(
        ["conversation", conversationId],
        (current: typeof data) =>
          current
            ? {
                ...current,
                messages: current.messages.map((m) =>
                  ids.includes(m.id)
                    ? { ...m, read_at: at, delivered_at: m.delivered_at ?? at }
                    : m,
                ),
              }
            : current,
      );
      typingChannelRef.current?.send({
        type: "broadcast",
        event: "read",
        payload: { userId: me, at },
      });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    })();
  }, [messages, me, conversationId, qc]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["conversation", conversationId] });
          qc.invalidateQueries({ queryKey: ["meetups", conversationId] });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const row = payload.new as {
            id: string;
            delivered_at: string | null;
            read_at: string | null;
          };
          qc.setQueryData(
            ["conversation", conversationId],
            (current: typeof data) =>
              current
                ? {
                    ...current,
                    messages: current.messages.map((m) =>
                      m.id === row.id
                        ? { ...m, delivered_at: row.delivered_at, read_at: row.read_at }
                        : m,
                    ),
                  }
                : current,
          );
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, qc]);

  // Realtime: refetch meetups on any change
  useEffect(() => {
    const channel = supabase
      .channel(`meetups:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "meetups",
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["meetups", conversationId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, qc]);

  // First-visit safety popup
  useEffect(() => {
    if (!data) return;
    const key = `bondoo:safety-seen:${conversationId}`;
    if (typeof window !== "undefined" && !window.localStorage.getItem(key)) {
      setShowSafety(true);
      window.localStorage.setItem(key, "1");
    }
  }, [conversationId, data]);

  const submit = async (
    bodyRaw: string,
    attachment?: {
      path: string;
      type: string;
      name: string;
    } | null,
  ) => {
    const body = bodyRaw.trim();
    if (!body && !attachment) return;
    if (sending) return;
    setSendError(null);
    setSending(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) {
        throw new Error("Your session has expired. Please sign in again.");
      }

      const { data: message, error } = await supabase
        .from("messages")
        .insert({
          conversation_id: conversationId,
          sender_id: authData.user.id,
          body: body.length > 0 ? body : null,
          attachment_path: attachment?.path ?? null,
          attachment_type: attachment?.type ?? null,
          attachment_name: attachment?.name ?? null,
        })
        .select(
          "id, sender_id, body, created_at, delivered_at, read_at, attachment_path, attachment_type, attachment_name",
        )
        .single();
      if (error) throw new Error(error.message);

      setText("");
      broadcastTyping("stop_typing");
      lastTypingSentRef.current = 0;
      qc.setQueryData(
        ["conversation", conversationId],
        (current: typeof data) =>
          current
            ? {
                ...current,
                messages: current.messages.some((item) => item.id === message.id)
                  ? current.messages
                  : [...current.messages, message],
              }
            : current,
      );
      // Push instantly to the other participant via broadcast
      typingChannelRef.current?.send({
        type: "broadcast",
        event: "new_message",
        payload: { message },
      });
      // Fire-and-forget push notification for background delivery
      void notifyMsg({ data: { messageId: message.id } }).catch(() => {});
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["conversation", conversationId] }),
        qc.invalidateQueries({ queryKey: ["conversations"] }),
      ]);
      requestAnimationFrame(() => inputRef.current?.focus());
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "Message could not be sent. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const MAX_FILE_SIZE = 15 * 1024 * 1024;

  const handleFilePick = async (file: File) => {
    setSendError(null);
    if (file.size === 0) {
      setSendError("File is empty.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setSendError("File too large. Max 15 MB.");
      return;
    }
    if (!me) return;
    setUploading(true);
    try {
      const ext =
        file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
      const path = `${conversationId}/${me}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("chat-attachments")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw new Error(upErr.message);
      await submit(text, {
        path,
        type: file.type || "application/octet-stream",
        name: file.name,
      });
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Could not upload file.");
    } finally {
      setUploading(false);
    }
  };

  const grouped = useMemo(() => {
    const out: Array<{ day: string; items: typeof messages }> = [];
    for (const m of messages) {
      const day = new Date(m.created_at).toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
      const last = out[out.length - 1];
      if (last && last.day === day) last.items.push(m);
      else out.push({ day, items: [m] });
    }
    return out;
  }, [messages]);

  const activeMeetup = useMemo(() => {
    const list = meetups ?? [];
    return (
      list.find((m) => m.status === "pending") ??
      list.find((m) => m.status === "reschedule_pending") ??
      list.find((m) => m.status === "confirmed") ??
      null
    );
  }, [meetups]);

  const submitPropose = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pBusy) return;
    setPErr(null);
    setPBusy(true);
    try {
      await propose({
        data: {
          conversationId,
          place: pPlace,
          address: pAddress,
          scheduledAt: new Date(pWhen).toISOString(),
          note: pNote,
        },
      });
      setShowPropose(false);
      setPPlace("");
      setPAddress("");
      setPWhen("");
      setPNote("");
      qc.invalidateQueries({ queryKey: ["meetups", conversationId] });
      qc.invalidateQueries({ queryKey: ["conversation", conversationId] });
    } catch (err) {
      setPErr(err instanceof Error ? err.message : "Could not propose");
    } finally {
      setPBusy(false);
    }
  };

  const handleRespond = async (
    meetupId: string,
    action: "confirm" | "decline" | "cancel",
  ) => {
    setRespBusy(meetupId + action);
    try {
      await respond({ data: { meetupId, action } });
      qc.invalidateQueries({ queryKey: ["meetups", conversationId] });
      qc.invalidateQueries({ queryKey: ["conversation", conversationId] });
    } finally {
      setRespBusy(null);
    }
  };

  return (
    <main className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-md mx-auto px-6 py-4 flex items-center gap-3">
          <Link
            to="/messages"
            className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold hover:text-ink"
          >
            ← Chats
          </Link>
          {data?.other.id ? (
            <Link
              to="/user/$userId"
              params={{ userId: data.other.id }}
              className="flex-1 flex items-center gap-3 min-w-0 hover:opacity-80"
            >
              <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center font-semibold text-xs shrink-0">
                {(data.other.display_name || "?")
                  .split(" ")
                  .map((s) => s[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-ink truncate leading-tight">
                  {data.other.display_name || "Someone"}
                </p>
                <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                  <span
                    className={`inline-block h-1.5 w-1.5 rounded-full ${otherOnline ? "bg-green-500 animate-pulse" : "bg-muted-foreground/40"}`}
                    aria-hidden
                  />
                  <span className={otherOnline ? "text-green-600 font-medium" : ""}>
                    {otherOnline ? "Active now" : "Offline"}
                  </span>
                  {data.other.neighbourhood && ` · ${data.other.neighbourhood}`}
                  {data.other.trust_score != null && ` · Trust ${data.other.trust_score}`}
                </p>
              </div>
            </Link>
          ) : (
            <div className="flex-1" />
          )}
          <button
            onClick={() => setShowSafety(true)}
            className="text-xs display italic text-brand-orange"
            aria-label="Safety guidelines"
          >
            Safety
          </button>
          {data?.other.id && (
            <SafetyMenu
              userId={data.other.id}
              displayName={data.other.display_name || "this member"}
              context="chat"
              conversationId={conversationId}
            />
          )}
        </div>
      </header>

      {/* Meetup panel */}
      {activeMeetup && me && (
        <div className="border-b border-border bg-paper">
          <div className="max-w-md mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-[0.22em] font-semibold text-brand-orange">
                {activeMeetup.status === "confirmed"
                  ? "Meetup confirmed"
                  : activeMeetup.status === "reschedule_pending"
                    ? "Reschedule proposed"
                    : "Meetup proposed"}
              </p>
              <Link
                to="/meetup/$meetupId"
                params={{ meetupId: activeMeetup.id }}
                className={`text-[10px] uppercase tracking-[0.18em] font-semibold px-2 py-0.5 rounded-full ${
                  activeMeetup.status === "confirmed"
                    ? "bg-primary/15 text-primary"
                    : "bg-brand-orange/15 text-brand-orange"
                }`}
              >
                {activeMeetup.status} · Details →
              </Link>
            </div>
            <p className="display text-xl text-ink mt-1 leading-tight">
              {activeMeetup.place}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {new Date(activeMeetup.scheduled_at).toLocaleString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
              {activeMeetup.address ? ` · ${activeMeetup.address}` : ""}
            </p>
            {activeMeetup.note && (
              <p className="text-sm text-ink/80 mt-2">{activeMeetup.note}</p>
            )}
            <MapPreview
              place={activeMeetup.place}
              address={activeMeetup.address}
              className="mt-3"
            />
            <Link
              to="/meetup/$meetupId"
              params={{ meetupId: activeMeetup.id }}
              className="mt-3 inline-block text-xs display italic text-primary"
            >
              View full details →
            </Link>
            {activeMeetup.status === "pending" && (
              <div className="mt-3 flex gap-2">
                {me === activeMeetup.recipient_id ? (
                  <>
                    <button
                      disabled={!!respBusy}
                      onClick={() => handleRespond(activeMeetup.id, "confirm")}
                      className="flex-1 rounded-2xl bg-ink text-background font-semibold py-2.5 text-sm disabled:opacity-40"
                    >
                      Confirm
                    </button>
                    <button
                      disabled={!!respBusy}
                      onClick={() => handleRespond(activeMeetup.id, "decline")}
                      className="flex-1 rounded-2xl border border-border bg-background text-ink font-semibold py-2.5 text-sm disabled:opacity-40"
                    >
                      Decline
                    </button>
                  </>
                ) : (
                  <button
                    disabled={!!respBusy}
                    onClick={() => handleRespond(activeMeetup.id, "cancel")}
                    className="flex-1 rounded-2xl border border-border bg-background text-ink font-semibold py-2.5 text-sm disabled:opacity-40"
                  >
                    Cancel proposal
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Messages */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto"
      >
        <div className="max-w-md mx-auto px-6 py-6">
          {isLoading ? (
            <p className="text-sm text-muted-foreground text-center py-10">Loading…</p>
          ) : conversationError ? (
            <div className="py-10 text-center">
              <p className="text-sm text-destructive">Chat could not be loaded.</p>
              <button
                onClick={() => void refetchConversation()}
                className="mt-4 rounded-full border border-border bg-paper px-5 py-2 text-sm font-semibold text-ink"
              >
                Try again
              </button>
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-10">
              <p className="display text-2xl text-ink leading-tight">
                Say <em className="text-brand-orange">hi</em>.
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Pick a public spot — café, park, or library.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => submit(s)}
                    className="px-3 py-2 rounded-full bg-paper border border-border text-sm text-ink hover:bg-surface"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            grouped.map((g) => (
              <div key={g.day}>
                <p className="text-center text-[10px] uppercase tracking-[0.22em] text-muted-foreground my-4">
                  {g.day}
                </p>
                <ul className="space-y-2">
                  {g.items.map((m) => {
                    const mine = m.sender_id === me;
                    return (
                      <li
                        key={m.id}
                        className={`flex ${mine ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[78%] px-4 py-2.5 rounded-2xl text-[15px] leading-snug ${
                            mine
                              ? "bg-ink text-background rounded-br-md"
                              : "bg-paper border border-border text-ink rounded-bl-md"
                          }`}
                        >
                          {m.attachment_path && (
                            <ChatAttachment
                              path={m.attachment_path}
                              type={m.attachment_type}
                              name={m.attachment_name}
                              mine={mine}
                            />
                          )}
                          {m.body && m.body.trim().length > 0 && (
                            <p className="whitespace-pre-wrap break-words">{m.body}</p>
                          )}
                          <p
                            className={`text-[10px] mt-1 flex items-center gap-1 ${
                              mine ? "text-background/60 justify-end" : "text-muted-foreground"
                            }`}
                          >
                            <span>
                              {new Date(m.created_at).toLocaleTimeString([], {
                                hour: "numeric",
                                minute: "2-digit",
                              })}
                            </span>
                            {mine && (
                              <span
                                aria-label={
                                  m.read_at ? "Read" : m.delivered_at ? "Delivered" : "Sent"
                                }
                                title={
                                  m.read_at
                                    ? `Read ${new Date(m.read_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
                                    : m.delivered_at
                                      ? "Delivered"
                                      : "Sent"
                                }
                                className={
                                  m.read_at
                                    ? "text-brand-orange"
                                    : m.delivered_at
                                      ? "text-background/90"
                                      : "text-background/50"
                                }
                              >
                                {m.read_at ? "✓✓" : m.delivered_at ? "✓✓" : "✓"}
                              </span>
                            )}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>
        {otherTyping && (
          <div className="max-w-md mx-auto px-6 pb-3">
            <div className="inline-flex items-center gap-2 px-3 py-2 rounded-2xl bg-paper border border-border">
              <span className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:-0.3s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:-0.15s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" />
              </span>
              <span className="text-xs text-muted-foreground italic">
                {data?.other.display_name || "Someone"} is typing…
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="sticky bottom-0 bg-background/95 backdrop-blur border-t border-border">
        {sendError && (
          <p role="alert" className="max-w-md mx-auto px-4 pt-3 text-sm text-destructive">
            {sendError}
          </p>
        )}
        <div className="max-w-md mx-auto px-4 pt-2">
          <button
            type="button"
            onClick={() => setShowPropose(true)}
            className="text-xs display italic text-brand-orange"
          >
            📍 Propose coffee/tea meetup
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(text);
          }}
          className="max-w-md mx-auto px-4 py-3 flex items-end gap-2"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFilePick(f);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || sending || Boolean(conversationError)}
            aria-label="Attach photo or file"
            className="h-11 w-11 shrink-0 rounded-2xl border border-border bg-paper text-ink text-xl flex items-center justify-center disabled:opacity-40"
          >
            {uploading ? "…" : "📎"}
          </button>
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => handleTypingChange(e.target.value)}
            onBlur={() => broadcastTyping("stop_typing")}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(text);
              }
            }}
            rows={1}
            disabled={Boolean(conversationError)}
            placeholder="Suggest a spot…"
            className="flex-1 resize-none rounded-2xl border border-border bg-paper px-4 py-3 text-ink outline-none focus:border-primary max-h-32"
          />
          <button
            type="submit"
            disabled={sending || uploading || !text.trim() || Boolean(conversationError)}
            className="h-11 px-4 rounded-2xl bg-ink text-background font-semibold disabled:opacity-40"
          >
            Send
          </button>
        </form>
      </div>

      {showPropose && (
        <div
          className="fixed inset-0 z-30 bg-ink/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={() => setShowPropose(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={submitPropose}
            className="w-full max-w-md bg-background rounded-3xl p-7 shadow-2xl border border-border"
          >
            <p className="text-center text-[11px] uppercase tracking-[0.22em] text-brand-orange font-semibold">
              Propose a meetup
            </p>
            <h2 className="display text-2xl text-ink text-center mt-2 leading-tight">
              Where & <em className="text-primary not-italic">when</em>?
            </h2>
            <div className="mt-5 space-y-3">
              <div>
                <label className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
                  Place *
                </label>
                <input
                  required
                  value={pPlace}
                  onChange={(e) => setPPlace(e.target.value)}
                  placeholder="Blue Tokai Café"
                  className="mt-1 w-full rounded-2xl border border-border bg-paper px-4 py-2.5 text-ink outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
                  Address / area
                </label>
                <input
                  value={pAddress}
                  onChange={(e) => setPAddress(e.target.value)}
                  placeholder="Khan Market, Delhi"
                  className="mt-1 w-full rounded-2xl border border-border bg-paper px-4 py-2.5 text-ink outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
                  Date & time *
                </label>
                <input
                  required
                  type="datetime-local"
                  value={pWhen}
                  onChange={(e) => setPWhen(e.target.value)}
                  className="mt-1 w-full rounded-2xl border border-border bg-paper px-4 py-2.5 text-ink outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
                  Note
                </label>
                <textarea
                  value={pNote}
                  onChange={(e) => setPNote(e.target.value)}
                  rows={2}
                  placeholder="I'll be at the window seat."
                  className="mt-1 w-full resize-none rounded-2xl border border-border bg-paper px-4 py-2.5 text-ink outline-none focus:border-primary"
                />
              </div>
            </div>
            {pErr && (
              <p className="mt-3 text-sm text-destructive text-center">{pErr}</p>
            )}
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setShowPropose(false)}
                className="flex-1 rounded-2xl border border-border bg-background text-ink font-semibold py-3"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={pBusy || !pPlace.trim() || !pWhen}
                className="flex-1 rounded-2xl bg-ink text-background font-semibold py-3 disabled:opacity-40"
              >
                {pBusy ? "Sending…" : "Send proposal"}
              </button>
            </div>
          </form>
        </div>
      )}

      {showSafety && (
        <div
          className="fixed inset-0 z-30 bg-ink/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={() => setShowSafety(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-background rounded-3xl p-7 shadow-2xl border border-border"
          >
            <p className="text-center text-[11px] uppercase tracking-[0.22em] text-brand-orange font-semibold">
              Before you meet
            </p>
            <h2 className="display text-3xl text-ink text-center mt-2 leading-tight">
              Meet in <em className="text-primary not-italic">public</em>.
            </h2>
            <ul className="mt-6 space-y-4 text-sm">
              {[
                ["📍", "Choose a café, park, or library — never a private address."],
                ["🕒", "Share the plan with a friend before you go."],
                ["🚫", "Bondoo is not a dating app. Keep it friendly."],
                ["🛟", "Use SOS in the app if anything feels off."],
              ].map(([icon, t]) => (
                <li key={t} className="flex gap-3 items-start pb-4 border-b border-border last:border-0 last:pb-0">
                  <span className="text-lg">{icon}</span>
                  <span className="text-ink/85 leading-snug">{t}</span>
                </li>
              ))}
            </ul>
            <button
              onClick={() => setShowSafety(false)}
              className="mt-6 w-full rounded-2xl bg-ink text-background font-semibold py-3.5"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </main>
  );
}