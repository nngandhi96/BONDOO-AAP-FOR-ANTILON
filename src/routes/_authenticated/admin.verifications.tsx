import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listPendingVerifications, updateAdminUserVerification } from "@/lib/admin.functions";
import { AdminLayout } from "@/components/admin/admin-layout";
import {
  FileCheck2,
  Camera,
  Check,
  X,
  Shield,
  Clock,
  Sparkles,
  ExternalLink,
  ShieldAlert,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/verifications")({
  head: () => ({
    meta: [
      { title: "Verification Queue — Bondoo Admin" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminVerificationsPage,
});

function AdminVerificationsPage() {
  const queryClient = useQueryClient();
  const fetchPending = useServerFn(listPendingVerifications);
  const updateVerification = useServerFn(updateAdminUserVerification);

  const { data: queue, isLoading } = useQuery({
    queryKey: ["admin-pending-verifications"],
    queryFn: () => fetchPending(),
  });

  const mutation = useMutation({
    mutationFn: (data: {
      targetUserId: string;
      gov_id_verified?: boolean;
      selfie_verified?: boolean;
      background_check_status?: "pending" | "approved" | "failed";
    }) => updateVerification({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-pending-verifications"] });
      queryClient.invalidateQueries({ queryKey: ["admin-overview-stats"] });
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
  });

  return (
    <AdminLayout
      title="Verification Approval Queue"
      subtitle="Review pending identity documents, selfie biometric matches, and background screening requests."
      actions={
        <div className="text-xs font-semibold px-3.5 py-1.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" />
          <span>{queue?.length ?? 0} Pending Items</span>
        </div>
      }
    >
      <div className="space-y-6">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-pulse">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-44 bg-paper rounded-3xl border border-border" />
            ))}
          </div>
        ) : !queue || queue.length === 0 ? (
          <div className="p-16 text-center rounded-3xl bg-paper border border-border">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center mx-auto mb-3">
              <FileCheck2 className="w-6 h-6" />
            </div>
            <h3 className="font-serif font-bold text-lg text-ink">
              All caught up!
            </h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
              There are currently no pending identification documents or selfies waiting for manual moderator approval.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {queue.map((user: any) => (
              <div
                key={user.id}
                className="rounded-3xl bg-paper border border-border p-6 flex flex-col justify-between hover:border-border/80 transition"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-brand-orange/15 text-brand-orange flex items-center justify-center font-bold text-base shrink-0 border border-brand-orange/30">
                        {user.display_name?.slice(0, 1) || "U"}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <h4 className="font-semibold text-ink text-base">
                            {user.display_name || "Unnamed"}
                          </h4>
                          {user.pronouns && (
                            <span className="text-xs text-muted-foreground">
                              ({user.pronouns})
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {user.neighbourhood || "No neighbourhood specified"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-primary/10 text-primary border border-primary/20">
                        <Shield className="w-3 h-3" />
                        {user.trust_score ?? 0} pts
                      </span>
                      <Link
                        to="/user/$userId"
                        params={{ userId: user.id }}
                        target="_blank"
                        className="p-1.5 rounded-xl border border-border text-muted-foreground hover:text-ink hover:bg-background transition"
                        title="View Public Profile"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Link>
                    </div>
                  </div>

                  {user.bio && (
                    <p className="text-xs text-muted-foreground italic line-clamp-2 mb-4 bg-background/50 p-2.5 rounded-xl border border-border/50">
                      "{user.bio}"
                    </p>
                  )}

                  {/* Verification Items Checklist */}
                  <div className="space-y-3 pt-2 border-t border-border">
                    {/* Gov ID */}
                    <div className="flex items-center justify-between gap-2 p-2.5 rounded-2xl bg-background border border-border/60">
                      <div className="flex items-center gap-2">
                        <FileCheck2 className="w-4 h-4 text-emerald-500" />
                        <div>
                          <span className="text-xs font-semibold text-ink block">
                            Government ID
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {user.gov_id_verified ? "Approved (+25 pts)" : "Pending Admin Review"}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() =>
                            mutation.mutate({
                              targetUserId: user.id,
                              gov_id_verified: !user.gov_id_verified,
                            })
                          }
                          disabled={mutation.isPending}
                          className={`px-3 py-1 rounded-xl text-xs font-semibold flex items-center gap-1 transition ${
                            user.gov_id_verified
                              ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 hover:bg-destructive/10 hover:text-destructive"
                              : "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm"
                          }`}
                        >
                          {user.gov_id_verified ? (
                            <>
                              <Check className="w-3 h-3" /> Approved
                            </>
                          ) : (
                            <>
                              <Check className="w-3 h-3" /> Approve (+25)
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Selfie Verification */}
                    <div className="flex items-center justify-between gap-2 p-2.5 rounded-2xl bg-background border border-border/60">
                      <div className="flex items-center gap-2">
                        <Camera className="w-4 h-4 text-purple-500" />
                        <div>
                          <span className="text-xs font-semibold text-ink block">
                            Selfie / Liveness Match
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {user.selfie_verified ? "Passed (+15 pts)" : "Awaiting approval"}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() =>
                            mutation.mutate({
                              targetUserId: user.id,
                              selfie_verified: !user.selfie_verified,
                            })
                          }
                          disabled={mutation.isPending}
                          className={`px-3 py-1 rounded-xl text-xs font-semibold flex items-center gap-1 transition ${
                            user.selfie_verified
                              ? "bg-purple-500/10 text-purple-600 border border-purple-500/20 hover:bg-destructive/10 hover:text-destructive"
                              : "bg-purple-600 text-white hover:bg-purple-700 shadow-sm"
                          }`}
                        >
                          {user.selfie_verified ? (
                            <>
                              <Check className="w-3 h-3" /> Matched
                            </>
                          ) : (
                            <>
                              <Check className="w-3 h-3" /> Approve (+15)
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Background Screening */}
                    <div className="flex items-center justify-between gap-2 p-2.5 rounded-2xl bg-background border border-border/60">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-brand-orange" />
                        <div>
                          <span className="text-xs font-semibold text-ink block">
                            Background Screening
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            Status: <strong className="capitalize">{user.background_check_status}</strong> (+8 pts)
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() =>
                            mutation.mutate({
                              targetUserId: user.id,
                              background_check_status:
                                user.background_check_status === "approved" ? "pending" : "approved",
                            })
                          }
                          disabled={mutation.isPending}
                          className={`px-3 py-1 rounded-xl text-xs font-semibold flex items-center gap-1 transition ${
                            user.background_check_status === "approved"
                              ? "bg-brand-orange/10 text-brand-orange border border-brand-orange/20 hover:bg-destructive/10 hover:text-destructive"
                              : "bg-brand-orange text-white hover:opacity-90 shadow-sm"
                          }`}
                        >
                          {user.background_check_status === "approved" ? "Cleared" : "Clear Check (+8)"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
