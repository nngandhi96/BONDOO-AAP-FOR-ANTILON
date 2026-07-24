import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  getMyAdminRole,
  listReports,
  updateReport,
  getReportStats,
  REPORT_STATUSES,
  REPORT_RESOLUTIONS,
  type ReportStatus,
  type ReportResolution,
} from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/reports")({
  head: () => ({
    meta: [{ title: "Report review — Bondoo Admin" }, { name: "robots", content: "noindex" }],
  }),
  component: AdminReportsPage,
});

const STATUS_LABEL: Record<ReportStatus, string> = {
  open: "Open",
  under_review: "Under review",
  action_taken: "Action taken",
  dismissed: "Dismissed",
};

const RESOLUTION_LABEL: Record<ReportResolution, string> = {
  warning: "Warning issued",
  account_suspended: "Account suspended",
  account_banned: "Account banned",
  no_action: "No action needed",
  duplicate: "Duplicate report",
};

function AdminReportsPage() {
  const navigate = useNavigate();
  const roleFn = useServerFn(getMyAdminRole);
  const listFn = useServerFn(listReports);
  const statsFn = useServerFn(getReportStats);

  const { data: role, isLoading: roleLoading } = useQuery({
    queryKey: ["admin-role"],
    queryFn: () => roleFn(),
  });

  const [filter, setFilter] = useState<ReportStatus | "all">("open");

  const { data: reports, isLoading } = useQuery({
    queryKey: ["admin-reports", filter],
    queryFn: () =>
      listFn({ data: filter === "all" ? {} : { status: filter } }),
    enabled: !!role?.canReview,
  });

  const { data: stats } = useQuery({
    queryKey: ["admin-report-stats"],
    queryFn: () => statsFn(),
    enabled: !!role?.canReview,
  });

  useEffect(() => {
    if (!roleLoading && role && !role.canReview) {
      navigate({ to: "/dashboard", replace: true });
    }
  }, [role, roleLoading, navigate]);

  if (roleLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Checking access…</div>;
  }
  if (!role?.canReview) {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        You don't have access to this page.
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-background pb-20">
      <header className="border-b border-border bg-paper">
        <div className="mx-auto max-w-4xl px-6 py-6">
          <p className="text-[11px] uppercase tracking-[0.22em] text-brand-orange font-semibold">
            Bondoo · Admin
          </p>
          <h1 className="display mt-1 text-3xl text-ink">Report review</h1>

          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2">
            {REPORT_STATUSES.map((s) => (
              <StatCard
                key={s}
                label={STATUS_LABEL[s]}
                value={stats?.[s] ?? 0}
                active={filter === s}
                onClick={() => setFilter(s)}
              />
            ))}
          </div>
          <div className="mt-2">
            <button
              onClick={() => setFilter("all")}
              className={`text-[11px] uppercase tracking-[0.22em] font-semibold ${
                filter === "all" ? "text-brand-orange" : "text-muted-foreground"
              }`}
            >
              Show all
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-6 py-6 space-y-4">
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && (reports?.length ?? 0) === 0 && (
          <p className="text-sm text-muted-foreground">No reports in this bucket.</p>
        )}
        {reports?.map((r) => <ReportCard key={r.id} report={r} />)}
      </section>
    </main>
  );
}

function StatCard({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-2xl border p-3 text-left transition ${
        active
          ? "border-brand-orange bg-brand-orange/10"
          : "border-border bg-background hover:bg-surface"
      }`}
    >
      <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
        {label}
      </p>
      <p className="display mt-1 text-2xl text-ink">{value}</p>
    </button>
  );
}

type ReportRow = Awaited<ReturnType<typeof listReports>>[number];

function ReportCard({ report }: { report: ReportRow }) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateReport);
  const mutation = useMutation({
    mutationFn: updateFn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-reports"] });
      qc.invalidateQueries({ queryKey: ["admin-report-stats"] });
    },
  });

  const [status, setStatus] = useState<ReportStatus>(report.status as ReportStatus);
  const [resolution, setResolution] = useState<ReportResolution | "">(
    (report.resolution as ReportResolution) ?? "",
  );
  const [notes, setNotes] = useState(report.admin_notes ?? "");
  const [open, setOpen] = useState(false);

  const dirty =
    status !== report.status ||
    (resolution || null) !== (report.resolution ?? null) ||
    notes !== (report.admin_notes ?? "");

  return (
    <article className="rounded-3xl border border-border bg-paper p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
            {new Date(report.created_at).toLocaleString()} · {report.context ?? "app"}
          </p>
          <h2 className="display mt-1 text-lg text-ink truncate">
            {report.reported?.display_name ?? "Unknown user"}{" "}
            <span className="text-muted-foreground text-sm">
              (Trust {report.reported?.trust_score ?? "—"})
            </span>
          </h2>
          <p className="text-sm text-ink/80 mt-1">
            Reported by{" "}
            <span className="text-ink">
              {report.reporter?.display_name ?? "—"}
            </span>{" "}
            for <span className="font-medium">{report.reason}</span>
          </p>
          {report.details && (
            <p className="mt-2 text-sm text-ink/70 whitespace-pre-wrap">
              "{report.details}"
            </p>
          )}
        </div>
        <StatusPill status={report.status as ReportStatus} />
      </div>

      <button
        onClick={() => setOpen((v) => !v)}
        className="mt-4 text-[11px] uppercase tracking-[0.22em] text-brand-orange font-semibold"
      >
        {open ? "Hide review" : "Review case →"}
      </button>

      {open && (
        <div className="mt-4 space-y-3 border-t border-border pt-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold mb-1">
              Status
            </p>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as ReportStatus)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            >
              {REPORT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold mb-1">
              Resolution
            </p>
            <select
              value={resolution}
              onChange={(e) => setResolution(e.target.value as ReportResolution | "")}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">—</option>
              {REPORT_RESOLUTIONS.map((r) => (
                <option key={r} value={r}>
                  {RESOLUTION_LABEL[r]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold mb-1">
              Admin notes (internal)
            </p>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
              placeholder="What did you observe? What action was taken?"
            />
          </div>

          {report.reviewed_at && (
            <p className="text-[11px] text-muted-foreground">
              Last reviewed {new Date(report.reviewed_at).toLocaleString()}
            </p>
          )}

          <button
            disabled={!dirty || mutation.isPending}
            onClick={() =>
              mutation.mutate({
                data: {
                  reportId: report.id,
                  status,
                  resolution: resolution || null,
                  adminNotes: notes || null,
                },
              })
            }
            className="w-full rounded-2xl bg-primary text-primary-foreground font-medium py-3 disabled:opacity-40"
          >
            {mutation.isPending ? "Saving…" : "Save decision"}
          </button>
        </div>
      )}
    </article>
  );
}

function StatusPill({ status }: { status: ReportStatus }) {
  const styles: Record<ReportStatus, string> = {
    open: "bg-brand-orange/15 text-brand-orange",
    under_review: "bg-primary/15 text-primary",
    action_taken: "bg-emerald-100 text-emerald-700",
    dismissed: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={`shrink-0 rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.2em] font-semibold ${styles[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}