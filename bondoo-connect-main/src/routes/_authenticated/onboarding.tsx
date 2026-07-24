import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BondooEyes } from "@/components/bondoo-logo";
import { GovIdUpload } from "@/components/gov-id-upload";
import {
  completeOnboarding,
  getMyProfile,
  updateMyProfile,
} from "@/lib/profile.functions";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({
    meta: [
      { title: "Welcome to Bondoo · Get set up" },
      {
        name: "description",
        content:
          "Set up your Bondoo profile, verify your ID, and agree to safety guidelines.",
      },
    ],
  }),
  component: Onboarding,
});

type Step = 0 | 1 | 2;
const STEP_LABELS = ["About you", "Government ID", "Safety pact"] as const;

function Onboarding() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchProfile = useServerFn(getMyProfile);
  const saveProfile = useServerFn(updateMyProfile);
  const finish = useServerFn(completeOnboarding);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile", "me"],
    queryFn: () => fetchProfile(),
  });

  const [step, setStep] = useState<Step>(0);
  const [name, setName] = useState("");
  const [pronouns, setPronouns] = useState("");
  const [neighbourhood, setNeighbourhood] = useState("");
  const [bio, setBio] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [interests, setInterests] = useState<string[]>([]);

  useEffect(() => {
    if (!profile || hydrated) return;
    setName(profile.display_name ?? "");
    setPronouns(profile.pronouns ?? "");
    setNeighbourhood(profile.neighbourhood ?? "");
    setBio(profile.bio ?? "");
    setInterests(((profile.interests ?? []) as string[]) || []);
    setHydrated(true);
  }, [profile, hydrated]);

  // Already onboarded — go home.
  useEffect(() => {
    if (profile?.onboarded_at) {
      navigate({ to: "/dashboard", replace: true });
    }
  }, [profile, navigate]);

  const saveMutation = useMutation({
    mutationFn: () =>
      saveProfile({
        data: {
          display_name: name.trim(),
          pronouns: pronouns.trim(),
          neighbourhood: neighbourhood.trim(),
          bio: bio.trim(),
          interests,
        },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["profile", "me"] }),
  });

  const finishMutation = useMutation({
    mutationFn: () => finish({}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile", "me"] });
      navigate({ to: "/dashboard", replace: true });
    },
  });

  if (isLoading || !profile) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Setting things up…</p>
      </main>
    );
  }

  const canContinueStep0 = name.trim().length >= 2 && neighbourhood.trim().length >= 2;
  const hasGovId = Boolean(profile.gov_id_path);

  async function next() {
    if (step === 0) {
      if (!canContinueStep0) return;
      await saveMutation.mutateAsync();
      setStep(1);
      return;
    }
    if (step === 1) {
      setStep(2);
      return;
    }
    if (step === 2) {
      if (!agreed) return;
      await finishMutation.mutateAsync();
    }
  }

  return (
    <main className="min-h-screen bg-background pb-24">
      <header className="max-w-md mx-auto px-6 pt-8">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.24em] text-muted-foreground font-semibold">
          <span>Welcome</span>
          <span>
            Step {step + 1} of 3
          </span>
        </div>

        <div className="mt-5 flex items-end justify-between border-b border-ink/80 pb-5">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.2em] text-brand-orange font-semibold">
              {STEP_LABELS[step]}
            </p>
            <h1 className="display text-[2.4rem] leading-[0.95] text-ink mt-1">
              {step === 0 && (
                <>Say <em className="text-primary not-italic">hello</em>.</>
              )}
              {step === 1 && (
                <>Prove it's <em className="text-primary not-italic">you</em>.</>
              )}
              {step === 2 && (
                <>Meet <em className="text-primary not-italic">kindly</em>.</>
              )}
            </h1>
          </div>
          <div className="shrink-0 h-14 w-14 rounded-full bg-paper border border-border flex items-center justify-center">
            <BondooEyes className="h-5" />
          </div>
        </div>

        {/* progress bar */}
        <div className="mt-5 flex gap-2">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={`h-1 flex-1 rounded-full transition ${
                i <= step ? "bg-primary" : "bg-surface"
              }`}
            />
          ))}
        </div>
      </header>

      <section className="max-w-md mx-auto px-6 pt-6 space-y-5">
        {step === 0 && (
          <article className="rounded-3xl bg-paper border border-border p-6 space-y-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Your neighbours will see this. Keep it friendly — no last names,
              phone numbers, or addresses.
            </p>
            <OnbField label="Display name" value={name} onChange={setName} placeholder="Aarav S." />
            <OnbField
              label="Pronouns"
              value={pronouns}
              onChange={setPronouns}
              placeholder="she/her, he/him, they/them"
            />
            <OnbField
              label="Neighbourhood"
              value={neighbourhood}
              onChange={setNeighbourhood}
              placeholder="Indiranagar, Bengaluru"
            />
            <OnbField label="Short bio" value={bio} onChange={setBio} multiline placeholder="Slow walker, book nerd, always up for coffee." />
            <div>
              <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-semibold">
                Interests <span className="normal-case tracking-normal text-muted-foreground/70">(pick a few)</span>
              </span>
              <div className="mt-2 flex flex-wrap gap-2">
                {["Coffee & Chat", "Walk", "Study", "Sports", "Food", "Music", "Books", "Movies", "Art", "Nature"].map((tag) => {
                  const on = interests.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() =>
                        setInterests((cur) =>
                          cur.includes(tag)
                            ? cur.filter((t) => t !== tag)
                            : cur.length < 10
                              ? [...cur, tag]
                              : cur,
                        )
                      }
                      className={`px-3 py-1.5 rounded-full text-xs border transition ${
                        on
                          ? "bg-brand-orange border-brand-orange text-ink font-semibold"
                          : "bg-background border-border text-ink hover:bg-surface"
                      }`}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </div>
            {saveMutation.isError && (
              <p className="text-sm text-destructive">Couldn't save. Try again.</p>
            )}
          </article>
        )}

        {step === 1 && (
          <>
            <GovIdUpload
              userId={profile.id}
              currentPath={profile.gov_id_path ?? null}
            />
            <p className="text-xs text-muted-foreground text-center leading-relaxed">
              You can skip this for now and add it later from your profile —
              but a verified ID unlocks +25 on your Trust Score and access to
              higher-trust meets.
            </p>
          </>
        )}

        {step === 2 && (
          <article className="rounded-3xl bg-paper border border-border p-6">
            <p className="text-[10px] uppercase tracking-[0.22em] text-brand-orange font-semibold">
              A quick pact
            </p>
            <h2 className="display text-2xl text-ink mt-1 leading-tight">
              Bondoo works because we all show up{" "}
              <em className="text-primary not-italic">kindly</em>.
            </h2>

            <ul className="mt-5 space-y-4 text-sm">
              {[
                ["📍", "I will meet in public places only — parks, cafés, libraries."],
                ["🕒", "I will tell a friend where I'm going and when."],
                ["🚫", "Bondoo is not a dating app. I'll keep things friendly."],
                ["🙅", "I will not share phone numbers, addresses, or money."],
                ["🛟", "I will use SOS if I feel unsafe."],
              ].map(([icon, text]) => (
                <li
                  key={text}
                  className="flex gap-3 items-start pb-4 border-b border-border last:border-0 last:pb-0"
                >
                  <span className="text-lg">{icon}</span>
                  <span className="text-ink/85 leading-snug">{text}</span>
                </li>
              ))}
            </ul>

            <label className="mt-5 flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-1 h-5 w-5 accent-primary"
              />
              <span className="text-sm text-ink leading-snug">
                I agree to Bondoo's community pact and safety guidelines.
              </span>
            </label>

            {finishMutation.isError && (
              <p className="mt-3 text-sm text-destructive">
                Couldn't finish. Try again.
              </p>
            )}
          </article>
        )}

        {/* Nav */}
        <div className="pt-2 space-y-3">
          <button
            onClick={next}
            disabled={
              (step === 0 && (!canContinueStep0 || saveMutation.isPending)) ||
              (step === 2 && (!agreed || finishMutation.isPending))
            }
            className="w-full rounded-2xl bg-ink text-background font-semibold py-4 disabled:opacity-50"
          >
            {step === 0 &&
              (saveMutation.isPending ? "Saving…" : "Save & continue")}
            {step === 1 && (hasGovId ? "Continue" : "Skip for now")}
            {step === 2 &&
              (finishMutation.isPending ? "Finishing…" : "I agree — enter Bondoo")}
          </button>

          {step > 0 && (
            <button
              onClick={() => setStep((step - 1) as Step)}
              className="w-full text-sm text-muted-foreground py-2"
            >
              ← Back
            </button>
          )}
        </div>
      </section>
    </main>
  );
}

function OnbField({
  label,
  value,
  onChange,
  placeholder,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-semibold">
        {label}
      </span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className="mt-2 w-full rounded-xl bg-background border border-border px-3.5 py-2.5 text-ink outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition resize-none"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="mt-2 w-full rounded-xl bg-background border border-border px-3.5 py-2.5 text-ink outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition"
        />
      )}
    </label>
  );
}