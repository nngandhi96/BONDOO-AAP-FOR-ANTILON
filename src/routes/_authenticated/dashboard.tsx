import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BondooEyes } from "@/components/bondoo-logo";
import { getMyProfile } from "@/lib/profile.functions";
import {
  listActivities,
  createActivity,
  updateActivity,
  deleteActivity,
  type ActivityRow,
} from "@/lib/activities.functions";
import { getOrCreateConversation } from "@/lib/chat.functions";
import { NotificationsBell } from "@/components/notifications-bell";
import { listMeetupsAwaitingMyReview } from "@/lib/reviews.functions";
import { CitySelectorModal } from "@/components/city-selector-modal";
import {
  resolveUserCity,
  getSavedCity,
  getSavedCoordinates,
  getCityCoordinates,
  saveSelectedCity,
  ALL_CITIES_LABEL,
  DEFAULT_FALLBACK_CITY,
  DEFAULT_RADIUS_KM,
} from "@/lib/location";
import { getSavedTheme, saveTheme, applyThemeToDocument, type ThemeMode } from "@/lib/theme";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Nearby activities · Bondoo" },
      {
        name: "description",
        content: "Discover walks, coffee, and reading circles happening near you.",
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
  "Music Jam",
  "House Party",
  "Youth Meetup",
  "Birthday Party",
  "Fun Hangout",
] as const;

type Category = Exclude<(typeof CATEGORIES)[number], "All">;

const CATEGORY_META: Record<Category, { emoji: string; label: string }> = {
  "Coffee & Chat": { emoji: "☕", label: "Coffee & Chat" },
  Walk: { emoji: "🌳", label: "Morning / Evening Walk" },
  Study: { emoji: "📖", label: "Study / Library Session" },
  Sports: { emoji: "🏸", label: "Sports" },
  Food: { emoji: "🍜", label: "Food" },
  "Music Jam": { emoji: "🎸", label: "Music Jam" },
  "House Party": { emoji: "🏠", label: "House Party" },
  "Youth Meetup": { emoji: "👥", label: "Youth Meetup" },
  "Birthday Party": { emoji: "🎂", label: "Birthday Party" },
  "Fun Hangout": { emoji: "🍿", label: "Fun Hangout" },
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

function toLocalDatetimeString(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
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

  const [showEdit, setShowEdit] = useState(false);
  const [editActivityId, setEditActivityId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editWhen, setEditWhen] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editCat, setEditCat] = useState<Category>("Coffee & Chat");

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [opening, setOpening] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [myLoc, setMyLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [locBusy, setLocBusy] = useState(false);
  const [nearMe, setNearMe] = useState(false);

  // Location & City filtering state
  const [selectedCity, setSelectedCity] = useState<string>(
    () => getSavedCity() || DEFAULT_FALLBACK_CITY,
  );
  const [isDetectingCity, setIsDetectingCity] = useState(false);
  const [showCityModal, setShowCityModal] = useState(false);

  // Gen Z Theme mode toggle state (editorial vs genz)
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => getSavedTheme());

  useEffect(() => {
    applyThemeToDocument(themeMode);
  }, [themeMode]);

  function handleToggleTheme() {
    const nextTheme: ThemeMode = themeMode === "editorial" ? "genz" : "editorial";
    setThemeMode(nextTheme);
    saveTheme(nextTheme);
  }

  const fetchProfile = useServerFn(getMyProfile);
  const fetchActivities = useServerFn(listActivities);
  const postActivity = useServerFn(createActivity);
  const editActivity = useServerFn(updateActivity);
  const removeActivity = useServerFn(deleteActivity);
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

  // Reactive 100km radius location-based & city-based feed query
  const { data: activities = [], isLoading } = useQuery({
    queryKey: ["activities", { city: selectedCity, lat: myLoc?.lat, lng: myLoc?.lng }],
    queryFn: () =>
      fetchActivities({
        data: {
          city: selectedCity === ALL_CITIES_LABEL ? undefined : selectedCity,
          latitude: selectedCity === ALL_CITIES_LABEL ? undefined : (myLoc?.lat ?? undefined),
          longitude: selectedCity === ALL_CITIES_LABEL ? undefined : (myLoc?.lng ?? undefined),
          radiusKm: DEFAULT_RADIUS_KM,
        },
      }),
  });

  const { data: pendingReviews = [] } = useQuery({
    queryKey: ["reviews", "pending"],
    queryFn: () => fetchPending(),
  });

  // Resolve user city and coordinates on mount or profile load
  useEffect(() => {
    let isMounted = true;
    async function initLocation() {
      // 1. Immediately hydrate from cache / saved preferences for instant render
      const saved = getSavedCity();
      const savedCoords = getSavedCoordinates();
      if (savedCoords) {
        setMyLoc({ lat: savedCoords.latitude, lng: savedCoords.longitude });
      }
      if (saved) {
        setSelectedCity(saved);
        if (!savedCoords) {
          const fallbackCoords = getCityCoordinates(saved);
          if (fallbackCoords) {
            setMyLoc({ lat: fallbackCoords.latitude, lng: fallbackCoords.longitude });
          }
        }
      }

      // 2. Resolve fresh GPS coordinates or profile location
      setIsDetectingCity(true);
      try {
        const res = await resolveUserCity(profile);
        if (isMounted) {
          if (!saved) {
            setSelectedCity(res.city);
          }
          if (res.latitude != null && res.longitude != null) {
            setMyLoc({ lat: res.latitude, lng: res.longitude });
          }
        }
      } finally {
        if (isMounted) setIsDetectingCity(false);
      }
    }
    initLocation();
    return () => {
      isMounted = false;
    };
  }, [profile]);

  useEffect(() => {
    if (profile?.home_lat != null && profile?.home_lng != null) {
      setMyLoc({ lat: profile.home_lat, lng: profile.home_lng });
    }
  }, [profile]);

  async function handleDetectLocation() {
    setIsDetectingCity(true);
    try {
      const res = await resolveUserCity(profile, true);
      setSelectedCity(res.city);
      saveSelectedCity(res.city);
      if (res.latitude != null && res.longitude != null) {
        setMyLoc({ lat: res.latitude, lng: res.longitude });
      }
      qc.invalidateQueries({ queryKey: ["activities"] });
    } finally {
      setIsDetectingCity(false);
    }
  }

  function handleSelectCity(city: string) {
    setSelectedCity(city);
    saveSelectedCity(city);
    const coords = getCityCoordinates(city);
    if (coords) {
      setMyLoc({ lat: coords.latitude, lng: coords.longitude });
    }
    qc.invalidateQueries({ queryKey: ["activities"] });
  }

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

  // 100km radius & proximity filtering
  const filtered = useMemo(() => {
    const base = cat === "All" ? activities : activities.filter((a) => a.category === cat);
    const withDist = base
      .map((a) => {
        let distKm: number | null = null;
        if (myLoc && a.location_lat != null && a.location_lng != null) {
          distKm = haversine(myLoc.lat, myLoc.lng, a.location_lat, a.location_lng);
        }
        const isMatch = myInterests.has(a.category.toLowerCase());
        return { ...a, __distKm: distKm, __match: isMatch };
      })
      .filter((a) => {
        // If "All Cities" is explicitly selected, show all posts across the country
        if (selectedCity === ALL_CITIES_LABEL) return true;

        // If distance from user's location is known, strictly limit to 100km radius
        if (a.__distKm != null) {
          return a.__distKm <= DEFAULT_RADIUS_KM;
        }

        return true;
      });

    // Sort by proximity (nearest to user first within 100km)
    withDist.sort((a, b) => {
      if (a.__distKm != null && b.__distKm != null) {
        return a.__distKm - b.__distKm;
      }
      if (a.__distKm != null) return -1;
      if (b.__distKm != null) return 1;
      if (myInterests.size > 0 && a.__match !== b.__match) {
        return Number(b.__match) - Number(a.__match);
      }
      return 0;
    });

    return withDist;
  }, [activities, cat, myLoc, selectedCity, myInterests]);

  const createMut = useMutation({
    mutationFn: (input: {
      title: string;
      category: Category;
      starts_at: string;
      location_name?: string;
      location_lat?: number;
      location_lng?: number;
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
      location_lat: myLoc?.lat ?? undefined,
      location_lng: myLoc?.lng ?? undefined,
    });
  }

  const updateMut = useMutation({
    mutationFn: (input: {
      activityId: string;
      title: string;
      category: Category;
      starts_at: string;
      location_name?: string;
      location_lat?: number;
      location_lng?: number;
    }) => editActivity({ data: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["activities"] });
      setShowEdit(false);
      setEditActivityId(null);
      setSelected(null);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (activityId: string) => removeActivity({ data: { activityId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["activities"] });
      setConfirmingDelete(false);
      setSelected(null);
    },
  });

  function handleStartEdit(act: ActivityRow) {
    setEditActivityId(act.id);
    setEditTitle(act.title);
    setEditCat(act.category);
    setEditWhen(toLocalDatetimeString(act.starts_at));
    setEditLocation(act.location_name || "");
    setShowEdit(true);
  }

  function handleSaveEdit() {
    if (!editActivityId || !editTitle.trim() || !editWhen) return;
    updateMut.mutate({
      activityId: editActivityId,
      title: editTitle.trim(),
      category: editCat,
      starts_at: new Date(editWhen).toISOString(),
      location_name: editLocation.trim() || undefined,
    });
  }

  function handleDelete() {
    if (!selected) return;
    deleteMut.mutate(selected.id);
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
      setChatError(
        error instanceof Error ? error.message : "Chat could not be opened. Please try again.",
      );
    } finally {
      setOpening(false);
    }
  }

  return (
    <main className="min-h-screen bg-background pb-28 relative transition-colors duration-300">
      <header
        className={`max-w-md mx-auto px-6 transition-colors duration-300 ${
          themeMode === "genz" ? "pt-5 pb-1" : "pt-7"
        }`}
      >
        <div
          className={`flex items-center text-[10px] uppercase font-semibold ${
            themeMode === "genz"
              ? "justify-end"
              : "justify-between tracking-[0.24em] text-muted-foreground"
          }`}
        >
          {themeMode !== "genz" && (
            <span>
              {new Date().toLocaleDateString([], {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}{" "}
              · Vol. 01
            </span>
          )}

          {/* Theme Mode Toggle Button */}
          <button
            type="button"
            onClick={handleToggleTheme}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold shadow-sm transition active:scale-95 cursor-pointer ${
              themeMode === "genz"
                ? "bg-[#141828] text-white border border-[#222A40] hover:border-indigo-400/50 shadow-[0_0_12px_rgba(91,104,246,0.2)]"
                : "bg-paper border border-border hover:border-brand-orange text-ink"
            }`}
            title={themeMode === "genz" ? "Switch to Editorial Zine Mode" : "Switch to Gen Z Mode"}
          >
            <span className="text-xs">{themeMode === "genz" ? "⚡" : "✨"}</span>
            <span className={themeMode === "genz" ? "text-amber-300 font-semibold" : ""}>
              {themeMode === "genz" ? "Zine Mode 📰" : "Gen Z Mode"}
            </span>
          </button>
        </div>

        <div
          className={`flex items-end justify-between ${
            themeMode === "genz"
              ? "mt-2.5 border-b border-white/10 pb-3"
              : "mt-4 border-b border-border/80 pb-4"
          }`}
        >
          <div className="min-w-0">
            {themeMode === "genz" ? (
              <>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8E9BB0]">
                  WHAT'S THE MOVE
                </p>
                <button
                  type="button"
                  onClick={() => setShowCityModal(true)}
                  className="group mt-0.5 inline-flex items-center gap-2 text-left cursor-pointer active:scale-[0.98] transition-transform max-w-full"
                  title="Switch Location"
                >
                  <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white group-hover:text-[#5B68F6] transition-colors truncate">
                    {selectedCity.toUpperCase()}
                  </h1>
                  <span className="text-2xl text-[#FFA84A] shrink-0">⚡</span>
                  <span className="text-sm text-[#8E9BB0] group-hover:text-white transition-colors shrink-0">
                    ▾
                  </span>
                </button>
              </>
            ) : (
              <>
                <p className="text-[11px] uppercase tracking-[0.2em] text-brand-orange font-semibold">
                  You are in
                </p>
                <h1 className="display text-[2.6rem] leading-[0.95] text-ink mt-1 truncate">
                  {profile?.neighbourhood || "Nearby"}
                  <span className="text-brand-orange">.</span>
                </h1>
                {/* Header City Selector Chip with 100km Radius indicator */}
                <button
                  type="button"
                  onClick={() => setShowCityModal(true)}
                  className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-paper border border-border hover:border-brand-orange text-ink text-xs font-semibold shadow-sm transition active:scale-[0.98] cursor-pointer"
                  title="Filter by City · 100 km Radius"
                >
                  <span className="text-brand-orange text-xs">
                    {selectedCity === ALL_CITIES_LABEL ? "🌐" : "📍"}
                  </span>
                  <span className="font-semibold">{selectedCity}</span>
                  {selectedCity !== ALL_CITIES_LABEL && (
                    <span className="text-[10px] text-brand-orange font-medium px-1.5 py-0.5 rounded-full bg-brand-orange/10">
                      within 100km
                    </span>
                  )}
                  <span className="text-[10px] text-muted-foreground">▾</span>
                </button>
              </>
            )}
          </div>
          <div className="shrink-0 flex items-center gap-2">
            <NotificationsBell />
            <Link
              to="/profile"
              className={`h-11 w-11 rounded-full flex items-center justify-center border transition ${
                themeMode === "genz"
                  ? "bg-[#141828] border-[#222A40] text-white/80 hover:text-white hover:border-indigo-400/40 shadow-sm"
                  : "bg-paper border-border"
              }`}
              aria-label="Profile"
            >
              <BondooEyes className="h-4" />
            </Link>
          </div>
        </div>
      </header>

      <div className={`max-w-md mx-auto px-6 ${themeMode === "genz" ? "pt-3.5" : "pt-5"}`}>
        {pendingReviews.length > 0 && (
          <button
            onClick={() =>
              navigate({
                to: "/review/$meetupId",
                params: { meetupId: pendingReviews[0].meetup_id },
              })
            }
            className={`w-full mb-3 flex items-center gap-3 rounded-2xl p-3.5 text-left transition ${
              themeMode === "genz"
                ? "bg-[#121626]/90 border border-indigo-500/30 backdrop-blur-md shadow-md"
                : "bg-brand-orange/12 border border-brand-orange/30"
            }`}
          >
            <span className="text-xl">⭐</span>
            <div className="flex-1 min-w-0">
              <p
                className={`text-[11px] uppercase tracking-[0.18em] font-semibold ${
                  themeMode === "genz" ? "text-[#FFA84A]" : "text-brand-orange"
                }`}
              >
                Rate your meetup
              </p>
              <p className="text-xs text-ink truncate">
                How was your meet with {pendingReviews[0].other_name}?
              </p>
            </div>
            <span className="text-[11px] font-semibold text-ink">Rate →</span>
          </button>
        )}

        <div className="flex items-center justify-between gap-3">
          <div
            className={`inline-flex rounded-full p-0.5 border ${
              themeMode === "genz"
                ? "bg-[#141828] border-[#222A40]"
                : "bg-surface border-border p-1"
            }`}
          >
            {(["list", "map"] as const).map((v) => {
              const active = view === v;
              return (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={
                    themeMode === "genz"
                      ? `px-3.5 py-1 text-xs rounded-full font-semibold transition-all cursor-pointer ${
                          active
                            ? "bg-[#5B68F6] text-white shadow-[0_0_15px_rgba(91,104,246,0.45)]"
                            : "text-[#8E9BB0] hover:text-white"
                        }`
                      : `px-5 py-1.5 text-sm font-medium rounded-full transition cursor-pointer ${
                          active ? "bg-ink text-background" : "text-muted-foreground"
                        }`
                  }
                >
                  {v === "list" ? "List" : "Map"}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => (myLoc ? setNearMe((v) => !v) : requestLocation())}
            className={
              themeMode === "genz"
                ? `text-xs font-semibold px-3.5 py-1.5 rounded-full border transition active:scale-95 cursor-pointer ${
                    nearMe
                      ? "bg-[#5B68F6] text-white border-[#5B68F6] shadow-[0_0_14px_rgba(91,104,246,0.45)]"
                      : "bg-[#141828] text-[#D1D5DB] border-[#222A40] hover:border-indigo-400/40"
                  }`
                : `text-[11px] uppercase tracking-[0.18em] font-semibold px-3 py-1.5 rounded-full border transition cursor-pointer ${
                    nearMe
                      ? "bg-primary text-background border-primary"
                      : "bg-paper text-ink border-border"
                  }`
            }
          >
            {locBusy ? "Locating…" : nearMe ? "📍 Near me" : "📍 Sort near me"}
          </button>
        </div>

        <div
          className={`flex gap-2 overflow-x-auto -mx-6 px-6 no-scrollbar ${
            themeMode === "genz" ? "mt-3" : "mt-5"
          }`}
        >
          {CATEGORIES.map((c) => {
            const isActive = cat === c;
            return (
              <button
                key={c}
                onClick={() => setCat(c)}
                className={
                  themeMode === "genz"
                    ? `shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold tracking-normal transition-all cursor-pointer ${
                        isActive
                          ? "bg-[#5B68F6] text-white border border-[#5B68F6] shadow-[0_0_14px_rgba(91,104,246,0.45)] scale-[1.02]"
                          : "bg-[#141828] text-[#D1D5DB] border border-[#222A40] hover:bg-[#1A2035] hover:text-white"
                      }`
                    : `shrink-0 px-4 py-2 rounded-full text-sm border transition display italic cursor-pointer ${
                        isActive
                          ? "bg-brand-orange text-ink border-brand-orange font-semibold"
                          : "bg-paper text-ink border-border hover:bg-surface"
                      }`
                }
              >
                {c}
              </button>
            );
          })}
        </div>

        {/* Safety Banner */}
        {themeMode === "genz" ? (
          <div className="mt-3 flex items-center gap-3 rounded-2xl bg-[#121626]/90 border border-indigo-500/25 p-3.5 backdrop-blur-xl shadow-lg">
            <div className="h-8 w-8 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-base shrink-0 text-[#5B68F6] shadow-[0_0_12px_rgba(91,104,246,0.25)]">
              🛡️
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wider text-[#FFA84A]">
                PUBLIC SPOTS ONLY · STAY SAFE, STAY REAL
              </p>
              <p className="text-[11px] text-[#8E9BB0] font-normal">
                Cafés, parks, campuses. Zero sketchiness, never share private addresses.
              </p>
            </div>
          </div>
        ) : (
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
        )}

        {view === "list" ? (
          isLoading ? (
            <p className="mt-8 text-center text-sm text-muted-foreground">Loading…</p>
          ) : filtered.length === 0 ? (
            themeMode === "genz" ? (
              <div className="mt-4 text-center py-7 px-5 rounded-3xl bg-[#121626]/90 border border-[#222A40] backdrop-blur-xl shadow-xl">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#1C2138] border border-indigo-500/30 text-2xl text-[#FFA84A] shadow-[0_0_25px_rgba(91,104,246,0.35)]">
                  ⚡
                </div>
                <h3 className="mt-3 text-xl font-extrabold text-white tracking-tight">
                  {selectedCity === ALL_CITIES_LABEL
                    ? "No moves yet"
                    : `No moves in ${selectedCity} yet?`}
                </h3>
                <p className="mt-1.5 text-xs text-[#8E9BB0] font-normal max-w-xs mx-auto">
                  {selectedCity === ALL_CITIES_LABEL
                    ? "Be the first to drop a plan and set the vibe."
                    : `No moves planned in ${selectedCity} yet? Drop a plan and set the vibe ⚡`}
                </p>
                {selectedCity !== ALL_CITIES_LABEL && (
                  <div className="mt-3.5">
                    <button
                      type="button"
                      onClick={() => handleSelectCity(ALL_CITIES_LABEL)}
                      className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full border border-[#222A40] bg-[#141828] text-xs font-semibold text-[#D1D5DB] hover:bg-[#1A2035] hover:text-white transition active:scale-95 cursor-pointer"
                    >
                      <span>🌐</span>
                      <span>Explore All Cities</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-10 text-center">
                <p className="display text-2xl text-ink">
                  {selectedCity === ALL_CITIES_LABEL
                    ? "Nothing yet"
                    : `Nothing within 100 km of ${selectedCity} yet`}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {selectedCity === ALL_CITIES_LABEL
                    ? "Be the first — post an activity below."
                    : `No activities found within 100 km of ${selectedCity}. Be the first to post, or switch cities.`}
                </p>
                {selectedCity !== ALL_CITIES_LABEL && (
                  <button
                    type="button"
                    onClick={() => handleSelectCity(ALL_CITIES_LABEL)}
                    className="mt-4 px-4 py-2 rounded-full border border-border bg-paper text-xs font-semibold text-primary hover:bg-surface transition shadow-sm"
                  >
                    🌐 View posts from All Cities
                  </button>
                )}
              </div>
            )
          ) : themeMode === "genz" ? (
            /* Gen Z Mode Post Cards: Modern Glassmorphic Tiles */
            <ul className="mt-3 space-y-3">
              {filtered.map((a) => (
                <li key={a.id}>
                  <button
                    onClick={() => setSelected(a)}
                    className="group w-full text-left p-3.5 rounded-2xl bg-[#121626]/90 border border-[#222A40] hover:border-[#5B68F6]/60 hover:bg-[#151B2E] backdrop-blur-xl shadow-lg hover:shadow-[0_8px_30px_rgba(91,104,246,0.2)] transition-all duration-200 active:scale-[0.99] flex flex-col gap-2.5 cursor-pointer"
                  >
                    {/* Top Tag Row */}
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xl">{a.emoji}</span>
                        <span className="bg-[#5B68F6]/15 text-[#5B68F6] border border-[#5B68F6]/30 font-bold text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full">
                          {a.category}
                        </span>
                        {a.__match && (
                          <span className="bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[9px] font-semibold px-2 py-0.5 rounded-full">
                            FOR YOU
                          </span>
                        )}
                        {a.city && (
                          <span className="text-[10px] font-medium text-white/60">📍 {a.city}</span>
                        )}
                      </div>
                      <span className="text-[11px] font-medium text-white/50">
                        {formatWhen(a.starts_at)}
                      </span>
                    </div>

                    {/* Title */}
                    <h3 className="text-base sm:text-lg font-extrabold text-white group-hover:text-[#5B68F6] tracking-tight leading-snug transition">
                      {a.title}
                    </h3>

                    {/* Meta Row: Host, Trust, Spots, Distance */}
                    <div className="flex items-center justify-between w-full pt-1.5 border-t border-white/5 text-xs flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        {a.host_avatar_url ? (
                          <img
                            src={a.host_avatar_url}
                            alt={a.host_name}
                            className="h-5 w-5 rounded-full object-cover shrink-0 border border-white/20"
                          />
                        ) : (
                          <span className="h-5 w-5 rounded-full bg-white/10 flex items-center justify-center font-bold text-[9px] text-white shrink-0">
                            {a.host_name
                              .split(" ")
                              .map((s) => s[0])
                              .join("")
                              .slice(0, 2)}
                          </span>
                        )}
                        <span className="font-semibold text-white/90">
                          {a.is_mine ? "You" : a.host_name}
                        </span>
                        {a.host_trust !== null && (
                          <span className="text-[10px] font-bold text-[#FFA84A] bg-[#FFA84A]/10 px-1.5 py-0.5 rounded-md border border-[#FFA84A]/25">
                            ⚡ {a.host_trust} Trust
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-white/50 text-[11px] font-medium">
                          {a.spots_filled}/{a.spots_total} in
                        </span>
                        {a.__distKm != null && (
                          <span className="text-[11px] font-bold text-white bg-[#5B68F6] px-2 py-0.5 rounded-full shadow-[0_0_10px_rgba(91,104,246,0.3)]">
                            📍{" "}
                            {a.__distKm < 1
                              ? `${Math.round(a.__distKm * 1000)}m`
                              : `${a.__distKm.toFixed(1)}km`}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            /* Editorial Zine Mode Post Cards */
            <ul className="mt-5 divide-y divide-border border-y border-border">
              {filtered.map((a, idx) => (
                <li key={a.id}>
                  <button
                    onClick={() => setSelected(a)}
                    className="group w-full text-left py-5 flex gap-4 items-start hover:bg-paper/60 transition -mx-2 px-2 rounded-xl cursor-pointer"
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
                        {a.city && (
                          <span className="ml-2 inline-block bg-brand-orange/15 text-brand-orange px-1.5 py-0.5 rounded-full normal-case tracking-normal text-[9px] font-semibold">
                            📍 {a.city}
                          </span>
                        )}
                      </p>
                      <h3 className="display mt-1 text-[1.35rem] leading-tight text-ink group-hover:text-primary transition">
                        {a.title}
                      </h3>
                      <div className="mt-2 flex items-center gap-2 flex-wrap text-xs">
                        <span className="flex items-center gap-1.5 text-ink/80">
                          {a.host_avatar_url ? (
                            <img
                              src={a.host_avatar_url}
                              alt={a.host_name}
                              className="h-5 w-5 rounded-full object-cover shrink-0 border border-border"
                            />
                          ) : (
                            <span className="h-5 w-5 rounded-full bg-secondary flex items-center justify-center font-semibold text-[9px] shrink-0">
                              {a.host_name
                                .split(" ")
                                .map((s) => s[0])
                                .join("")
                                .slice(0, 2)}
                            </span>
                          )}
                          {a.is_mine ? "You" : a.host_name}
                        </span>
                        {a.host_trust !== null && (
                          <>
                            <span className="text-muted-foreground">·</span>
                            <span className="text-primary font-medium">Trust {a.host_trust}</span>
                          </>
                        )}
                        <span className="text-muted-foreground">·</span>
                        <span className="text-muted-foreground">
                          {a.spots_filled} of {a.spots_total} joined
                        </span>
                        {a.__distKm != null && (
                          <>
                            <span className="text-muted-foreground">·</span>
                            <span className="text-brand-orange font-medium">
                              📍{" "}
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
            <svg
              className="absolute inset-0 h-full w-full opacity-30"
              viewBox="0 0 400 440"
              fill="none"
            >
              <path
                d="M0 120 Q 100 80 200 140 T 400 130"
                stroke="#007AFF"
                strokeWidth="1.5"
                fill="none"
              />
              <path
                d="M0 280 Q 120 240 220 300 T 400 290"
                stroke="#FF9500"
                strokeWidth="1.5"
                fill="none"
              />
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
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Showing
              </p>
              <p className="display text-lg text-ink leading-tight">{filtered.length} nearby</p>
            </div>
          </div>
        )}
      </div>

      {/* Floating CTA Button: Adapts to Gen Z vs Editorial */}
      <button
        onClick={() => setShowCreate(true)}
        className={
          themeMode === "genz"
            ? "fixed bottom-20 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-[#5B68F6] text-white rounded-full px-6 py-3.5 shadow-[0_4px_25px_rgba(91,104,246,0.55)] hover:shadow-[0_6px_30px_rgba(91,104,246,0.7)] hover:scale-105 active:scale-95 transition-all font-extrabold text-sm whitespace-nowrap cursor-pointer tracking-tight"
            : "fixed bottom-20 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 bg-ink text-background rounded-full pl-5 pr-6 py-3.5 shadow-xl shadow-ink/25 hover:bg-ink/90 active:scale-[0.98] transition font-semibold whitespace-nowrap cursor-pointer"
        }
      >
        {themeMode === "genz" ? (
          <>
            <span className="text-[#FFA84A] text-base leading-none font-black">⚡</span>
            <span>Drop a Plan</span>
          </>
        ) : (
          <>
            <span className="h-6 w-6 rounded-full bg-brand-orange text-ink flex items-center justify-center text-lg leading-none">
              +
            </span>
            <span>
              Post an <em className="display italic font-normal">activity</em>
            </span>
          </>
        )}
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
                  Where{" "}
                  <span className="normal-case tracking-normal text-muted-foreground/70">
                    (optional, public place)
                  </span>
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
              <p className="mt-3 text-xs text-destructive">{(createMut.error as Error).message}</p>
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

      {showEdit && (
        <div
          className="fixed inset-0 z-30 bg-ink/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={() => {
            setShowEdit(false);
            setEditActivityId(null);
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-background rounded-3xl p-7 shadow-2xl border border-border animate-in slide-in-from-bottom duration-200"
          >
            <p className="text-center text-[11px] uppercase tracking-[0.22em] text-brand-orange font-semibold">
              Edit activity
            </p>
            <h2 className="display text-3xl text-ink text-center mt-2 leading-tight">
              Update <em className="text-primary not-italic">activity</em>
            </h2>

            <div className="mt-5 space-y-4">
              <div>
                <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">
                  Category
                </label>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {(Object.keys(CATEGORY_META) as Category[]).map((c) => {
                    const meta = CATEGORY_META[c];
                    const active = editCat === c;
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setEditCat(c)}
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
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
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
                  value={editWhen}
                  onChange={(e) => setEditWhen(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-border bg-paper px-4 py-3 text-sm text-ink outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">
                  Where{" "}
                  <span className="normal-case tracking-normal text-muted-foreground/70">
                    (optional, public place)
                  </span>
                </label>
                <input
                  value={editLocation}
                  onChange={(e) => setEditLocation(e.target.value)}
                  placeholder="e.g. Cubbon Park, Gate 4"
                  className="mt-2 w-full rounded-2xl border border-border bg-paper px-4 py-3 text-sm text-ink outline-none focus:border-primary"
                />
              </div>
            </div>

            {updateMut.isError && (
              <p className="mt-3 text-xs text-destructive">{(updateMut.error as Error).message}</p>
            )}

            <div className="mt-6 flex gap-2">
              <button
                onClick={() => {
                  setShowEdit(false);
                  setEditActivityId(null);
                }}
                className="flex-1 rounded-2xl border border-border bg-paper py-3.5 font-semibold text-ink"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={!editTitle.trim() || !editWhen || updateMut.isPending}
                className="flex-1 rounded-2xl bg-ink py-3.5 font-semibold text-background disabled:opacity-50"
              >
                {updateMut.isPending ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {selected && (
        <div
          className="fixed inset-0 z-30 bg-ink/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={() => {
            setSelected(null);
            setConfirmingDelete(false);
          }}
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
                <h2 className="display text-2xl text-ink leading-tight mt-1">{selected.title}</h2>
                {selected.city && (
                  <p className="text-xs text-brand-orange font-semibold mt-1">
                    📍 {selected.city}
                    {selected.location_name ? ` · ${selected.location_name}` : ""}
                  </p>
                )}
                {!selected.city && selected.location_name && (
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
              <p
                role="alert"
                className="mt-4 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {chatError}
              </p>
            )}

            {selected.is_mine ? (
              confirmingDelete ? (
                <div className="mt-6 rounded-2xl bg-destructive/10 border border-destructive/20 p-4 text-center">
                  <p className="text-sm font-semibold text-destructive">Delete this activity?</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    It will be removed from nearby activity feeds.
                  </p>
                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={() => setConfirmingDelete(false)}
                      className="flex-1 rounded-2xl border border-border bg-paper py-2.5 text-xs font-semibold text-ink"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDelete}
                      disabled={deleteMut.isPending}
                      className="flex-1 rounded-2xl bg-destructive py-2.5 text-xs font-semibold text-destructive-foreground disabled:opacity-50"
                    >
                      {deleteMut.isPending ? "Deleting…" : "Confirm Delete"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-6 flex gap-2">
                  <button
                    onClick={() => {
                      setSelected(null);
                      setConfirmingDelete(false);
                    }}
                    className="flex-1 rounded-2xl border border-border bg-paper py-3.5 font-semibold text-ink"
                  >
                    Close
                  </button>
                  <button
                    onClick={() => {
                      const current = selected;
                      setSelected(null);
                      handleStartEdit(current);
                    }}
                    className="flex-1 rounded-2xl border border-primary text-primary bg-background py-3.5 font-semibold text-center hover:bg-primary/10 transition"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setConfirmingDelete(true)}
                    className="flex-1 rounded-2xl bg-destructive/10 text-destructive border border-destructive/20 py-3.5 font-semibold text-center hover:bg-destructive/20 transition"
                  >
                    Delete
                  </button>
                </div>
              )
            ) : (
              <div className="mt-6 flex gap-2">
                <button
                  onClick={() => setSelected(null)}
                  className="flex-1 rounded-2xl border border-border bg-paper py-3.5 font-semibold text-ink"
                >
                  Close
                </button>
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
              </div>
            )}
          </div>
        </div>
      )}

      <CitySelectorModal
        isOpen={showCityModal}
        onClose={() => setShowCityModal(false)}
        selectedCity={selectedCity}
        onSelectCity={handleSelectCity}
        onDetectLocation={handleDetectLocation}
        isDetecting={isDetectingCity}
      />
    </main>
  );
}
