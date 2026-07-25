import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BondooLogo } from "@/components/bondoo-logo";
import { AgeGate, getStoredAgeConsent } from "@/components/age-gate";

function safeNext(input: unknown): string {
  if (typeof input !== "string" || !input) return "/dashboard";
  // Only allow same-origin relative paths.
  if (!input.startsWith("/") || input.startsWith("//")) return "/dashboard";
  return input;
}

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>) => ({ next: safeNext(s.next) }),
  head: () => ({
    meta: [
      { title: "Sign in · Bondoo" },
      { name: "description", content: "Sign in to Bondoo to meet verified neighbours." },
    ],
  }),
  component: AuthScreen,
});

function AuthScreen() {
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // If already signed in, bounce to dashboard.
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) window.location.replace(next);
    });
  }, [navigate, next]);

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const consent = getStoredAgeConsent();
    if (!consent) {
      setError("Please confirm your age to continue.");
      return;
    }
    setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth?next=${encodeURIComponent(next)}`,
            data: {
              display_name: displayName,
              age_confirmed_at: consent.confirmedAt,
            },
          },
        });
        if (error) throw error;
        if (data.session) {
          if (data.user) {
            await supabase
              .from("profiles")
              .update({ age_confirmed_at: consent.confirmedAt })
              .eq("id", data.user.id);
          }
          window.location.replace(next);
          return;
        }
        setInfo(
          "We emailed you a confirmation link. Click it to verify and sign in.",
        );
        return;
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        window.location.replace(next);
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleResendLink() {
    setError(null);
    setInfo(null);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth?next=${encodeURIComponent(next)}`,
        },
      });
      if (error) throw error;
      setInfo("We sent a new confirmation link to your email.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resend link");
    }
  }

  async function handleGoogle() {
    setError(null);
    if (!getStoredAgeConsent()) {
      setError("Please confirm your age to continue.");
      return;
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) {
      setError(error.message);
    }
  }

  return (
    <main className="min-h-screen bg-background flex flex-col relative overflow-hidden">
      <AgeGate />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full opacity-40 blur-3xl"
        style={{ background: "radial-gradient(circle, #FF9500 0%, transparent 70%)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -left-20 h-80 w-80 rounded-full opacity-25 blur-3xl"
        style={{ background: "radial-gradient(circle, #007AFF 0%, transparent 70%)" }}
      />

      <div className="relative flex-1 flex flex-col px-7 pt-14 pb-8 max-w-md mx-auto w-full">
        <div className="flex items-center justify-between">
          <BondooLogo className="h-10" />
          <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            est · 2026
          </span>
        </div>

        <div className="mt-12">
          <p className="text-xs uppercase tracking-[0.22em] text-brand-orange font-semibold">
            {mode === "signup" ? "New here" : "Welcome back"}
          </p>
          <h1 className="display mt-3 text-[2.8rem] leading-[0.95] text-ink">
            {mode === "signup" ? (
              <>Join the <em className="text-primary not-italic">club</em>.</>
            ) : (
              <>Sign in to <em className="text-primary not-italic">Bondoo</em>.</>
            )}
          </h1>
        </div>

        <form onSubmit={handleEmail} className="mt-8 space-y-3">
          {mode === "signup" && (
            <div className="bg-paper rounded-2xl px-4 py-3.5 border border-border focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10 transition">
              <label className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-semibold">
                Display name
              </label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                placeholder="Ananya R."
                className="mt-1 w-full bg-transparent outline-none text-ink placeholder:text-muted-foreground/60"
              />
            </div>
          )}
          <div className="bg-paper rounded-2xl px-4 py-3.5 border border-border focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10 transition">
            <label className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-semibold">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="you@example.com"
              className="mt-1 w-full bg-transparent outline-none text-ink placeholder:text-muted-foreground/60"
            />
          </div>
          <div className="bg-paper rounded-2xl px-4 py-3.5 border border-border focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10 transition">
            <label className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-semibold">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              placeholder="••••••••"
              className="mt-1 w-full bg-transparent outline-none text-ink placeholder:text-muted-foreground/60"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-xl px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-ink text-background font-semibold py-4 disabled:opacity-60"
          >
            {loading
              ? "Please wait…"
              : mode === "signup"
                ? "Create account"
                : "Sign in"}
          </button>
        </form>

        {info && (
          <div className="mt-4 flex items-center justify-between gap-3 text-sm bg-primary/10 text-primary rounded-xl px-3 py-2">
            <span>{info}</span>
            <button
              type="button"
              onClick={handleResendLink}
              className="font-medium underline underline-offset-2 whitespace-nowrap"
            >
              Resend
            </button>
          </div>
        )}

        <div className="flex items-center gap-3 py-4">
          <div className="flex-1 h-px bg-border" />
          <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            or
          </span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <button
          type="button"
          onClick={handleGoogle}
          className="w-full rounded-2xl bg-paper border border-border text-ink font-medium py-3.5 hover:bg-surface transition"
        >
          Continue with Google
        </button>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {mode === "signup" ? "Already have an account?" : "New to Bondoo?"}{" "}
          <button
            type="button"
            onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
            className="text-primary font-medium"
          >
            {mode === "signup" ? "Sign in" : "Create one"}
          </button>
        </p>

        <div className="mt-auto pt-8 text-center space-y-1">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            By continuing you agree to Bondoo's{" "}
            <Link to="/terms" className="underline underline-offset-2">
              Terms
            </Link>{" "}
            &{" "}
            <Link to="/privacy" className="underline underline-offset-2">
              Privacy Policy
            </Link>
            .
          </p>
          <p className="text-[10px] text-muted-foreground/80">
            Bondoo is a proprietary product/unit of MAKE MY VASH (MMV).
          </p>
        </div>
      </div>
    </main>
  );
}