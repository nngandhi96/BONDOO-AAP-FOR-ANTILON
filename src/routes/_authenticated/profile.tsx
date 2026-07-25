import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BondooEyes } from "@/components/bondoo-logo";
import { getMyProfile, updateMyProfile } from "@/lib/profile.functions";
import { getMyAdminRole } from "@/lib/admin.functions";
import { deleteMyAccount } from "@/lib/account.functions";
import { markVerificationStep } from "@/lib/verification.functions";
import { supabase } from "@/integrations/supabase/client";
import { GovIdUpload } from "@/components/gov-id-upload";
import { AvatarUpload } from "@/components/avatar-upload";
import { NotificationsToggle } from "@/components/notifications-toggle";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Your profile · Bondoo" },
      { name: "description", content: "Trust score, verifications, and details." },
    ],
  }),
  component: Profile,
});

type ProfileRow = {
  id: string;
  display_name: string;
  pronouns: string;
  neighbourhood: string;
  bio: string;
  phone_verified: boolean;
  gov_id_verified: boolean;
  selfie_verified: boolean;
  background_check_status: "pending" | "approved" | "failed";
  community_reviews_count: number;
  attended_meets_count: number;
  trust_score: number;
  gov_id_path: string | null;
  avatar_url?: string | null;
};

function buildTrust(p: ProfileRow) {
  return [
    {
      label: "Mobile verified",
      points: p.phone_verified ? 20 : 0,
      max: 20,
      done: p.phone_verified,
      note: p.phone_verified ? "OTP confirmed" : "Verify to earn +20",
    },
    {
      label: "Government ID",
      points: p.gov_id_verified ? 25 : 0,
      max: 25,
      done: p.gov_id_verified,
      note: p.gov_id_verified ? "Approved" : "Upload to earn +25",
    },
    {
      label: "Selfie match",
      points: p.selfie_verified ? 15 : 0,
      max: 15,
      done: p.selfie_verified,
      note: p.selfie_verified ? "Passed liveness" : "Not started",
    },
    {
      label: "Community reviews",
      points: Math.min(p.community_reviews_count * 3, 18),
      max: 18,
      done: p.community_reviews_count > 0,
      note: `${p.community_reviews_count} kind mentions`,
    },
    {
      label: "Attended meets",
      points: Math.min(p.attended_meets_count * 2, 14),
      max: 14,
      done: p.attended_meets_count > 0,
      note: `${p.attended_meets_count} meets attended`,
    },
    {
      label: "Background check",
      points: p.background_check_status === "approved" ? 8 : 0,
      max: 8,
      done: p.background_check_status === "approved",
      note:
        p.background_check_status === "approved"
          ? "Cleared"
          : p.background_check_status === "failed"
            ? "Failed"
            : "Pending",
    },
  ];
}

function Profile() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchProfile = useServerFn(getMyProfile);
  const saveProfile = useServerFn(updateMyProfile);
  const fetchAdminRole = useServerFn(getMyAdminRole);
  const runDeleteAccount = useServerFn(deleteMyAccount);
  const runVerify = useServerFn(markVerificationStep);
  const verifyMutation = useMutation({
    mutationFn: (step: "phone" | "selfie" | "background") =>
      runVerify({ data: { step } }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["profile", "me"] }),
  });
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const deleteMutation = useMutation({
    mutationFn: () => runDeleteAccount(),
    onSuccess: async () => {
      await supabase.auth.signOut();
      queryClient.clear();
      navigate({ to: "/auth", replace: true });
    },
  });
  const { data: adminRole } = useQuery({
    queryKey: ["admin-role"],
    queryFn: () => fetchAdminRole(),
  });

  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile", "me"],
    queryFn: () => fetchProfile(),
  });

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [neighbourhood, setNeighbourhood] = useState("");
  const [pronouns, setPronouns] = useState("");

  useEffect(() => {
    if (!profile) return;
    setName(profile.display_name ?? "");
    setBio(profile.bio ?? "");
    setNeighbourhood(profile.neighbourhood ?? "");
    setPronouns(profile.pronouns ?? "");
  }, [profile]);

  const mutation = useMutation({
    mutationFn: () =>
      saveProfile({
        data: {
          display_name: name,
          pronouns,
          neighbourhood,
          bio,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile", "me"] });
      setEditing(false);
    },
  });

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  if (isLoading || !profile) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading your profile…</p>
      </main>
    );
  }

  const trust = buildTrust(profile as ProfileRow);
  const total = profile.trust_score ?? 0;
  const max = 100;
  const pct = Math.round((total / max) * 100);

  return (
    <main className="min-h-screen bg-background pb-24">
      {/* Masthead */}
      <header className="max-w-md mx-auto px-6 pt-8">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.24em] text-muted-foreground font-semibold">
          <Link to="/dashboard" className="text-primary">← Back</Link>
          <span>Vol. 01 — You</span>
        </div>

        <div className="mt-5 flex items-end justify-between border-b border-ink/80 pb-5">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.2em] text-brand-orange font-semibold">
              Member since Jul '26
            </p>
            <h1 className="display text-[2.4rem] leading-[0.95] text-ink mt-1 truncate">
              {name || "Your name"}<span className="text-brand-orange">.</span>
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">
              {pronouns || "—"} · {neighbourhood || "Add your neighbourhood"}
            </p>
          </div>
          <div className="shrink-0 h-16 w-16 rounded-full bg-paper border border-border overflow-hidden flex items-center justify-center">
            {(profile as ProfileRow).avatar_url ? (
              <img
                src={(profile as ProfileRow).avatar_url ?? ""}
                alt="Your profile photo"
                className="h-full w-full object-cover"
              />
            ) : (
              <BondooEyes className="h-6" />
            )}
          </div>
        </div>
      </header>

      <section className="max-w-md mx-auto px-6 pt-6 space-y-6">
        <article className="rounded-3xl bg-paper border border-border p-6">
          <AvatarUpload
            userId={profile.id}
            currentUrl={(profile as ProfileRow).avatar_url ?? null}
            displayName={profile.display_name}
          />
        </article>

        <NotificationsToggle />

        {/* Trust Score card */}
        <article className="rounded-3xl bg-paper border border-border p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-brand-orange font-semibold">
                Trust score
              </p>
              <p className="display text-6xl text-ink leading-none mt-2">
                {total}
                <span className="text-2xl text-muted-foreground">/{max}</span>
              </p>
            </div>
            <span className="display italic text-primary text-lg mt-2">
              {pct >= 90 ? "Excellent" : pct >= 60 ? "Strong" : pct >= 30 ? "Building" : "New"}
            </span>
          </div>

          {/* progress bar */}
          <div className="mt-5 h-2 rounded-full bg-surface overflow-hidden">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${pct}%` }}
            />
          </div>

          <ul className="mt-5 divide-y divide-border">
            {trust.map((f) => (
              <li key={f.label} className="py-3 flex items-center gap-3">
                <span
                  className={`h-6 w-6 rounded-full flex items-center justify-center text-xs shrink-0 ${
                    f.done
                      ? "bg-primary text-primary-foreground"
                      : "bg-surface text-muted-foreground border border-border"
                  }`}
                >
                  {f.done ? "✓" : "•"}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-ink font-medium truncate">{f.label}</p>
                  <p className="text-xs text-muted-foreground truncate">{f.note}</p>
                </div>
                <span className="display italic text-sm text-ink shrink-0">
                  +{f.points}
                  <span className="text-muted-foreground">/{f.max}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[11px] text-muted-foreground leading-relaxed">
            Trust score is calculated on the server from your verifications and activity. You can't edit it directly — complete verifications to earn points.
          </p>
        </article>

        {/* Verification status */}
        <article className="rounded-3xl bg-paper border border-border p-6">
          <p className="text-[10px] uppercase tracking-[0.22em] text-brand-orange font-semibold">
            Verification
          </p>
          <h2 className="display text-2xl text-ink mt-1">
            Your status<span className="text-primary">.</span>
          </h2>

          <ul className="mt-4 space-y-3 text-sm">
            {(
              [
                {
                  label: "Mobile OTP",
                  note: profile.phone_verified ? "Verified" : "Not started",
                  ok: profile.phone_verified,
                  action: profile.phone_verified
                    ? null
                    : { kind: "verify" as const, step: "phone" as const, cta: "Verify" },
                },
                {
                  label: "Government ID",
                  note: profile.gov_id_verified ? "Approved" : "Not uploaded",
                  ok: profile.gov_id_verified,
                  action: profile.gov_id_verified
                    ? null
                    : { kind: "scroll" as const, target: "gov-id-section", cta: "Upload" },
                },
                {
                  label: "Selfie match",
                  note: profile.selfie_verified ? "Passed liveness" : "Not started",
                  ok: profile.selfie_verified,
                  action: profile.selfie_verified
                    ? null
                    : { kind: "verify" as const, step: "selfie" as const, cta: "Start" },
                },
                {
                  label: "Background check",
                  note: profile.background_check_status,
                  ok: profile.background_check_status === "approved",
                  action:
                    profile.background_check_status === "approved"
                      ? null
                      : { kind: "verify" as const, step: "background" as const, cta: "Request" },
                },
              ]
            ).map((row) => (
              <li
                key={row.label}
                className="flex items-center justify-between gap-3 pb-3 border-b border-border last:border-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="text-ink font-medium">{row.label}</p>
                  <p className="text-xs text-muted-foreground">{row.note}</p>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  <span
                    className={`text-[10px] uppercase tracking-[0.18em] font-semibold px-2.5 py-1 rounded-full ${
                      row.ok
                        ? "bg-primary/10 text-primary"
                        : "bg-brand-orange/15 text-brand-orange"
                    }`}
                  >
                    {row.ok ? "Verified" : "Pending"}
                  </span>
                  {row.action && (
                    <button
                      onClick={() => {
                        if (row.action!.kind === "verify") {
                          verifyMutation.mutate(row.action!.step);
                        } else {
                          document
                            .getElementById(row.action!.target)
                            ?.scrollIntoView({ behavior: "smooth", block: "start" });
                        }
                      }}
                      disabled={verifyMutation.isPending}
                      className="text-[11px] uppercase tracking-[0.16em] font-semibold px-3 py-1 rounded-full bg-primary text-primary-foreground disabled:opacity-50"
                    >
                      {verifyMutation.isPending ? "…" : row.action.cta}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[11px] text-muted-foreground leading-relaxed">
            Demo flow: taps mark steps as verified so you can preview the Trust Score updating. Real OTP / liveness / background check will replace these later.
          </p>
        </article>

        <div id="gov-id-section">
          <GovIdUpload
            userId={profile.id}
            currentPath={(profile as ProfileRow).gov_id_path ?? null}
          />
        </div>

        {/* Editable details */}
        <article className="rounded-3xl bg-paper border border-border p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-brand-orange font-semibold">
                About you
              </p>
              <h2 className="display text-2xl text-ink mt-1">
                A few <em className="text-primary not-italic">details</em>
              </h2>
            </div>
            <button
              onClick={() => {
                if (editing) {
                  mutation.mutate();
                } else {
                  setEditing(true);
                }
              }}
              disabled={mutation.isPending}
              className="text-sm font-medium text-primary"
            >
              {editing ? (mutation.isPending ? "Saving…" : "Save") : "Edit"}
            </button>
          </div>

          {mutation.isError && (
            <p className="mt-3 text-sm text-destructive">
              Couldn't save. Try again.
            </p>
          )}

          <div className="mt-5 space-y-4">
            <Field
              label="Display name"
              value={name}
              onChange={setName}
              editing={editing}
            />
            <Field
              label="Pronouns"
              value={pronouns}
              onChange={setPronouns}
              editing={editing}
            />
            <Field
              label="Neighbourhood"
              value={neighbourhood}
              onChange={setNeighbourhood}
              editing={editing}
            />
            <Field
              label="Short bio"
              value={bio}
              onChange={setBio}
              editing={editing}
              multiline
            />
          </div>
        </article>

        {/* Interests */}
        <article className="rounded-3xl bg-paper border border-border p-6">
          <p className="text-[10px] uppercase tracking-[0.22em] text-brand-orange font-semibold">
            Open to
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {["Evening walks", "Slow coffee", "Reading hours", "Weekend cycling", "Bookstores"].map(
              (t) => (
                <span
                  key={t}
                  className="display italic px-3.5 py-1.5 rounded-full text-sm bg-background border border-border text-ink"
                >
                  {t}
                </span>
              ),
            )}
          </div>
        </article>

        {adminRole?.canReview && (
          <Link
            to="/admin/reports"
            className="block w-full text-center rounded-2xl bg-paper border border-border py-3 text-sm font-medium text-brand-orange"
          >
            Admin · Report review
          </Link>
        )}

        <button
          onClick={handleSignOut}
          className="w-full text-sm text-muted-foreground py-2"
        >
          Sign out
        </button>

        <div className="pt-2 flex justify-center gap-6 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          <Link to="/terms" className="hover:text-ink">
            Terms
          </Link>
          <Link to="/privacy" className="hover:text-ink">
            Privacy
          </Link>
        </div>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          Bondoo is a proprietary product/unit of MAKE MY VASH (MMV).
        </p>

        <div className="pt-6 mt-6 border-t border-border">
          <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold mb-2">
            Danger zone
          </p>
          <button
            onClick={() => { setConfirmingDelete(true); setDeleteText(""); }}
            className="w-full text-sm font-medium text-destructive py-3 rounded-2xl border border-destructive/30 hover:bg-destructive/5 transition"
          >
            Delete my account
          </button>
          <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
            Permanently removes your profile, photo, ID upload, chats, meetups, connections, and login. This cannot be undone.
          </p>
        </div>
      </section>

      {confirmingDelete && (
        <div className="fixed inset-0 z-50 bg-ink/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-md bg-background rounded-3xl border border-border p-6 shadow-2xl">
            <h2 className="font-serif text-2xl text-ink">Delete account?</h2>
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
              This erases your Bondoo profile, uploaded photo &amp; Gov-ID, chats, meetups, connections, and sign-in — everywhere. It can't be undone.
            </p>
            <label className="block mt-5">
              <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-semibold">
                Type <span className="text-destructive">DELETE</span> to confirm
              </span>
              <input
                autoFocus
                value={deleteText}
                onChange={(e) => setDeleteText(e.target.value)}
                className="mt-2 w-full rounded-xl bg-paper border border-border px-3.5 py-2.5 text-ink outline-none focus:border-destructive focus:ring-4 focus:ring-destructive/10 transition"
              />
            </label>
            {deleteMutation.isError && (
              <p className="mt-3 text-xs text-destructive">
                {(deleteMutation.error as Error).message || "Something went wrong. Try again."}
              </p>
            )}
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setConfirmingDelete(false)}
                disabled={deleteMutation.isPending}
                className="flex-1 rounded-2xl border border-border py-3 text-sm font-medium text-ink"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate()}
                disabled={deleteText !== "DELETE" || deleteMutation.isPending}
                className="flex-1 rounded-2xl bg-destructive text-destructive-foreground py-3 text-sm font-semibold disabled:opacity-40"
              >
                {deleteMutation.isPending ? "Deleting…" : "Delete forever"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  editing,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  editing: boolean;
  multiline?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-semibold">
        {label}
      </span>
      {editing ? (
        multiline ? (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={3}
            className="mt-2 w-full rounded-xl bg-background border border-border px-3.5 py-2.5 text-ink outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition resize-none"
          />
        ) : (
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="mt-2 w-full rounded-xl bg-background border border-border px-3.5 py-2.5 text-ink outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition"
          />
        )
      ) : (
        <p className="mt-1 text-ink leading-snug">{value}</p>
      )}
    </label>
  );
}
