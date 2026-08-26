import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAdminOverviewStats } from "@/lib/admin.functions";
import { AdminLayout } from "@/components/admin/admin-layout";
import {
  Users,
  ShieldCheck,
  FileCheck2,
  Camera,
  ShieldAlert,
  Calendar,
  MessageSquare,
  Sparkles,
  ArrowRight,
  TrendingUp,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({
    meta: [
      { title: "Admin Overview — Bondoo Control Panel" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminOverviewPage,
});

function AdminOverviewPage() {
  const fetchStats = useServerFn(getAdminOverviewStats);

  const { data: stats, isLoading, refetch } = useQuery({
    queryKey: ["admin-overview-stats"],
    queryFn: () => fetchStats(),
    refetchInterval: 15000,
  });

  const verifiedPercent = stats?.totalUsers
    ? Math.round((stats.govIdVerified / stats.totalUsers) * 100)
    : 0;

  return (
    <AdminLayout
      title="Platform Overview"
      subtitle="Real-time pulse of user trust, safety metrics, and community connections."
      actions={
        <button
          onClick={() => refetch()}
          className="text-xs px-3.5 py-1.5 rounded-full border border-border bg-paper hover:bg-background text-ink font-medium transition"
        >
          Refresh Live Data
        </button>
      }
    >
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-pulse">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-32 bg-paper rounded-3xl border border-border" />
          ))}
        </div>
      ) : (
        <div className="space-y-8">
          {/* Quick Alert Banner if open reports exist */}
          {(stats?.openReports ?? 0) > 0 && (
            <div className="rounded-3xl bg-destructive/10 border border-destructive/20 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-destructive text-destructive-foreground">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-ink">
                    {stats?.openReports} Unresolved Safety Report{stats?.openReports === 1 ? "" : "s"}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Action required to keep community members safe.
                  </p>
                </div>
              </div>
              <Link
                to="/admin/reports"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-destructive text-destructive-foreground text-xs font-semibold hover:opacity-90 transition"
              >
                Review Reports <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          )}

          {/* Primary Metrics Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              title="Total Registered Users"
              value={stats?.totalUsers ?? 0}
              icon={Users}
              note="Total profile accounts"
              color="text-blue-500"
              bg="bg-blue-500/10"
            />
            <MetricCard
              title="Gov ID Verified"
              value={stats?.govIdVerified ?? 0}
              icon={FileCheck2}
              note={`${verifiedPercent}% of community`}
              color="text-emerald-500"
              bg="bg-emerald-500/10"
            />
            <MetricCard
              title="Selfie Matched"
              value={stats?.selfieVerified ?? 0}
              icon={Camera}
              note="Liveness verified users"
              color="text-purple-500"
              bg="bg-purple-500/10"
            />
            <MetricCard
              title="Phone Verified"
              value={stats?.phoneVerified ?? 0}
              icon={ShieldCheck}
              note="OTP confirmed profiles"
              color="text-amber-500"
              bg="bg-amber-500/10"
            />
          </div>

          {/* Secondary Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-3xl bg-paper border border-border p-6 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Meetups & Gatherings
                </span>
                <Calendar className="w-4 h-4 text-brand-orange" />
              </div>
              <div className="my-4">
                <span className="text-3xl font-bold font-serif text-ink">
                  {stats?.totalMeetups ?? 0}
                </span>
                <span className="text-xs text-muted-foreground ml-2">1-on-1 Meetups</span>
              </div>
              <div className="text-xs text-muted-foreground border-t border-border pt-3 flex justify-between">
                <span>Group Activities:</span>
                <span className="font-semibold text-ink">{stats?.totalActivities ?? 0}</span>
              </div>
            </div>

            <div className="rounded-3xl bg-paper border border-border p-6 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Community Reviews
                </span>
                <MessageSquare className="w-4 h-4 text-primary" />
              </div>
              <div className="my-4">
                <span className="text-3xl font-bold font-serif text-ink">
                  {stats?.totalReviews ?? 0}
                </span>
                <span className="text-xs text-muted-foreground ml-2">Total feedback left</span>
              </div>
              <div className="text-xs text-muted-foreground border-t border-border pt-3 flex justify-between">
                <span>Peer Trust Factor:</span>
                <span className="font-semibold text-emerald-600">Active</span>
              </div>
            </div>

            <div className="rounded-3xl bg-paper border border-border p-6 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Background Checks
                </span>
                <Sparkles className="w-4 h-4 text-brand-teal" />
              </div>
              <div className="my-4">
                <span className="text-3xl font-bold font-serif text-ink">
                  {stats?.backgroundApproved ?? 0}
                </span>
                <span className="text-xs text-muted-foreground ml-2">Cleared & Approved</span>
              </div>
              <div className="text-xs text-muted-foreground border-t border-border pt-3 flex justify-between">
                <span>Trust Score Impact:</span>
                <span className="font-semibold text-ink">+8 points per user</span>
              </div>
            </div>
          </div>

          {/* Quick Management Actions */}
          <div className="rounded-3xl bg-paper border border-border p-6">
            <h2 className="text-lg font-serif font-bold text-ink mb-4">
              Quick Admin Actions
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Link
                to="/admin/users"
                className="group p-4 rounded-2xl bg-background border border-border hover:border-brand-orange/40 hover:shadow-md transition flex flex-col justify-between"
              >
                <div>
                  <div className="w-9 h-9 rounded-xl bg-brand-orange/10 text-brand-orange flex items-center justify-center mb-3">
                    <Users className="w-5 h-5" />
                  </div>
                  <h4 className="font-semibold text-ink group-hover:text-brand-orange transition">
                    User Directory
                  </h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    Search accounts, inspect trust scores and toggle verifications.
                  </p>
                </div>
                <span className="mt-4 text-xs font-semibold text-brand-orange flex items-center gap-1">
                  Manage users <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition" />
                </span>
              </Link>

              <Link
                to="/admin/verifications"
                className="group p-4 rounded-2xl bg-background border border-border hover:border-emerald-500/40 hover:shadow-md transition flex flex-col justify-between"
              >
                <div>
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center mb-3">
                    <FileCheck2 className="w-5 h-5" />
                  </div>
                  <h4 className="font-semibold text-ink group-hover:text-emerald-600 transition">
                    Verification Queue
                  </h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    Review and approve submitted Gov IDs &amp; selfie checks.
                  </p>
                </div>
                <span className="mt-4 text-xs font-semibold text-emerald-600 flex items-center gap-1">
                  Review queue <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition" />
                </span>
              </Link>

              <Link
                to="/admin/reports"
                className="group p-4 rounded-2xl bg-background border border-border hover:border-destructive/40 hover:shadow-md transition flex flex-col justify-between"
              >
                <div>
                  <div className="w-9 h-9 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center mb-3">
                    <ShieldAlert className="w-5 h-5" />
                  </div>
                  <h4 className="font-semibold text-ink group-hover:text-destructive transition">
                    Report Moderation
                  </h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    Handle user complaints, apply warnings or ban bad actors.
                  </p>
                </div>
                <span className="mt-4 text-xs font-semibold text-destructive flex items-center gap-1">
                  Resolve reports <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition" />
                </span>
              </Link>

              <Link
                to="/admin/meetups"
                className="group p-4 rounded-2xl bg-background border border-border hover:border-primary/40 hover:shadow-md transition flex flex-col justify-between"
              >
                <div>
                  <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-3">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <h4 className="font-semibold text-ink group-hover:text-primary transition">
                    Meetup Monitor
                  </h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    Oversight of public activities and private meetup requests.
                  </p>
                </div>
                <span className="mt-4 text-xs font-semibold text-primary flex items-center gap-1">
                  View meetups <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition" />
                </span>
              </Link>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

function MetricCard({
  title,
  value,
  icon: Icon,
  note,
  color,
  bg,
}: {
  title: string;
  value: number;
  icon: any;
  note: string;
  color: string;
  bg: string;
}) {
  return (
    <div className="rounded-3xl bg-paper border border-border p-5 flex flex-col justify-between hover:border-border/80 transition">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground tracking-wide">
          {title}
        </span>
        <div className={`p-2 rounded-xl ${bg} ${color}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div className="mt-3 mb-1">
        <span className="text-3xl font-bold font-serif text-ink tracking-tight">
          {value.toLocaleString()}
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
        <TrendingUp className="w-3 h-3 text-emerald-500 inline" />
        {note}
      </p>
    </div>
  );
}
