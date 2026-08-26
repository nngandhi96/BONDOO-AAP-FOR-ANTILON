import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  listReports,
  updateReport,
  getReportStats,
  REPORT_STATUSES,
  REPORT_RESOLUTIONS,
  type ReportStatus,
  type ReportResolution,
} from "@/lib/admin.functions";
import { AdminLayout } from "@/components/admin/admin-layout";
import { ShieldAlert, CheckCircle2, Clock, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/reports")({
  head: () => ({
    meta: [
      { title: "Report Review — Bondoo Admin" },
      { name: "robots", content: "noindex, nofollow" },
    ],
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
  const listFn = useServerFn(listReports);
  const statsFn = useServerFn(getReportStats);

  const [filter, setFilter] = useState<ReportStatus | "all">("open");

  const { data: reports, isLoading } = useQuery({
    queryKey: ["admin-reports", filter],
    queryFn: () =>
      listFn({ data: filter === "all" ? {} : { status: filter } }),
  });

  const { data: stats } = useQuery({
    queryKey: ["admin-report-stats"],
    queryFn: () => statsFn(),
  });

  return (
    <AdminLayout
      title="Report Review & Moderation"
      subtitle="Investigate reported users, inappropriate behaviors, and apply administrative actions."
      actions={
        <div className="flex items-center gap-2">
          {REPORT_STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold capitalize transition ${
                filter === s
                  ? "bg-brand-orange text-white shadow-sm"
                  : "bg-paper border border-border text-muted-foreground hover:text-ink"
              }`}
            >
              {STATUS_LABEL[s]} ({stats?.[s] ?? 0})
            </button>
          ))}
          <button
            onClick={() => setFilter("all")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
              filter === "all"
                ? "bg-brand-orange text-white shadow-sm"
                : "bg-paper border border-border text-muted-foreground hover:text-ink"
            }`}
          >
            All
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        {isLoading ? (
          <div className="p-12 text-center text-sm text-muted-foreground animate-pulse">
            Loading safety reports…
          </div>
        ) : !reports || reports.length === 0 ? (
          <div className="p-16 text-center rounded-3xl bg-paper border border-border">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="font-serif font-bold text-lg text-ink">
              No reports in this category
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Select another filter or review all reports.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {reports.map((r) => (
              <ReportCard key={r.id} report={r} />
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
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
      qc.invalidateQueries({ queryKey: ["admin-overview-stats"] });
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
    <article className="rounded-3xl border border-border bg-paper p-6 shadow-sm hover:border-border/80 transition">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              {new Date(report.created_at).toLocaleString()} · Context: {report.context ?? "general"}
            </p>
          </div>
          <h2 className="font-serif font-bold mt-1 text-lg text-ink truncate">
            {report.reported?.display_name ?? "Unknown user"}{" "}
            <span className="text-muted-foreground text-xs font-normal">
              (Trust score: {report.reported?.trust_score ?? "—"})
            </span>
          </h2>
          <p className="text-xs text-ink/80 mt-1">
            Reported by{" "}
            <span className="font-semibold text-ink">
              {report.reporter?.display_name ?? "Anonymous"}
            </span>{" "}
            for reason: <span className="font-semibold text-destructive">{report.reason}</span>
          </p>
          {report.details && (
            <p className="mt-3 text-xs text-ink/70 whitespace-pre-wrap bg-background p-3 rounded-2xl border border-border">
              "{report.details}"
            </p>
          )}
        </div>
        <StatusPill status={report.status as ReportStatus} />
      </div>

      <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-xs uppercase tracking-wider text-brand-orange font-semibold hover:underline"
        >
          {open ? "▲ Hide Case Decision" : "▼ Review & Take Action →"}
        </button>
        {report.reviewed_at && (
          <span className="text-[10px] text-muted-foreground">
            Reviewed: {new Date(report.reviewed_at).toLocaleDateString()}
          </span>
        )}
      </div>

      {open && (
        <div className="mt-4 space-y-4 border-t border-border pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold block mb-1">
                Moderation Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ReportStatus)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-ink outline-none"
              >
                {REPORT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold block mb-1">
                Action Resolution
              </label>
              <select
                value={resolution}
                onChange={(e) => setResolution(e.target.value as ReportResolution | "")}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-ink outline-none"
              >
                <option value="">— Select action taken —</option>
                {REPORT_RESOLUTIONS.map((r) => (
                  <option key={r} value={r}>
                    {RESOLUTION_LABEL[r]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold block mb-1">
              Internal Moderator Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-ink outline-none"
              placeholder="Record any evidence, findings, or notes for other moderators..."
            />
          </div>

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
            className="w-full rounded-2xl bg-primary text-primary-foreground font-semibold text-xs py-2.5 disabled:opacity-40 hover:opacity-90 transition"
          >
            {mutation.isPending ? "Saving decision…" : "Save Moderation Decision"}
          </button>
        </div>
      )}
    </article>
  );
}

function StatusPill({ status }: { status: ReportStatus }) {
  const styles: Record<ReportStatus, string> = {
    open: "bg-destructive/10 text-destructive border border-destructive/20",
    under_review: "bg-primary/10 text-primary border border-primary/20",
    action_taken: "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20",
    dismissed: "bg-muted text-muted-foreground border border-border",
  };
  return (
    <span
      className={`shrink-0 rounded-full px-3 py-1 text-[10px] uppercase tracking-wider font-bold ${styles[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}