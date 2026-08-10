import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getUserProfile } from "@/lib/profile.functions";
import { getOrCreateConversation } from "@/lib/chat.functions";
import {
  getConnectionState,
  sendConnectionRequest,
  respondToConnection,
  cancelConnectionRequest,
} from "@/lib/connections.functions";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { SafetyMenu } from "@/components/safety-menu";
import { GovIdViewer } from "@/components/gov-id-viewer";
import { getMyProfile } from "@/lib/profile.functions";

export const Route = createFileRoute("/_authenticated/user/$userId")({
  head: () => ({
    meta: [
      { title: "Profile · Bondoo" },
      { name: "description", content: "View a Bondoo member's profile and trust score." },
    ],
  }),
  component: UserProfilePage,
});

function Row({ label, ok, note }: { label: string; ok: boolean; note?: string }) {
  return (
    <li className="flex items-center justify-between py-3 border-b border-border last:border-0">
      <div className="min-w-0">
        <p className="text-ink text-sm">{label}</p>
        {note && <p className="text-[11px] text-muted-foreground">{note}</p>}
      </div>
      <span
        className={`text-[10px] uppercase tracking-[0.22em] font-semibold ${
          ok ? "text-primary" : "text-muted-foreground"
        }`}
      >
        {ok ? "Verified" : "Pending"}
      </span>
    </li>
  );
}

function MobileRow({ ok }: { ok: boolean }) {
  return (
    <li className="py-3.5 border-b border-border last:border-0">
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-ink text-sm font-medium">Mobile Number</p>
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400 border border-amber-500/20">
              🔒 Blurred for security
            </span>
          </div>
          {ok ? (
            <div className="mt-1.5 flex items-center gap-2">
              <span
                aria-hidden="true"
                className="select-none blur-[5px] pointer-events-none font-mono text-xs text-muted-foreground/80 bg-surface px-2 py-0.5 rounded border border-border/60"
              >
                +91 ••••• •••89
              </span>
              <span className="text-[11px] text-muted-foreground">
                (Hidden for privacy)
              </span>
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Not verified yet
            </p>
          )}
        </div>
        <span
          className={`text-[10px] uppercase tracking-[0.22em] font-semibold shrink-0 ml-3 ${
            ok ? "text-primary" : "text-muted-foreground"
          }`}
        >
          {ok ? "Verified" : "Pending"}
        </span>
      </div>
    </li>
  );
}

function UserProfilePage() {
  const { userId } = useParams({ from: "/_authenticated/user/$userId" });
  const fetchUser = useServerFn(getUserProfile);
  const openConvo = useServerFn(getOrCreateConversation);
  const fetchState = useServerFn(getConnectionState);
  const sendReq = useServerFn(sendConnectionRequest);
  const respond = useServerFn(respondToConnection);
  const cancelReq = useServerFn(cancelConnectionRequest);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [opening, setOpening] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showId, setShowId] = useState(false);
  const fetchMe = useServerFn(getMyProfile);
  const { data: me } = useQuery({ queryKey: ["me-min"], queryFn: () => fetchMe() });

  const { data, isLoading, error } = useQuery({
    queryKey: ["user-profile", userId],
    queryFn: () => fetchUser({ data: { userId } }),
  });

  const { data: conn, refetch: refetchConn } = useQuery({
    queryKey: ["connection-state", userId],
    queryFn: () => fetchState({ data: { otherUserId: userId } }),
  });

  const refreshAll = async () => {
    await refetchConn();
    qc.invalidateQueries({ queryKey: ["incoming-requests"] });
    qc.invalidateQueries({ queryKey: ["connections"] });
  };

  const onConnect = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await sendReq({ data: { recipientId: userId } });
      await refreshAll();
    } finally {
      setBusy(false);
    }
  };
  const onAccept = async () => {
    if (busy || !conn || conn.status !== "incoming_pending") return;
    setBusy(true);
    try {
      await respond({ data: { connectionId: conn.id, action: "accept" } });
      await refreshAll();
    } finally {
      setBusy(false);
    }
  };
  const onDecline = async () => {
    if (busy || !conn || conn.status !== "incoming_pending") return;
    setBusy(true);
    try {
      await respond({ data: { connectionId: conn.id, action: "decline" } });
      await refreshAll();
    } finally {
      setBusy(false);
    }
  };
  const onCancel = async () => {
    if (busy || !conn || conn.status !== "outgoing_pending") return;
    setBusy(true);
    try {
      await cancelReq({ data: { connectionId: conn.id } });
      await refreshAll();
    } finally {
      setBusy(false);
    }
  };

  const startChat = async () => {
    if (opening) return;
    setChatError(null);
    setOpening(true);
    try {
      const { id } = await openConvo({ data: { otherUserId: userId } });
      await navigate({ to: "/messages/$conversationId", params: { conversationId: id } });
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "Chat could not be opened. Please try again.");
    } finally {
      setOpening(false);
    }
  };

  if (isLoading) {
    return (
      <main className="min-h-screen bg-background">
        <p className="text-sm text-muted-foreground text-center py-20">Loading…</p>
      </main>
    );
  }
  if (error || !data) {
    return (
      <main className="min-h-screen bg-background">
        <div className="max-w-md mx-auto px-6 py-10">
          <Link
            to="/dashboard"
            className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold"
          >
            ← Back
          </Link>
          <p className="mt-10 text-center text-ink">Profile unavailable.</p>
        </div>
      </main>
    );
  }

  const initials =
    (data.display_name || "?")
      .split(" ")
      .map((s) => s[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?";

  const score = data.trust_score ?? 0;

  return (
    <main className="min-h-screen bg-background pb-24">
      <header className="border-b border-border">
        <div className="max-w-md mx-auto px-6 py-4 flex items-center justify-between">
          <Link
            to="/dashboard"
            className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold hover:text-ink"
          >
            ← Back
          </Link>
          <SafetyMenu
            userId={userId}
            displayName={data.display_name || "this member"}
            context="profile"
          />
        </div>
      </header>

      <section className="max-w-md mx-auto px-6 pt-8">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-full bg-secondary overflow-hidden flex items-center justify-center font-semibold text-ink border border-border">
            {(data as { avatar_url?: string | null }).avatar_url ? (
              <img
                src={(data as { avatar_url?: string | null }).avatar_url ?? ""}
                alt={`${data.display_name || "Member"}'s profile photo`}
                className="h-full w-full object-cover"
              />
            ) : (
              initials
            )}
          </div>
          <div className="min-w-0">
            <h1 className="display text-2xl text-ink leading-tight truncate">
              {data.display_name || "Someone"}
            </h1>
            <p className="text-sm text-muted-foreground truncate">
              {[data.pronouns, data.neighbourhood].filter(Boolean).join(" · ") || "Bondoo member"}
            </p>
          </div>
        </div>
        {data.bio && (
          <p className="mt-5 text-[15px] leading-relaxed text-ink/85">{data.bio}</p>
        )}
      </section>

      {/* Trust score */}
      <section className="max-w-md mx-auto px-6 mt-8">
        <div className="rounded-3xl border border-border bg-paper p-5">
          <div className="flex items-baseline justify-between">
            <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
              Trust Score
            </p>
            <p className="display text-3xl text-ink">
              {score}
              <span className="text-base text-muted-foreground">/100</span>
            </p>
          </div>
          <div className="mt-3 h-2 rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full bg-primary"
              style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
            />
          </div>
          <p className="mt-3 text-[12px] text-muted-foreground leading-snug">
            Score reflects verifications, community reviews, and meets attended.
          </p>
        </div>
      </section>

      {/* Verifications */}
      <section className="max-w-md mx-auto px-6 mt-6">
        <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold mb-2">
          Verifications
        </p>
        <ul className="rounded-3xl border border-border bg-paper px-5">
          <MobileRow ok={data.phone_verified} />
          <Row label="Government ID" ok={data.gov_id_verified} />
          {conn?.status === "connected" && data.gov_id_verified && (
            <li className="py-3 border-b border-border last:border-0">
              <button
                onClick={() => setShowId(true)}
                className="w-full rounded-xl bg-secondary text-ink text-xs font-semibold py-2.5"
              >
                👁 View ID (secure, 60s)
              </button>
              <p className="mt-1 text-[10px] text-muted-foreground text-center">
                View-only. No downloads. Every view is logged.
              </p>
            </li>
          )}
          <Row label="Selfie match" ok={data.selfie_verified} />
          <Row
            label="Background check"
            ok={data.background_check_status === "approved"}
            note={
              data.background_check_status !== "approved"
                ? data.background_check_status
                : undefined
            }
          />
        </ul>
      </section>

      {/* Community */}
      <section className="max-w-md mx-auto px-6 mt-6">
        <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold mb-2">
          Community
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-3xl border border-border bg-paper p-4">
            <p className="display text-2xl text-ink">{data.attended_meets_count}</p>
            <p className="text-[11px] text-muted-foreground uppercase tracking-[0.18em] mt-1">
              Meets attended
            </p>
          </div>
          <div className="rounded-3xl border border-border bg-paper p-4">
            <p className="display text-2xl text-ink">{data.community_reviews_count}</p>
            <p className="text-[11px] text-muted-foreground uppercase tracking-[0.18em] mt-1">
              Reviews
            </p>
          </div>
        </div>
      </section>

      {/* Actions */}
      <section className="max-w-md mx-auto px-6 mt-8">
        <ConnectionActions
          state={conn}
          busy={busy}
          onConnect={onConnect}
          onAccept={onAccept}
          onDecline={onDecline}
          onCancel={onCancel}
          name={data.display_name || "them"}
        />
        <button
          onClick={startChat}
          disabled={opening}
          className="mt-3 w-full rounded-2xl border border-ink text-ink font-semibold py-3.5 disabled:opacity-50"
        >
          {opening ? "Opening…" : "Message"}
        </button>
        {chatError && (
          <p role="alert" className="mt-3 rounded-xl bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
            {chatError}
          </p>
        )}
        <p className="mt-3 text-center text-[11px] text-muted-foreground">
          Bondoo is not a dating app. Meet in public.
        </p>
      </section>
      <GovIdViewer
        targetUserId={userId}
        targetName={data.display_name || "Member"}
        viewerName={me?.display_name || "Bondoo user"}
        open={showId}
        onClose={() => setShowId(false)}
      />
    </main>
  );
}

function ConnectionActions({
  state,
  busy,
  onConnect,
  onAccept,
  onDecline,
  onCancel,
  name,
}: {
  state: Awaited<ReturnType<typeof getConnectionState>> | undefined;
  busy: boolean;
  onConnect: () => void;
  onAccept: () => void;
  onDecline: () => void;
  onCancel: () => void;
  name: string;
}) {
  if (!state) {
    return (
      <button
        disabled
        className="w-full rounded-2xl bg-secondary text-muted-foreground font-semibold py-3.5"
      >
        Loading…
      </button>
    );
  }
  if (state.status === "connected") {
    return (
      <div className="w-full rounded-2xl bg-primary/10 border border-primary/40 text-primary text-center font-semibold py-3.5">
        ✓ Connected with {name}
      </div>
    );
  }
  if (state.status === "outgoing_pending") {
    return (
      <button
        onClick={onCancel}
        disabled={busy}
        className="w-full rounded-2xl border border-border text-ink font-semibold py-3.5 disabled:opacity-50"
      >
        {busy ? "…" : "Request sent · Cancel"}
      </button>
    );
  }
  if (state.status === "incoming_pending") {
    return (
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={onDecline}
          disabled={busy}
          className="rounded-2xl border border-border text-ink font-semibold py-3.5 disabled:opacity-50"
        >
          Decline
        </button>
        <button
          onClick={onAccept}
          disabled={busy}
          className="rounded-2xl bg-primary text-background font-semibold py-3.5 disabled:opacity-50"
        >
          Accept
        </button>
      </div>
    );
  }
  if (state.status === "declined") {
    return (
      <button
        onClick={onConnect}
        disabled={busy}
        className="w-full rounded-2xl bg-ink text-background font-semibold py-3.5 disabled:opacity-50"
      >
        {busy ? "…" : "Send request again"}
      </button>
    );
  }
  return (
    <button
      onClick={onConnect}
      disabled={busy}
      className="w-full rounded-2xl bg-brand-orange text-background font-semibold py-3.5 disabled:opacity-50"
    >
      {busy ? "Sending…" : `+ Connect with ${name.split(" ")[0]}`}
    </button>
  );
}