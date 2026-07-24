import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listConversations, searchUsers, getOrCreateConversation } from "@/lib/chat.functions";
import { listIncomingRequests } from "@/lib/connections.functions";

export const Route = createFileRoute("/_authenticated/messages/")({
  head: () => ({
    meta: [
      { title: "Messages · Bondoo" },
      { name: "description", content: "Chat with people to decide where to meet." },
    ],
  }),
  component: MessagesPage,
});

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function MessagesPage() {
  const navigate = useNavigate();
  const fetchList = useServerFn(listConversations);
  const fetchSearch = useServerFn(searchUsers);
  const getOrCreate = useServerFn(getOrCreateConversation);
  const fetchIncoming = useServerFn(listIncomingRequests);

  const [showNew, setShowNew] = useState(false);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [openingUserId, setOpeningUserId] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const { data: conversations, isLoading, refetch } = useQuery({
    queryKey: ["conversations"],
    queryFn: () => fetchList(),
    refetchInterval: 5000,
  });

  const { data: results } = useQuery({
    queryKey: ["userSearch", debounced],
    queryFn: () => fetchSearch({ data: { q: debounced } }),
    enabled: showNew && debounced.length > 0,
  });

  const { data: incoming } = useQuery({
    queryKey: ["incoming-requests"],
    queryFn: () => fetchIncoming(),
  });
  const pendingCount = incoming?.length ?? 0;

  const startWith = async (otherUserId: string) => {
    if (openingUserId) return;
    setChatError(null);
    setOpeningUserId(otherUserId);
    try {
      const { id } = await getOrCreate({ data: { otherUserId } });
      setShowNew(false);
      setQuery("");
      await navigate({ to: "/messages/$conversationId", params: { conversationId: id } });
      void refetch();
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "Chat could not be opened. Please try again.");
    } finally {
      setOpeningUserId(null);
    }
  };

  return (
    <main className="min-h-screen bg-background pb-16">
      <header className="max-w-md mx-auto px-6 pt-8">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.24em] text-muted-foreground font-semibold">
          <Link to="/dashboard" className="hover:text-ink">← Back</Link>
          <Link to="/requests" className="hover:text-ink relative">
            Requests
            {pendingCount > 0 && (
              <span className="ml-1 inline-flex items-center justify-center rounded-full bg-brand-orange text-background text-[10px] font-bold h-4 min-w-4 px-1 align-middle">
                {pendingCount}
              </span>
            )}
          </Link>
        </div>
        <div className="mt-4 flex items-end justify-between border-b border-ink/80 pb-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-brand-orange font-semibold">
              Your
            </p>
            <h1 className="display text-[2.4rem] leading-[0.95] text-ink mt-1">
              Messages<span className="text-brand-orange">.</span>
            </h1>
          </div>
          <button
            onClick={() => setShowNew(true)}
            className="rounded-full bg-ink text-background px-4 py-2 text-sm font-semibold"
          >
            + New
          </button>
        </div>
      </header>

      <section className="max-w-md mx-auto px-6 pt-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
        ) : conversations && conversations.length > 0 ? (
          <ul className="divide-y divide-border border-b border-border">
            {conversations.map((c) => (
              <li key={c.id}>
                <Link
                  to="/messages/$conversationId"
                  params={{ conversationId: c.id }}
                  className="flex items-center gap-3 py-4 hover:bg-paper/60 -mx-2 px-2 rounded-xl transition"
                >
                  <div className="h-11 w-11 rounded-full bg-secondary flex items-center justify-center font-semibold text-sm shrink-0">
                    {(c.other.display_name || "?")
                      .split(" ")
                      .map((s) => s[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-ink truncate">
                        {c.other.display_name || "Someone"}
                      </p>
                      <span className="text-[11px] text-muted-foreground shrink-0">
                        {timeAgo(c.last_message_at)}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {c.last_message?.body ?? (
                        <em className="display italic">Say hi to plan a spot →</em>
                      )}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-center py-16">
            <p className="display text-2xl text-ink leading-tight">
              No chats <em className="text-brand-orange">yet</em>.
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Start a chat to decide a café or park.
            </p>
            <button
              onClick={() => setShowNew(true)}
              className="mt-6 rounded-full bg-ink text-background px-6 py-3 font-semibold"
            >
              Start a chat
            </button>
          </div>
        )}
      </section>

      {showNew && (
        <div
          className="fixed inset-0 z-30 bg-ink/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={() => setShowNew(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-background rounded-3xl p-6 shadow-2xl border border-border"
          >
            <p className="text-[11px] uppercase tracking-[0.22em] text-brand-orange font-semibold">
              Find someone
            </p>
            <h2 className="display text-2xl text-ink mt-1">Start a new chat</h2>
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name…"
              className="mt-4 w-full rounded-2xl border border-border bg-paper px-4 py-3 text-ink outline-none focus:border-primary"
            />
            {chatError && (
              <p role="alert" className="mt-3 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {chatError}
              </p>
            )}
            <ul className="mt-3 max-h-72 overflow-y-auto divide-y divide-border">
              {(results ?? []).map((u) => (
                <li key={u.id}>
                  <button
                    onClick={() => startWith(u.id)}
                    disabled={openingUserId !== null}
                    className="w-full flex items-center gap-3 py-3 text-left hover:bg-paper/60 -mx-2 px-2 rounded-xl disabled:opacity-60"
                  >
                    <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center font-semibold text-xs">
                      {(u.display_name || "?")
                        .split(" ")
                        .map((s) => s[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-ink truncate">
                        {u.display_name || "Unnamed"}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {openingUserId === u.id ? "Opening chat…" : u.neighbourhood || "—"}
                        {u.trust_score != null && ` · Trust ${u.trust_score}`}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
              {debounced && (results?.length ?? 0) === 0 && (
                <li className="py-6 text-center text-sm text-muted-foreground">
                  No one matches "{debounced}".
                </li>
              )}
            </ul>
            <button
              onClick={() => setShowNew(false)}
              className="mt-4 w-full rounded-2xl border border-border py-3 text-ink font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </main>
  );
}