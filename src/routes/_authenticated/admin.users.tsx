import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAdminUsers, updateAdminUserVerification } from "@/lib/admin.functions";
import { AdminLayout } from "@/components/admin/admin-layout";
import {
  Search,
  CheckCircle2,
  XCircle,
  Shield,
  Smartphone,
  FileCheck2,
  Camera,
  ExternalLink,
  Filter,
  UserCheck,
  Sparkles,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/users")({
  head: () => ({
    meta: [
      { title: "User Management — Bondoo Admin" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminUsersPage,
});

function AdminUsersPage() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "verified" | "unverified">("all");
  const queryClient = useQueryClient();

  const fetchUsers = useServerFn(listAdminUsers);
  const updateVerification = useServerFn(updateAdminUserVerification);

  const { data: users, isLoading } = useQuery({
    queryKey: ["admin-users", search, filter],
    queryFn: () => fetchUsers({ data: { search, filter } }),
  });

  const mutation = useMutation({
    mutationFn: (data: {
      targetUserId: string;
      phone_verified?: boolean;
      gov_id_verified?: boolean;
      selfie_verified?: boolean;
      background_check_status?: "pending" | "approved" | "failed";
    }) => updateVerification({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-overview-stats"] });
    },
  });

  return (
    <AdminLayout
      title="User Management"
      subtitle="Search community members, inspect trust scores, and manually moderate verification levels."
      actions={
        <div className="text-xs text-muted-foreground font-semibold flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-paper border border-border">
          <UserCheck className="w-4 h-4 text-brand-orange" />
          <span>{users?.length ?? 0} Users Loaded</span>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Search & Filter Bar */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by name, neighborhood, or bio..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-paper border border-border text-sm text-ink placeholder:text-muted-foreground outline-none focus:border-brand-orange focus:ring-4 focus:ring-brand-orange/10 transition"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground hidden sm:inline" />
            {(["all", "verified", "unverified"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold capitalize transition ${
                  filter === f
                    ? "bg-brand-orange text-white shadow-sm"
                    : "bg-paper border border-border text-muted-foreground hover:text-ink"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Users Table */}
        <div className="rounded-3xl bg-paper border border-border overflow-hidden shadow-sm">
          {isLoading ? (
            <div className="p-12 text-center text-sm text-muted-foreground animate-pulse">
              Loading users directory…
            </div>
          ) : !users || users.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-sm font-semibold text-ink">No users found</p>
              <p className="text-xs text-muted-foreground mt-1">
                Try refining your search query or reset the filter.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border bg-background/50 text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">
                    <th className="py-3.5 px-4">User</th>
                    <th className="py-3.5 px-4">Trust Score</th>
                    <th className="py-3.5 px-4">Phone</th>
                    <th className="py-3.5 px-4">Gov ID</th>
                    <th className="py-3.5 px-4">Selfie</th>
                    <th className="py-3.5 px-4">Background</th>
                    <th className="py-3.5 px-4">Role</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {users.map((u: any) => {
                    const isMod = u.roles?.includes("moderator");
                    const isAdmin = u.roles?.includes("admin");

                    return (
                      <tr key={u.id} className="hover:bg-background/40 transition">
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-brand-orange/15 text-brand-orange flex items-center justify-center font-bold text-sm shrink-0 border border-brand-orange/30">
                              {u.display_name?.slice(0, 1) || "U"}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-ink text-sm">
                                  {u.display_name || "Unnamed User"}
                                </span>
                                {u.pronouns && (
                                  <span className="text-[10px] text-muted-foreground">
                                    ({u.pronouns})
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-muted-foreground line-clamp-1 max-w-xs">
                                {u.neighbourhood || "No location set"}
                              </p>
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-primary/10 text-primary border border-primary/20">
                            <Shield className="w-3 h-3" />
                            {u.trust_score ?? 0} / 100
                          </span>
                        </td>

                        <td className="py-3.5 px-4">
                          <button
                            onClick={() =>
                              mutation.mutate({
                                targetUserId: u.id,
                                phone_verified: !u.phone_verified,
                              })
                            }
                            disabled={mutation.isPending}
                            title="Click to toggle phone verification"
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold transition ${
                              u.phone_verified
                                ? "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20"
                                : "bg-muted text-muted-foreground hover:bg-muted/80"
                            }`}
                          >
                            <Smartphone className="w-3 h-3" />
                            {u.phone_verified ? "Yes" : "No"}
                          </button>
                        </td>

                        <td className="py-3.5 px-4">
                          <button
                            onClick={() =>
                              mutation.mutate({
                                targetUserId: u.id,
                                gov_id_verified: !u.gov_id_verified,
                              })
                            }
                            disabled={mutation.isPending}
                            title="Click to toggle Gov ID verification"
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold transition ${
                              u.gov_id_verified
                                ? "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20"
                                : "bg-muted text-muted-foreground hover:bg-muted/80"
                            }`}
                          >
                            <FileCheck2 className="w-3 h-3" />
                            {u.gov_id_verified ? "Approved" : "Pending"}
                          </button>
                        </td>

                        <td className="py-3.5 px-4">
                          <button
                            onClick={() =>
                              mutation.mutate({
                                targetUserId: u.id,
                                selfie_verified: !u.selfie_verified,
                              })
                            }
                            disabled={mutation.isPending}
                            title="Click to toggle Selfie verification"
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold transition ${
                              u.selfie_verified
                                ? "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20"
                                : "bg-muted text-muted-foreground hover:bg-muted/80"
                            }`}
                          >
                            <Camera className="w-3 h-3" />
                            {u.selfie_verified ? "Matched" : "Pending"}
                          </button>
                        </td>

                        <td className="py-3.5 px-4">
                          <select
                            value={u.background_check_status ?? "pending"}
                            onChange={(e) =>
                              mutation.mutate({
                                targetUserId: u.id,
                                background_check_status: e.target.value as any,
                              })
                            }
                            disabled={mutation.isPending}
                            className={`text-[11px] font-semibold rounded-lg px-2 py-1 bg-background border border-border outline-none ${
                              u.background_check_status === "approved"
                                ? "text-emerald-600 border-emerald-500/30"
                                : u.background_check_status === "failed"
                                  ? "text-destructive border-destructive/30"
                                  : "text-muted-foreground"
                            }`}
                          >
                            <option value="pending">Pending</option>
                            <option value="approved">Approved</option>
                            <option value="failed">Failed</option>
                          </select>
                        </td>

                        <td className="py-3.5 px-4">
                          {isAdmin ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-brand-orange/20 text-brand-orange uppercase">
                              Admin
                            </span>
                          ) : isMod ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-500 uppercase">
                              Mod
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-[11px]">Member</span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <Link
                            to="/user/$userId"
                            params={{ userId: u.id }}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-background border border-border text-xs font-semibold text-ink hover:border-brand-orange hover:text-brand-orange transition"
                          >
                            Profile <ExternalLink className="w-3 h-3" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
