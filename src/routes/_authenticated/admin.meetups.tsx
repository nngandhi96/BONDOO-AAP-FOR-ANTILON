import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAdminMeetups } from "@/lib/admin.functions";
import { AdminLayout } from "@/components/admin/admin-layout";
import {
  Calendar,
  Users,
  MapPin,
  Clock,
  ExternalLink,
  Sparkles,
  Coffee,
  CheckCircle2,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/meetups")({
  head: () => ({
    meta: [
      { title: "Meetups & Activities — Bondoo Admin" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminMeetupsPage,
});

function AdminMeetupsPage() {
  const [tab, setTab] = useState<"activities" | "meetups">("activities");
  const fetchMeetups = useServerFn(listAdminMeetups);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-meetups-list"],
    queryFn: () => fetchMeetups(),
  });

  return (
    <AdminLayout
      title="Meetups & Activities"
      subtitle="Monitor scheduled group events and 1-on-1 social meetups happening across the community."
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTab("activities")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
              tab === "activities"
                ? "bg-brand-orange text-white shadow-sm"
                : "bg-paper border border-border text-muted-foreground hover:text-ink"
            }`}
          >
            Group Activities ({data?.activities?.length ?? 0})
          </button>
          <button
            onClick={() => setTab("meetups")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
              tab === "meetups"
                ? "bg-brand-orange text-white shadow-sm"
                : "bg-paper border border-border text-muted-foreground hover:text-ink"
            }`}
          >
            1-on-1 Meetups ({data?.meetups?.length ?? 0})
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-pulse">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-40 bg-paper rounded-3xl border border-border" />
            ))}
          </div>
        ) : tab === "activities" ? (
          /* Group Activities View */
          !data?.activities || data.activities.length === 0 ? (
            <div className="p-16 text-center rounded-3xl bg-paper border border-border">
              <p className="text-sm font-semibold text-ink">No activities created yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {data.activities.map((act: any) => (
                <div
                  key={act.id}
                  className="rounded-3xl bg-paper border border-border p-6 flex flex-col justify-between hover:border-border/80 transition"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-md bg-brand-orange/10 text-brand-orange">
                          {act.category || "General Activity"}
                        </span>
                        <h3 className="font-serif font-bold text-lg text-ink mt-2">
                          {act.title}
                        </h3>
                      </div>
                      <span
                        className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${
                          act.status === "cancelled"
                            ? "bg-destructive/10 text-destructive"
                            : "bg-emerald-500/10 text-emerald-600"
                        }`}
                      >
                        {act.status || "Active"}
                      </span>
                    </div>

                    {act.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mb-4">
                        {act.description}
                      </p>
                    )}

                    <div className="space-y-2 text-xs text-muted-foreground border-t border-border pt-3">
                      <div className="flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-brand-orange" />
                        <span>
                          {new Date(act.starts_at).toLocaleString([], {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-primary" />
                        <span>{act.neighbourhood || act.venue_name || "Location TBD"}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-brand-orange/15 text-brand-orange flex items-center justify-center font-bold text-xs">
                        {act.host?.display_name?.slice(0, 1) || "H"}
                      </div>
                      <span className="text-xs font-semibold text-ink">
                        Host: {act.host?.display_name || "Unknown"}
                      </span>
                    </div>
                    {act.host_id && (
                      <Link
                        to="/user/$userId"
                        params={{ userId: act.host_id }}
                        className="text-xs font-semibold text-brand-orange hover:underline flex items-center gap-1"
                      >
                        Host Profile <ExternalLink className="w-3 h-3" />
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          /* 1-on-1 Meetups View */
          !data?.meetups || data.meetups.length === 0 ? (
            <div className="p-16 text-center rounded-3xl bg-paper border border-border">
              <p className="text-sm font-semibold text-ink">No 1-on-1 meetups found</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {data.meetups.map((m: any) => (
                <div
                  key={m.id}
                  className="rounded-3xl bg-paper border border-border p-6 flex flex-col justify-between hover:border-border/80 transition"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-2">
                        <Coffee className="w-4 h-4 text-brand-orange" />
                        <span className="font-semibold text-sm text-ink">
                          1-on-1 Meetup
                        </span>
                      </div>
                      <span
                        className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${
                          m.status === "completed"
                            ? "bg-emerald-500/10 text-emerald-600"
                            : m.status === "cancelled"
                              ? "bg-destructive/10 text-destructive"
                              : "bg-primary/10 text-primary"
                        }`}
                      >
                        {m.status || "Scheduled"}
                      </span>
                    </div>

                    <div className="my-4 p-3 rounded-2xl bg-background border border-border space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Initiator:</span>
                        <span className="font-semibold text-ink">
                          {m.initiator?.display_name || "User"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Partner:</span>
                        <span className="font-semibold text-ink">
                          {m.partner?.display_name || "User"}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1 text-xs text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5" />
                        <span>
                          {m.scheduled_at
                            ? new Date(m.scheduled_at).toLocaleString([], {
                                dateStyle: "medium",
                                timeStyle: "short",
                              })
                            : "No date specified"}
                        </span>
                      </div>
                      {m.venue_name && (
                        <div className="flex items-center gap-2">
                          <MapPin className="w-3.5 h-3.5" />
                          <span>{m.venue_name}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">
                      ID: {m.id.slice(0, 8)}…
                    </span>
                    <Link
                      to="/meetup/$meetupId"
                      params={{ meetupId: m.id }}
                      className="text-xs font-semibold text-brand-orange hover:underline flex items-center gap-1"
                    >
                      Meetup Page <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </AdminLayout>
  );
}
