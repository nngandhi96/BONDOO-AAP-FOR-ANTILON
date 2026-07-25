import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listIncomingRequests,
  listConnections,
  respondToConnection,
} from "@/lib/connections.functions";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/requests")({
  head: () => ({
    meta: [
      { title: "Requests · Bondoo" },
      { name: "description", content: "Incoming connection requests and your Bondoo connections." },
    ],
  }),
  component: RequestsPage,
});

function initials(name: string) {
  return (name || "?")
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function RequestsPage() {
  const qc = useQueryClient();
  const fetchIncoming = useServerFn(listIncomingRequests);
  const fetchConnections = useServerFn(listConnections);
  const respond = useServerFn(respondToConnection);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: incoming, isLoading: iL } = useQuery({
    queryKey: ["incoming-requests"],
    queryFn: () => fetchIncoming(),
  });
  const { data: connections, isLoading: cL } = useQuery({
    queryKey: ["connections"],
    queryFn: () => fetchConnections(),
  });

  const act = async (id: string, action: "accept" | "decline") => {
    setBusyId(id);
    try {
      await respond({ data: { connectionId: id, action } });
      qc.invalidateQueries({ queryKey: ["incoming-requests"] });
      qc.invalidateQueries({ queryKey: ["connections"] });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <main className="min-h-screen bg-background pb-24">
      <header className="max-w-md mx-auto px-6 pt-8">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.24em] text-muted-foreground font-semibold">
          <Link to="/dashboard" className="hover:text-ink">← Back</Link>
          <span>Vol. 01 — People</span>
        </div>
        <div className="mt-4 border-b border-ink/80 pb-4">
          <p className="text-[11px] uppercase tracking-[0.2em] text-brand-orange font-semibold">
            Your
          </p>
          <h1 className="display text-[2.4rem] leading-[0.95] text-ink mt-1">
            Requests<span className="text-brand-orange">.</span>
          </h1>
        </div>
      </header>

      <section className="max-w-md mx-auto px-6 pt-6">
        <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold mb-3">
          Incoming
        </p>
        {iL ? (
          <p className="text-sm text-muted-foreground py-4">Loading…</p>
        ) : incoming && incoming.length > 0 ? (
          <ul className="space-y-3">
            {incoming.map((r) => (
              <li
                key={r.id}
                className="rounded-3xl border border-border bg-paper p-4 flex items-center gap-3"
              >
                {r.from.avatar_url ? (
                  <Link
                    to="/user/$userId"
                    params={{ userId: r.from.id }}
                    className="shrink-0"
                  >
                    <img
                      src={r.from.avatar_url}
                      alt={r.from.display_name}
                      className="h-11 w-11 rounded-full object-cover border border-border"
                    />
                  </Link>
                ) : (
                  <Link
                    to="/user/$userId"
                    params={{ userId: r.from.id }}
                    className="h-11 w-11 rounded-full bg-secondary flex items-center justify-center font-semibold text-sm shrink-0"
                  >
                    {initials(r.from.display_name)}
                  </Link>
                )}
                <div className="flex-1 min-w-0">
                  <Link
                    to="/user/$userId"
                    params={{ userId: r.from.id }}
                    className="font-semibold text-ink truncate block"
                  >
                    {r.from.display_name || "Someone"}
                  </Link>
                  <p className="text-xs text-muted-foreground truncate">
                    {r.from.neighbourhood || "—"}
                    {r.from.trust_score != null && ` · Trust ${r.from.trust_score}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => act(r.id, "decline")}
                    disabled={busyId === r.id}
                    className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-ink disabled:opacity-50"
                  >
                    Decline
                  </button>
                  <button
                    onClick={() => act(r.id, "accept")}
                    disabled={busyId === r.id}
                    className="rounded-full bg-primary text-background px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                  >
                    Accept
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground py-4">
            No new requests. Explore members from Home.
          </p>
        )}
      </section>

      <section className="max-w-md mx-auto px-6 pt-8">
        <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold mb-3">
          Your connections
        </p>
        {cL ? (
          <p className="text-sm text-muted-foreground py-4">Loading…</p>
        ) : connections && connections.length > 0 ? (
          <ul className="divide-y divide-border border-t border-b border-border">
            {connections.map((c) => (
              <li key={c.id}>
                <Link
                  to="/user/$userId"
                  params={{ userId: c.other.id }}
                  className="flex items-center gap-3 py-3"
                >
                  {c.other.avatar_url ? (
                    <img
                      src={c.other.avatar_url}
                      alt={c.other.display_name}
                      className="h-10 w-10 rounded-full object-cover shrink-0 border border-border"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center font-semibold text-xs shrink-0">
                      {initials(c.other.display_name)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink truncate">
                      {c.other.display_name || "Someone"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {c.other.neighbourhood || "—"}
                      {c.other.trust_score != null && ` · Trust ${c.other.trust_score}`}
                    </p>
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.22em] text-primary font-semibold">
                    Connected
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground py-4">
            No connections yet. Send a request from someone's profile.
          </p>
        )}
      </section>
    </main>
  );
}