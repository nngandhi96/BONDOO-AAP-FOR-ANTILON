import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BondooEyes } from "@/components/bondoo-logo";
import { getMyProfile } from "@/lib/profile.functions";
import {
  listActivities,
  createActivity,
  type ActivityRow,
} from "@/lib/activities.functions";
import { getOrCreateConversation } from "@/lib/chat.functions";
import { NotificationsBell } from "@/components/notifications-bell";
import { listMeetupsAwaitingMyReview } from "@/lib/reviews.functions";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Nearby activities · Bondoo" },
      {
        name: "description",
        content:
          "Discover walks, coffee, and reading circles happening near you.",
      },
    ],
  }),
  component: Dashboard,
});

const CATEGORIES = [
  "All",
  "Coffee & Chat",
  "Walk",
  "Study",
  "Sports",
  "Food",
] as const;

type Category = Exclude<(typeof CATEGORIES)[number], "All">;

const CATEGORY_META: Record<Category, { emoji: string; label: string }> = {
  "Coffee & Chat": { emoji: "☕", label: "Coffee & Chat" },
  Walk: { emoji: "🌳", label: "Morning / Evening Walk" },
  Study: { emoji: "📖", label: "Study / Library Session" },
  Sports: { emoji: "🏸", label: "Sports" },
  Food: { emoji: "🍜", label: "Food" },
};

function formatWhen(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (sameDay) return `Today · ${time}`;
  if (isTomorrow) return `Tomorrow · ${time}`;
  return `${d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })} · ${time}`;
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function Dashboard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [view, setView] = useState<"list" | "map">("list");
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]>("All");
  const [selected, setSelected] = useState<ActivityRow | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftWhen, setDraftWhen] = useState("");
  const [draftLocation, setDraftLocation] = useState("");
  const [draftCat, setDraftCat] = useState<Category>("Coffee & Chat");
  const [opening, setOpening] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [myLoc, setMyLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [locBusy, setLocBusy] = useState(false);
  const [nearMe, setNearMe] = useState(false);

  const fetchProfile = useServerFn(getMyProfile);
  const fetchActivities = useServerFn(listActivities);
  const postActivity = useServerFn(createActivity);
  const openConvo = useServerFn(getOrCreateConversation);
  const fetchPending = useServerFn(listMeetupsAwaitingMyReview);

  const { data: profile } = useQuery({
    queryKey: ["profile", "me"],
    queryFn: () => fetchProfile(),
  });
  useEffect(() => {
    if (profile && !profile.onboarded_at) {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [profile, navigate]);

  const { data: activities = [], isLoading } = useQuery({
    queryKey: ["activities"],
    queryFn: () => fetchActivities(),
  });

  const { data: pendingReviews = [] } = useQuery({
    queryKey: ["reviews", "pending"],
    queryFn: () => fetchPending(),
  });

  useEffect(() => {
    if (profile?.home_lat != null && profile?.home_lng != null) {
      setMyLoc({ lat: profile.home_lat, lng: profile.home_lng });
    }
  }, [profile]);

  function requestLocation() {
    if (!("geolocation" in navigator) || locBusy) return;
    setLocBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setMyLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setNearMe(true);
        setLocBusy(false);
      },
      () => setLocBusy(false),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 },
    );
  }

  const myInterests = useMemo(
    () => new Set(((profile?.interests ?? []) as string[]).map((s) => s.toLowerCase())),
    [profile],
  );

  const filtered = useMemo(
    () => {
      const base = cat === "All" ? activities : activities.filter((a) => a.category === cat);
      const withDist = base.map((a) => {
        let distKm: number | null = null;
        if (myLoc && a.location_lat != null && a.location_lng != null) {
          distKm = haversine(myLoc.lat, myLoc.lng, a.location_lat, a.location_lng);
        }
        const isMatch = myInterests.has(a.category.toLowerCase());
        return { ...a, __distKm: distKm, __match: isMatch };
      });
      if (nearMe && myLoc) {
        withDist.sort((a, b) => {
          const da = a.__distKm ?? Number.POSITIVE_INFINITY;
          const db = b.__distKm ?? Number.POSITIVE_INFINITY;
          return da - db;
        });
      } else if (myInterests.size > 0) {
        withDist.sort((a, b) => Number(b.__match) - Number(a.__match));
      }
      return withDist;
    },
    [activities, cat, myLoc, nearMe, myInterests],
  );

  const createMut = useMutation({
    mutationFn: (input: {
      title: string;
      category: Category;
      starts_at: string;
      location_name?: string;
    }) => postActivity({ data: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["activities"] });
      setDraftTitle("");
      setDraftWhen("");
      setDraftLocation("");
      setDraftCat("Coffee & Chat");
      setShowCreate(false);
      setCat("All");
    },
  });

  function handleCreate() {
    if (!draftTitle.trim() || !draftWhen) return;
    createMut.mutate({
      title: draftTitle.trim(),
      category: draftCat,
      starts_at: new Date(draftWhen).toISOString(),
      location_name: draftLocation.trim() || undefined,
    });
  }

  async function messageHost(hostId: string) {
    if (opening) return;
    setChatError(null);
    setOpening(true);
    try {
      const { id } = await openConvo({ data: { otherUserId: hostId } });
      await navigate({ to: "/messages/$conversationId", params: { conversationId: id } });
      setSelected(null);
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "Chat could not be opened. Please try again.");
    } finally {
      setOpening(false);
    }
  }

  return (
    <main className="min-h-screen bg-background pb-28 relative">
      <header className="max-w-md mx-auto px-6 pt-8">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.24em] text-muted-foreground font-semibold">
          <span>{new Date().toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}</span>
          <span>Vol. 01 — Nearby</span>
        </div>
        <div className="mt-4 flex items-end justify-between border-b border-ink/80 pb-4">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.2em] text-brand-orange font-semibold">
              You are in
            </p>
            <h1 className="display text-[2.6rem] leading-[0.95] text-ink mt-1 truncate">
              {profile?.neighbourhood || "Nearby"}<span className="text-brand-orange">.</span>
            </h1>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            <NotificationsBell />
            <Link
              to="/profile"
              className="h-11 w-11 rounded-full bg-paper flex items-center justify-center border border-border"
              aria-label="Profile"
            >
              <BondooEyes className="h-4" />
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-md mx-auto px-6 pt-5">
        {pendingReviews.length > 0 && (
          <button
            onClick={() =>
              navigate({
                to: "/review/$meetupId",
                params: { meetupId: pendingReviews[0].meetup_id },
              })
            }
            className="w-full mb-4 flex items-center gap-3 rounded-2xl bg-brand-orange/12 border border-brand-orange/30 px-4 py-3 text-left"
          >
            <span className="text-xl">⭐</span>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] uppercase tracking-[0.18em] text-brand-orange font-semibold">
                Rate your meetup
              </p>
              <p className="text-xs text-ink truncate">
                How was your meet with {pendingReviews[0].other_name}?
              </p>
            </div>
            <span className="text-[11px] font-semibold text-ink">Rate →</span>
          </button>
        )}

        <div className="flex items-center justify-between">
          <div className="inline-flex rounded-full bg-surface p-1 border border-border">
            {(["list", "map"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-5 py-1.5 text-sm font-medium rounded-full transition ${
                  view === v ? "bg-ink text-background" : "text-muted-foreground"
                }`}
              >
                {v === "list" ? "List" : "Map"}
              </button>
            ))}
          </div>
          <button
            onClick={() => (myLoc ? setNearMe((v) => !v) : requestLocation())}
            className={`text-[11px] uppercase tracking-[0.18em] font-semibold px-3 py-1.5 rounded-full border transition ${
              nearMe
                ? "bg-primary text-background border-primary"
                : "bg-paper text-ink border-border"
            }`}
          >
            {locBusy ? "Locating…" : nearMe ? "📍 Near me" : "📍 Sort near me"}
          </button>
        </div>

        <div className="mt-5 flex gap-2 overflow-x-auto -mx-6 px-6 no-scrollbar">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={`shrink-0 px-4 py-2 rounded-full text-sm border transition display italic ${
                cat === c
                  ? "bg-brand-orange text-ink border-brand-orange font-semibold"
                  : "bg-paper text-ink border-border hover:bg-surface"
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="mt-5 flex items-center gap-3 rounded-2xl bg-primary/8 border border-primary/20 px-4 py-3">
          <span className="h-8 w-8 rounded-full bg-primary/15 flex items-center justify-center text-primary text-sm">
            ✓
          </span>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.18em] text-primary font-semibold">
              Meet in public
            </p>
            <p className="text-xs text-muted-foreground">
              Parks · cafés · libraries. Never share your address.
            </p>
          </div>
        </div>

        {view === "list" ? (
          isLoading ? (
            <p className="mt-10 text-center text-sm text-muted-foreground">Loading…</p>
          ) : filtered.length === 0 ? (
            <div className="mt-10 text-center">
              <p className="display text-2xl text-ink">Nothing yet</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Be the first — post an activity below.
              </p>
            </div>
          ) : (
            <ul className="mt-5 divide-y divide-border border-y border-border">
              {filtered.map((a, idx) => (
                <li key={a.id}>
                  <button
                    onClick={() => setSelected(a)}
                    className="group w-full text-left py-5 flex gap-4 items-start hover:bg-paper/60 transition -mx-2 px-2 rounded-xl"
                  >
                    <div className="shrink-0 flex flex-col items-center pt-1">
                      <span className="text-3xl">{a.emoji}</span>
                      <span className="mt-1 display italic text-[10px] text-muted-foreground">
                        №{String(idx + 1).padStart(2, "0")}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-brand-orange font-semibold">
                        {a.category} · {formatWhen(a.starts_at)}
                        {a.__match && (
                          <span className="ml-2 inline-block bg-primary/15 text-primary px-1.5 py-0.5 rounded-full normal-case tracking-normal text-[9px]">
                            for you
                          </span>
                        )}
                      </p>
                      <h3 className="display mt-1 text-[1.35rem] leading-tight text-ink group-hover:text-primary transition">
                        {a.title}
                      </h3>
                      <div className="mt-2 flex items-center gap-2 flex-wrap text-xs">
                        <span className="flex items-center gap-1.5 text-ink/80">
                          <span className="h-5 w-5 rounded-full bg-secondary flex items-center justify-center font-semibold text-[9px]">
                            {a.host_name.split(" ").map((s) => s[0]).join("").slice(0, 2)}
                          </span>
                          {a.is_mine ? "You" : a.host_name}
                        </span>
                        {a.host_trust !== null && (
                          <>
                            <span className="text-muted-foreground">·</span>
                            <span className="text-primary font-medium">
                              Trust {a.host_trust}
                            </span>
                          </>
                        )}
                        <span className="text-muted-foreground">·</span>
                        <span className="text-muted-foreground">
                          {a.spots_filled} of {a.spots_total} joined
                        </span>
                        {a.__distKm != null && (
                          <>
                            <span className="text-muted-foreground">·</span>
                            <span className="text-muted-foreground">
                              {a.__distKm < 1
                                ? `${Math.round(a.__distKm * 1000)} m`
                                : `${a.__distKm.toFixed(1)} km`}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    {a.location_name && (
                      <span className="shrink-0 display italic text-brand-orange text-sm mt-1 max-w-[6rem] truncate">
                        {a.location_name}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : (
          <div className="mt-5 rounded-3xl overflow-hidden border border-border relative h-[440px] bg-paper">
            <div
              className="absolute inset-0"
              style={{
                background:
                  "radial-gradient(ellipse at 30% 30%, oklch(0.62 0.19 254 / 0.10) 0%, transparent 55%), radial-gradient(ellipse at 70% 70%, oklch(0.76 0.17 60 / 0.14) 0%, transparent 55%)",
              }}
            />
            <svg className="absolute inset-0 h-full w-full opacity-30" viewBox="0 0 400 440" fill="none">
              <path d="M0 120 Q 100 80 200 140 T 400 130" stroke="#007AFF" strokeWidth="1.5" fill="none" />
              <path d="M0 280 Q 120 240 220 300 T 400 290" stroke="#FF9500" strokeWidth="1.5" fill="none" />
            </svg>
            {filtered.map((a, i) => (
              <button
                key={a.id}
                onClick={() => setSelected(a)}
                className="absolute h-11 w-11 rounded-full bg-paper shadow-lg flex items-center justify-center text-lg ring-2 ring-brand-orange"
                style={{ top: `${18 + (i % 5) * 15}%`, left: `${15 + (i % 2) * 55}%` }}
              >
                {a.emoji}
              </button>
            ))}
            <div className="absolute bottom-4 left-4 right-4 bg-background/95 backdrop-blur rounded-2xl px-4 py-3 border border-border">
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Showing</p>
              <p className="display text-lg text-ink leading-tight">
                {filtered.length} nearby
              </p>
            </div>
          </div>
        )}
      </div>

      <button
        onClick={() => setShowCreate(true)}
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 bg-ink text-background rounded-full pl-5 pr-6 py-4 shadow-xl shadow-ink/25 hover:bg-ink/90 active:scale-[0.98] transition font-semibold"
      >
        <span className="h-6 w-6 rounded-full bg-brand-orange text-ink flex items-center justify-center text-lg leading-none">
          +
        </span>
        <span>
          Post an <em className="display italic font-normal">activity</em>
        </span>
      </button>

      {showCreate && (
        <div
          className="fixed inset-0 z-30 bg-ink/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={() => setShowCreate(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-background rounded-3xl p-7 shadow-2xl border border-border animate-in slide-in-from-bottom duration-200"
          >
            <p className="text-center text-[11px] uppercase tracking-[0.22em] text-brand-orange font-semibold">
              New activity
            </p>
            <h2 className="display text-3xl text-ink text-center mt-2 leading-tight">
              Post an <em className="text-primary not-italic">activity</em>
            </h2>

            <div className="mt-5 space-y-4">
              <div>
                <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">
                  Category
                </label>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {(Object.keys(CATEGORY_META) as Category[]).map((c) => {
                    const meta = CATEGORY_META[c];
                    const active = draftCat === c;
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setDraftCat(c)}
                        className={`flex items-center gap-2 rounded-2xl border px-3 py-3 text-left text-sm transition ${
                          active
                            ? "bg-brand-orange border-brand-orange text-ink font-semibold"
                            : "bg-paper border-border text-ink hover:bg-surface"
                        }`}
                      >
                        <span className="text-lg">{meta.emoji}</span>
                        <span className="leading-tight">{meta.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">
                  Title
                </label>
                <input
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  placeholder="e.g. Evening walk at Cubbon Park"
                  className="mt-2 w-full rounded-2xl border border-border bg-paper px-4 py-3 text-sm text-ink outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">
                  When
                </label>
                <input
                  type="datetime-local"
                  value={draftWhen}
                  onChange={(e) => setDraftWhen(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-border bg-paper px-4 py-3 text-sm text-ink outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">
                  Where <span className="normal-case tracking-normal text-muted-foreground/70">(optional, public place)</span>
                </label>
                <input
                  value={draftLocation}
                  onChange={(e) => setDraftLocation(e.target.value)}
                  placeholder="e.g. Cubbon Park, Gate 4"
                  className="mt-2 w-full rounded-2xl border border-border bg-paper px-4 py-3 text-sm text-ink outline-none focus:border-primary"
                />
              </div>
            </div>

            {createMut.isError && (
              <p className="mt-3 text-xs text-destructive">
                {(createMut.error as Error).message}
              </p>
            )}

            <div className="mt-6 flex gap-2">
              <button
                onClick={() => setShowCreate(false)}
                className="flex-1 rounded-2xl border border-border bg-paper py-3.5 font-semibold text-ink"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!draftTitle.trim() || !draftWhen || createMut.isPending}
                className="flex-1 rounded-2xl bg-ink py-3.5 font-semibold text-background disabled:opacity-50"
              >
                {createMut.isPending ? "Posting…" : "Post"}
              </button>
            </div>
          </div>
        </div>
      )}

      {selected && (
        <div
          className="fixed inset-0 z-30 bg-ink/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={() => setSelected(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-background rounded-3xl p-7 shadow-2xl border border-border animate-in slide-in-from-bottom duration-200"
          >
            <div className="flex items-start gap-3">
              <span className="text-4xl">{selected.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] uppercase tracking-[0.22em] text-brand-orange font-semibold">
                  {selected.category} · {formatWhen(selected.starts_at)}
                </p>
                <h2 className="display text-2xl text-ink leading-tight mt-1">
                  {selected.title}
                </h2>
                {selected.location_name && (
                  <p className="text-sm text-muted-foreground mt-1">📍 {selected.location_name}</p>
                )}
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-border bg-paper p-4">
              <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
                Hosted by
              </p>
              <div className="mt-2 flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-ink font-medium truncate">
                    {selected.is_mine ? "You" : selected.host_name}
                  </p>
                  {selected.host_trust !== null && (
                    <p className="text-xs text-primary">Trust {selected.host_trust}/100</p>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {selected.spots_filled}/{selected.spots_total} joined
                </p>
              </div>
            </div>

            <ul className="mt-4 space-y-2 text-xs text-muted-foreground">
              <li>📍 Meet in public places only.</li>
              <li>🚫 Bondoo is not a dating app — keep it friendly.</li>
            </ul>

            {chatError && (
              <p role="alert" className="mt-4 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {chatError}
              </p>
            )}

            <div className="mt-6 flex gap-2">
              <button
                onClick={() => setSelected(null)}
                className="flex-1 rounded-2xl border border-border bg-paper py-3.5 font-semibold text-ink"
              >
                Close
              </button>
              {selected.is_mine ? (
                <Link
                  to="/profile"
                  className="flex-1 rounded-2xl bg-ink py-3.5 font-semibold text-background text-center"
                >
                  Manage
                </Link>
              ) : (
                <>
                  <Link
                    to="/user/$userId"
                    params={{ userId: selected.host_id }}
                    className="flex-1 rounded-2xl border border-ink bg-background py-3.5 font-semibold text-ink text-center"
                  >
                    View host
                  </Link>
                  <button
                    onClick={() => messageHost(selected.host_id)}
                    disabled={opening}
                    className="flex-1 rounded-2xl bg-ink py-3.5 font-semibold text-background disabled:opacity-60"
                  >
                    {opening ? "Opening…" : "Message host"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
