import { createFileRoute, Link, useParams, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  getMeetup,
  respondMeetup,
  requestReschedule,
  respondReschedule,
  listMeetupAcknowledgements,
  acknowledgeMeetupSafety,
} from "@/lib/meetups.functions";
import { MapPreview } from "@/components/map-preview";

export const Route = createFileRoute("/_authenticated/meetup/$meetupId")({
  head: () => ({
    meta: [
      { title: "Meetup details · Bondoo" },
      { name: "description", content: "Confirmed place, time, and notes for your meetup." },
    ],
  }),
  component: MeetupDetailsPage,
});

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  pending: { label: "Pending", tone: "bg-brand-orange/15 text-brand-orange" },
  confirmed: { label: "Confirmed", tone: "bg-primary/15 text-primary" },
  declined: { label: "Declined", tone: "bg-muted text-muted-foreground" },
  cancelled: { label: "Cancelled", tone: "bg-muted text-muted-foreground" },
  reschedule_pending: {
    label: "Reschedule pending",
    tone: "bg-brand-orange/15 text-brand-orange",
  },
};

function MeetupDetailsPage() {
  const { meetupId } = useParams({ from: "/_authenticated/meetup/$meetupId" });
  const fetchMeetup = useServerFn(getMeetup);
  const respond = useServerFn(respondMeetup);
  const reqReschedule = useServerFn(requestReschedule);
  const respReschedule = useServerFn(respondReschedule);
  const fetchAcks = useServerFn(listMeetupAcknowledgements);
  const ackFn = useServerFn(acknowledgeMeetupSafety);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showReschedule, setShowReschedule] = useState(false);
  const [rPlace, setRPlace] = useState("");
  const [rAddress, setRAddress] = useState("");
  const [rWhen, setRWhen] = useState("");
  const [rNote, setRNote] = useState("");
  const [rBusy, setRBusy] = useState(false);
  const [rErr, setRErr] = useState<string | null>(null);
  const [showSafety, setShowSafety] = useState(false);
  const [safetyBusy, setSafetyBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["meetup", meetupId],
    queryFn: () => fetchMeetup({ data: { meetupId } }),
  });

  const { data: acks } = useQuery({
    queryKey: ["meetup-acks", meetupId],
    queryFn: () => fetchAcks({ data: { meetupId } }),
    enabled: !!data && (data.meetup.status === "confirmed" || data.meetup.status === "reschedule_pending"),
  });

  const meAcked = !!acks?.some((a) => a.user_id === data?.me);
  const otherAcked = !!acks?.some((a) => a.user_id && a.user_id !== data?.me);
  const shouldPromptSafety =
    !!data &&
    (data.meetup.status === "confirmed" || data.meetup.status === "reschedule_pending") &&
    acks !== undefined &&
    !meAcked;

  useEffect(() => {
    if (shouldPromptSafety) setShowSafety(true);
  }, [shouldPromptSafety]);

  const handleAcknowledge = async () => {
    if (safetyBusy) return;
    setSafetyBusy(true);
    try {
      await ackFn({ data: { meetupId } });
      await qc.invalidateQueries({ queryKey: ["meetup-acks", meetupId] });
      setShowSafety(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save acknowledgement");
    } finally {
      setSafetyBusy(false);
    }
  };

  const handle = async (action: "confirm" | "decline" | "cancel") => {
    if (!data) return;
    setBusy(action);
    setErr(null);
    try {
      await respond({ data: { meetupId, action } });
      qc.invalidateQueries({ queryKey: ["meetup", meetupId] });
      qc.invalidateQueries({ queryKey: ["meetups", data.meetup.conversation_id] });
      qc.invalidateQueries({ queryKey: ["conversation", data.meetup.conversation_id] });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not update");
    } finally {
      setBusy(null);
    }
  };

  const handleRescheduleResponse = async (action: "accept" | "decline" | "cancel") => {
    if (!data) return;
    setBusy("r-" + action);
    setErr(null);
    try {
      await respReschedule({ data: { meetupId, action } });
      qc.invalidateQueries({ queryKey: ["meetup", meetupId] });
      qc.invalidateQueries({ queryKey: ["meetups", data.meetup.conversation_id] });
      qc.invalidateQueries({ queryKey: ["conversation", data.meetup.conversation_id] });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not update");
    } finally {
      setBusy(null);
    }
  };

  const submitReschedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rBusy) return;
    setRErr(null);
    setRBusy(true);
    try {
      await reqReschedule({
        data: {
          meetupId,
          place: rPlace,
          address: rAddress,
          scheduledAt: new Date(rWhen).toISOString(),
          note: rNote,
        },
      });
      setShowReschedule(false);
      setRPlace("");
      setRAddress("");
      setRWhen("");
      setRNote("");
      qc.invalidateQueries({ queryKey: ["meetup", meetupId] });
      if (data)
        qc.invalidateQueries({ queryKey: ["meetups", data.meetup.conversation_id] });
    } catch (e) {
      setRErr(e instanceof Error ? e.message : "Could not request reschedule");
    } finally {
      setRBusy(false);
    }
  };

  if (isLoading || !data) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </main>
    );
  }

  const { meetup, proposer, recipient, me } = data;
  const other = me === meetup.proposer_id ? recipient : proposer;
  const iAmProposer = me === meetup.proposer_id;
  const status = STATUS_LABEL[meetup.status] ?? STATUS_LABEL.pending;
  const when = new Date(meetup.scheduled_at);
  const mapsQuery = encodeURIComponent(
    [meetup.place, meetup.address].filter(Boolean).join(", "),
  );
  const isRescheduling = meetup.status === "reschedule_pending";
  const iAmRequester = isRescheduling && meetup.reschedule_by === me;
  const rWhenDate = meetup.reschedule_scheduled_at
    ? new Date(meetup.reschedule_scheduled_at)
    : null;

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-md mx-auto px-6 py-4 flex items-center gap-3">
          <button
            onClick={() => navigate({ to: "/messages/$conversationId", params: { conversationId: meetup.conversation_id } })}
            className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold hover:text-ink"
          >
            ← Chat
          </button>
          <p className="flex-1 text-center text-[10px] uppercase tracking-[0.22em] font-semibold text-brand-orange">
            Meetup №{meetup.id.slice(0, 4).toUpperCase()}
          </p>
          <span className="w-14" />
        </div>
      </header>

      <div className="max-w-md mx-auto px-6 py-8">
        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-[0.22em] font-semibold text-muted-foreground">
            {iAmProposer ? "You proposed" : `${proposer?.display_name || "They"} proposed`}
          </p>
          <span className={`text-[10px] uppercase tracking-[0.18em] font-semibold px-2 py-0.5 rounded-full ${status.tone}`}>
            {status.label}
          </span>
        </div>

        <h1 className="display text-4xl text-ink mt-3 leading-[1.05]">
          {meetup.place}
        </h1>

        {meetup.address && (
          <p className="text-sm text-muted-foreground mt-2">{meetup.address}</p>
        )}

        <MapPreview place={meetup.place} address={meetup.address} className="mt-6" />

        <div className="mt-8 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-border bg-paper p-4">
            <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Date</p>
            <p className="display text-lg text-ink mt-1 leading-tight">
              {when.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-paper p-4">
            <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Time</p>
            <p className="display text-lg text-ink mt-1 leading-tight">
              {when.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </p>
          </div>
        </div>

        {meetup.note && (
          <div className="mt-4 rounded-2xl border border-border bg-paper p-4">
            <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Note</p>
            <p className="text-sm text-ink mt-2 whitespace-pre-wrap">{meetup.note}</p>
          </div>
        )}

        <div className="mt-6">
          <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
            With
          </p>
          {other?.id ? (
            <Link
              to="/user/$userId"
              params={{ userId: other.id }}
              className="mt-2 flex items-center gap-3 rounded-2xl border border-border bg-paper p-3 hover:bg-surface"
            >
              <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center font-semibold text-xs">
                {(other.display_name || "?")
                  .split(" ")
                  .map((s) => s[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink truncate">{other.display_name || "Someone"}</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {other.neighbourhood || ""}
                  {other.trust_score != null && ` · Trust ${other.trust_score}`}
                </p>
              </div>
              <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">View</span>
            </Link>
          ) : null}
        </div>

        <a
          href={`https://www.google.com/maps/search/?api=1&query=${mapsQuery}`}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-4 block w-full text-center rounded-2xl border border-border bg-background text-ink font-semibold py-3 text-sm hover:bg-paper"
        >
          Open in Maps ↗
        </a>

        {err && <p className="mt-4 text-xs text-brand-orange">{err}</p>}

        {isRescheduling && meetup.reschedule_place && (
          <div className="mt-6 rounded-2xl border-2 border-brand-orange/40 bg-brand-orange/5 p-4">
            <p className="text-[10px] uppercase tracking-[0.22em] font-semibold text-brand-orange">
              {iAmRequester ? "You proposed changes" : `${other?.display_name || "They"} proposed changes`}
            </p>
            <p className="display text-xl text-ink mt-1 leading-tight">
              {meetup.reschedule_place}
            </p>
            {rWhenDate && (
              <p className="text-xs text-muted-foreground mt-1">
                {rWhenDate.toLocaleString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
                {meetup.reschedule_address ? ` · ${meetup.reschedule_address}` : ""}
              </p>
            )}
            {meetup.reschedule_note && (
              <p className="text-sm text-ink/80 mt-2">{meetup.reschedule_note}</p>
            )}
            <div className="mt-4 flex gap-2">
              {iAmRequester ? (
                <button
                  disabled={!!busy}
                  onClick={() => handleRescheduleResponse("cancel")}
                  className="flex-1 rounded-2xl border border-border bg-background text-ink font-semibold py-2.5 text-sm disabled:opacity-40"
                >
                  Cancel request
                </button>
              ) : (
                <>
                  <button
                    disabled={!!busy}
                    onClick={() => handleRescheduleResponse("accept")}
                    className="flex-1 rounded-2xl bg-ink text-background font-semibold py-2.5 text-sm disabled:opacity-40"
                  >
                    Accept changes
                  </button>
                  <button
                    disabled={!!busy}
                    onClick={() => handleRescheduleResponse("decline")}
                    className="flex-1 rounded-2xl border border-border bg-background text-ink font-semibold py-2.5 text-sm disabled:opacity-40"
                  >
                    Keep original
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {meetup.status === "pending" && (
          <div className="mt-6 flex gap-2">
            {iAmProposer ? (
              <button
                disabled={!!busy}
                onClick={() => handle("cancel")}
                className="flex-1 rounded-2xl border border-border bg-background text-ink font-semibold py-3 text-sm disabled:opacity-40"
              >
                Cancel proposal
              </button>
            ) : (
              <>
                <button
                  disabled={!!busy}
                  onClick={() => handle("confirm")}
                  className="flex-1 rounded-2xl bg-ink text-background font-semibold py-3 text-sm disabled:opacity-40"
                >
                  Confirm
                </button>
                <button
                  disabled={!!busy}
                  onClick={() => handle("decline")}
                  className="flex-1 rounded-2xl border border-border bg-background text-ink font-semibold py-3 text-sm disabled:opacity-40"
                >
                  Decline
                </button>
              </>
            )}
          </div>
        )}

        {meetup.status === "confirmed" && (
          <button
            onClick={() => setShowReschedule(true)}
            className="mt-4 w-full text-center rounded-2xl border border-border bg-background text-ink font-semibold py-3 text-sm hover:bg-paper"
          >
            🔁 Propose reschedule
          </button>
        )}

        {meetup.status === "confirmed" &&
          new Date(meetup.scheduled_at).getTime() < Date.now() && (
            <button
              onClick={() =>
                navigate({ to: "/review/$meetupId", params: { meetupId: meetup.id } })
              }
              className="mt-3 w-full text-center rounded-2xl bg-brand-orange text-ink font-semibold py-3 text-sm"
            >
              ⭐ Rate this meetup
            </button>
          )}

        <div className="mt-10 rounded-2xl bg-paper border border-border p-4">
          <p className="text-[10px] uppercase tracking-[0.22em] text-brand-orange font-semibold">
            Safety reminder
          </p>
          <p className="text-xs text-ink/80 mt-2 leading-relaxed">
            Meet in a public place. Tell a friend where you're going. Trust your instincts — leave if anything feels off.
          </p>
          {(data.meetup.status === "confirmed" || data.meetup.status === "reschedule_pending") && (
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
              <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
                {meAcked && otherAcked
                  ? "Both acknowledged ✓"
                  : meAcked
                    ? "You acknowledged · waiting on them"
                    : otherAcked
                      ? "They acknowledged · your turn"
                      : "Not yet acknowledged"}
              </p>
              {!meAcked && (
                <button
                  onClick={() => setShowSafety(true)}
                  className="text-[10px] uppercase tracking-[0.22em] font-semibold text-primary hover:text-ink"
                >
                  Review →
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {showSafety && data && (
        <div
          className="fixed inset-0 z-40 bg-ink/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={() => meAcked && setShowSafety(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-background rounded-3xl p-7 shadow-2xl border border-border"
          >
            <p className="text-center text-[11px] uppercase tracking-[0.22em] text-brand-orange font-semibold">
              Before you meet
            </p>
            <h2 className="display text-2xl text-ink text-center mt-2 leading-tight">
              Safety <em className="text-primary not-italic">guidelines</em>
            </h2>
            <ul className="mt-5 space-y-3 text-sm text-ink/85">
              <li className="flex gap-3">
                <span className="text-brand-orange font-semibold">01</span>
                <span>Meet in a busy, public place — cafés, parks, libraries. Never a private home for a first meet.</span>
              </li>
              <li className="flex gap-3">
                <span className="text-brand-orange font-semibold">02</span>
                <span>Tell a friend or family member where you're going and when to expect you back.</span>
              </li>
              <li className="flex gap-3">
                <span className="text-brand-orange font-semibold">03</span>
                <span>Arrange your own transport both ways. Keep your phone charged.</span>
              </li>
              <li className="flex gap-3">
                <span className="text-brand-orange font-semibold">04</span>
                <span>Trust your instincts. Leave if anything feels off — no explanation needed.</span>
              </li>
              <li className="flex gap-3">
                <span className="text-brand-orange font-semibold">05</span>
                <span>Report unsafe behaviour from the chat or profile menu. Bondoo takes reports seriously.</span>
              </li>
            </ul>
            {err && <p className="mt-3 text-xs text-brand-orange">{err}</p>}
            <div className="mt-6 flex gap-2">
              {meAcked ? (
                <button
                  onClick={() => setShowSafety(false)}
                  className="flex-1 rounded-2xl border border-border bg-background text-ink font-semibold py-3 text-sm"
                >
                  Close
                </button>
              ) : (
                <button
                  disabled={safetyBusy}
                  onClick={handleAcknowledge}
                  className="flex-1 rounded-2xl bg-ink text-background font-semibold py-3 text-sm disabled:opacity-40"
                >
                  {safetyBusy ? "Saving…" : "I've read & agree"}
                </button>
              )}
            </div>
            {!meAcked && (
              <p className="mt-3 text-center text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
                Your acknowledgement is shared with the other person
              </p>
            )}
          </div>
        </div>
      )}

      {showReschedule && (
        <div
          className="fixed inset-0 z-30 bg-ink/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={() => setShowReschedule(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={submitReschedule}
            className="w-full max-w-md bg-background rounded-3xl p-7 shadow-2xl border border-border"
          >
            <p className="text-center text-[11px] uppercase tracking-[0.22em] text-brand-orange font-semibold">
              Propose reschedule
            </p>
            <h2 className="display text-2xl text-ink text-center mt-2 leading-tight">
              New <em className="text-primary not-italic">where & when</em>
            </h2>
            <div className="mt-5 space-y-3">
              <div>
                <label className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
                  Place *
                </label>
                <input
                  required
                  value={rPlace}
                  onChange={(e) => setRPlace(e.target.value)}
                  placeholder={meetup.place}
                  className="mt-1 w-full rounded-2xl border border-border bg-paper px-4 py-2.5 text-ink outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
                  Address / area
                </label>
                <input
                  value={rAddress}
                  onChange={(e) => setRAddress(e.target.value)}
                  placeholder={meetup.address ?? ""}
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
                  value={rWhen}
                  onChange={(e) => setRWhen(e.target.value)}
                  className="mt-1 w-full rounded-2xl border border-border bg-paper px-4 py-2.5 text-ink outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
                  Note (optional)
                </label>
                <textarea
                  value={rNote}
                  onChange={(e) => setRNote(e.target.value)}
                  rows={3}
                  placeholder="Why the change?"
                  className="mt-1 w-full rounded-2xl border border-border bg-paper px-4 py-2.5 text-ink outline-none focus:border-primary resize-none"
                />
              </div>
            </div>
            {rErr && <p className="text-xs text-brand-orange mt-3">{rErr}</p>}
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setShowReschedule(false)}
                className="flex-1 rounded-2xl border border-border bg-background text-ink font-semibold py-3 text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={rBusy}
                className="flex-1 rounded-2xl bg-ink text-background font-semibold py-3 text-sm disabled:opacity-40"
              >
                {rBusy ? "Sending…" : "Send request"}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
