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

export type AuthSearch = {
  next?: string;
  code?: string;
  error?: string;
  error_code?: string;
  error_description?: string;
  mode?: string;
  type?: string;
};

function GoogleIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  );
}

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): AuthSearch => {
    const res: AuthSearch = {};
    if (typeof s.next === "string" && s.next) {
      res.next = safeNext(s.next);
    }
    if (typeof s.code === "string" && s.code) {
      res.code = s.code;
    }
    if (typeof s.error === "string" && s.error) {
      res.error = s.error;
    }
    if (typeof s.error_code === "string" && s.error_code) {
      res.error_code = s.error_code;
    }
    if (typeof s.error_description === "string" && s.error_description) {
      res.error_description = s.error_description;
    }
    if (typeof s.mode === "string" && s.mode) {
      res.mode = s.mode;
    }
    if (typeof s.type === "string" && s.type) {
      res.type = s.type;
    }
    return res;
  },
  head: () => ({
    meta: [
      { title: "Sign in · Bondoo" },
      { name: "description", content: "Sign in to Bondoo to meet verified neighbours." },
    ],
  }),
  component: AuthScreen,
});

export type AuthMode = "signin" | "signup" | "forgot" | "reset";

function AuthScreen() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const next = search.next || "/dashboard";
  const [mode, setMode] = useState<AuthMode>(search.mode === "reset" ? "reset" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showAgeGate, setShowAgeGate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [isOtpStep, setIsOtpStep] = useState(false);
  const [otpType, setOtpType] = useState<"signup" | "recovery">("signup");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Handle auth session, OAuth callback code exchange, and reactive auth state changes
  useEffect(() => {
    let isMounted = true;

    const syncAgeConsent = async (userId: string) => {
      const consent = getStoredAgeConsent();
      if (consent) {
        try {
          await supabase
            .from("profiles")
            .update({ age_confirmed_at: consent.confirmedAt })
            .eq("id", userId);
        } catch (e) {
          console.warn("[Auth] Failed to update age_confirmed_at", e);
        }
      }
    };

    // 1. Subscribe to auth state changes (e.g. after OAuth redirect, signin, or password recovery)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!isMounted) return;
        if (event === "PASSWORD_RECOVERY") {
          setMode("reset");
          setIsOtpStep(false);
          setError(null);
          setInfo("Please set your new password below.");
          return;
        }
        if (session?.user && mode !== "reset" && search.mode !== "reset") {
          await syncAgeConsent(session.user.id);
          window.location.replace(safeNext(next));
        }
      }
    );

    // 2. Check if already signed in on initial load
    supabase.auth.getSession().then(async ({ data }) => {
      if (!isMounted) return;
      if (
        search.mode === "reset" ||
        mode === "reset" ||
        (typeof window !== "undefined" && window.location.hash.includes("type=recovery"))
      ) {
        setMode("reset");
        return;
      }
      if (data.session?.user) {
        await syncAgeConsent(data.session.user.id);
        window.location.replace(safeNext(next));
      }
    });

    // 3. Check for OAuth code in search params or window.location
    const code =
      search.code ||
      (typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("code")
        : null);

    if (code) {
      setLoading(true);
      supabase.auth
        .exchangeCodeForSession(code)
        .then(async ({ data, error: exchangeError }) => {
          if (!isMounted) return;
          if (exchangeError) {
            setLoading(false);
            setError(getAuthErrorMessage(exchangeError));
          } else if (data.session?.user) {
            if (search.mode === "reset" || search.type === "recovery") {
              setMode("reset");
              setLoading(false);
              setInfo("Please set your new password below.");
              return;
            }
            await syncAgeConsent(data.session.user.id);
            window.location.replace(safeNext(next));
          } else {
            setLoading(false);
          }
        })
        .catch((err) => {
          if (!isMounted) return;
          setLoading(false);
          setError(getAuthErrorMessage(err));
        });
    }

    // 4. Check for OAuth error in URL search or hash
    if (search.error_description || search.error) {
      setError(decodeURIComponent(search.error_description || search.error || "Authentication failed."));
    } else if (typeof window !== "undefined" && window.location.hash) {
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const hashErr = hashParams.get("error_description") || hashParams.get("error");
      if (hashErr) {
        setError(decodeURIComponent(hashErr));
      }
    }

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [next, search.code, search.error, search.error_description, search.mode, search.type, mode]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((prev) => prev - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  async function handleSendResetEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }
    setLoading(true);
    try {
      const redirectUrl = `${window.location.origin}/auth?mode=reset&next=${encodeURIComponent(next)}`;
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: redirectUrl,
      });
      if (error) throw error;
      setInfo(`Password reset link sent to ${email.trim()}. Please check your inbox and spam folder.`);
    } catch (err) {
      setError(getAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdatePassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (error) throw error;
      setInfo("Password updated successfully! Redirecting…");
      setTimeout(() => {
        window.location.replace(safeNext(next));
      }, 1200);
    } catch (err) {
      setError(getAuthErrorMessage(err));
      setLoading(false);
    }
  }

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
          email: email.trim().toLowerCase(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth?next=${encodeURIComponent(next)}`,
            data: {
              display_name: displayName.trim(),
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
        // Switch to 6-digit OTP screen
        setIsOtpStep(true);
        setResendCooldown(60);
        setInfo(`We sent a 6-digit verification code to ${email}`);
        return;
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });
        if (error) throw error;
        window.location.replace(next);
        return;
      }
    } catch (err) {
      setError(getAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  function getAuthErrorMessage(err: unknown): string {
    if (!err) return "Something went wrong. Please try again.";
    if (typeof err === "string") {
      if (err === "{}" || !err.trim()) {
        return "Unable to complete request. Supabase email limit exceeded or SMTP not configured.";
      }
      return err;
    }
    if (typeof err === "object" && err !== null) {
      const e = err as { message?: string; msg?: string; error_description?: string; name?: string; status?: number };
      const msg = e.message || e.msg || e.error_description;
      if (!msg || msg === "{}" || msg.trim() === "") {
        return "Unable to connect to authentication server. Please check your network connection.";
      }
      const lower = msg.toLowerCase();
      if (
        lower.includes("failed to fetch") ||
        lower.includes("networkerror") ||
        lower.includes("enotfound") ||
        e.name === "AuthRetryableFetchError"
      ) {
        return "Unable to reach the authentication server. Please verify your internet connection or make sure your Supabase project is active (not paused).";
      }
      if (lower.includes("error sending confirmation email")) {
        return "Unable to send verification email. Supabase email limit exceeded or SMTP not configured in Supabase dashboard.";
      }
      if (lower.includes("provider is not enabled") || lower.includes("unsupported provider")) {
        return "Google sign-in is not enabled in your Supabase project. Please enable Google provider in the Supabase Authentication dashboard.";
      }
      if (lower.includes("redirect uri") || lower.includes("redirect_uri")) {
        return "Redirect URI mismatch. Please add this app URL to Allowed Redirect URLs in Supabase and Google Cloud Console.";
      }
      return msg;
    }
    return "Something went wrong. Please try again.";
  }

  async function handleVerifyOtp(otpCode?: string) {
    setError(null);
    const code = otpCode ?? otp.join("");
    if (code.length < 6) {
      setError("Please enter the complete 6-digit code.");
      return;
    }
    setLoading(true);
    try {
      if (otpType === "recovery") {
        const { error } = await supabase.auth.verifyOtp({
          email: email.trim().toLowerCase(),
          token: code,
          type: "recovery",
        });
        if (error) throw error;
        setIsOtpStep(false);
        setMode("reset");
        setInfo("Code verified! Please set your new password below.");
        return;
      }

      const { data, error } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: code,
        type: "signup",
      });
      if (error) {
        // Also try email verification type as fallback
        const fallback = await supabase.auth.verifyOtp({
          email: email.trim().toLowerCase(),
          token: code,
          type: "email",
        });
        if (fallback.error) throw fallback.error;
      }

      const consent = getStoredAgeConsent();
      if (consent) {
        const { data: userData } = await supabase.auth.getUser();
        if (userData?.user) {
          await supabase
            .from("profiles")
            .update({ age_confirmed_at: consent.confirmedAt })
            .eq("id", userData.user.id);
        }
      }
      window.location.replace(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid verification code");
    } finally {
      setLoading(false);
    }
  }

  function handleOtpChange(index: number, val: string) {
    const digit = val.replace(/\D/g, "").slice(-1);
    const newOtp = [...otp];
    newOtp[index] = digit;
    setOtp(newOtp);

    // Auto advance to next input
    if (digit && index < 5) {
      const nextInput = document.getElementById(`otp-input-${index + 1}`);
      nextInput?.focus();
    }

    // Auto submit if all 6 digits entered
    if (digit && index === 5 && newOtp.every((d) => d !== "")) {
      handleVerifyOtp(newOtp.join(""));
    }
  }

  function handleOtpKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      const prevInput = document.getElementById(`otp-input-${index - 1}`);
      prevInput?.focus();
    }
  }

  function handleOtpPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    const newOtp = [...otp];
    for (let i = 0; i < 6; i++) {
      newOtp[i] = pasted[i] || "";
    }
    setOtp(newOtp);
    if (pasted.length === 6) {
      handleVerifyOtp(pasted);
    } else {
      const focusIndex = Math.min(pasted.length, 5);
      document.getElementById(`otp-input-${focusIndex}`)?.focus();
    }
  }

  async function handleResendOtp() {
    if (resendCooldown > 0) return;
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      if (otpType === "recovery") {
        const redirectUrl = `${window.location.origin}/auth?mode=reset&next=${encodeURIComponent(next)}`;
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
          redirectTo: redirectUrl,
        });
        if (error) throw error;
        setResendCooldown(60);
        setInfo("A new recovery link was sent to your email.");
        return;
      }
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: email.trim().toLowerCase(),
      });
      if (error) throw error;
      setResendCooldown(60);
      setInfo("A new 6-digit verification code was sent to your email.");
    } catch (err) {
      setError(getAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setError(null);
    const consent = getStoredAgeConsent();
    if (!consent) {
      setShowAgeGate(true);
      return;
    }
    setGoogleLoading(true);
    try {
      const redirectUrl = `${window.location.origin}/auth?next=${encodeURIComponent(next)}`;
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: redirectUrl,
        },
      });
      if (oauthError) throw oauthError;
      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      setError(getAuthErrorMessage(err));
      setGoogleLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-background flex flex-col relative overflow-hidden">
      <AgeGate
        forceOpen={showAgeGate}
        onClose={() => setShowAgeGate(false)}
        onConfirm={() => {
          setShowAgeGate(false);
          handleGoogle();
        }}
      />
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
            {isOtpStep
              ? otpType === "recovery"
                ? "Recovery Code"
                : "Verify Email"
              : mode === "forgot"
              ? "Account Recovery"
              : mode === "reset"
              ? "New Password"
              : mode === "signup"
              ? "New here"
              : "Welcome back"}
          </p>
          <h1 className="display mt-3 text-[2.8rem] leading-[0.95] text-ink">
            {isOtpStep ? (
              <>Enter the <em className="text-primary not-italic">code</em>.</>
            ) : mode === "forgot" ? (
              <>Reset your <em className="text-primary not-italic">password</em>.</>
            ) : mode === "reset" ? (
              <>Create new <em className="text-primary not-italic">password</em>.</>
            ) : mode === "signup" ? (
              <>Join the <em className="text-primary not-italic">club</em>.</>
            ) : (
              <>Sign in to <em className="text-primary not-italic">Bondoo</em>.</>
            )}
          </h1>
          {isOtpStep ? (
            <p className="text-xs text-muted-foreground mt-2">
              We emailed a 6-digit {otpType === "recovery" ? "recovery" : "verification"} code to{" "}
              <span className="font-semibold text-ink">{email}</span>.
            </p>
          ) : mode === "forgot" ? (
            <p className="text-xs text-muted-foreground mt-2">
              Enter your email and we'll send you a password reset link.
            </p>
          ) : mode === "reset" ? (
            <p className="text-xs text-muted-foreground mt-2">
              Set a strong password for your Bondoo account (minimum 6 characters).
            </p>
          ) : null}
        </div>

        {isOtpStep ? (
          <div className="mt-8 space-y-6">
            {/* 6-Digit OTP Boxes */}
            <div className="flex justify-between gap-2" onPaste={handleOtpPaste}>
              {otp.map((digit, idx) => (
                <input
                  key={idx}
                  id={`otp-input-${idx}`}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleOtpChange(idx, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                  autoFocus={idx === 0}
                  className="w-12 h-14 text-center font-bold text-2xl rounded-2xl bg-paper border border-border text-ink focus:border-primary focus:ring-4 focus:ring-primary/10 transition outline-none shadow-sm"
                />
              ))}
            </div>

            {error && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-xl px-3 py-2 text-center">
                {error}
              </p>
            )}

            {info && (
              <p className="text-sm text-primary bg-primary/10 rounded-xl px-3 py-2 text-center">
                {info}
              </p>
            )}

            <button
              type="button"
              onClick={() => handleVerifyOtp()}
              disabled={loading || otp.some((d) => !d)}
              className="w-full rounded-2xl bg-ink text-background font-semibold py-4 disabled:opacity-50 transition shadow-sm"
            >
              {loading ? "Verifying code…" : "Verify & Continue"}
            </button>

            <div className="flex items-center justify-between text-xs text-muted-foreground pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsOtpStep(false);
                  if (otpType === "recovery") {
                    setMode("forgot");
                  }
                  setError(null);
                  setInfo(null);
                }}
                className="hover:text-ink transition underline underline-offset-2"
              >
                ← {otpType === "recovery" ? "Back to recovery" : "Edit email / password"}
              </button>

              <button
                type="button"
                onClick={handleResendOtp}
                disabled={resendCooldown > 0 || loading}
                className={`font-semibold transition ${
                  resendCooldown > 0
                    ? "text-muted-foreground opacity-60 cursor-not-allowed"
                    : "text-primary hover:underline underline-offset-2 cursor-pointer"
                }`}
              >
                {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : "Resend code"}
              </button>
            </div>
          </div>
        ) : mode === "forgot" ? (
          <form onSubmit={handleSendResetEmail} className="mt-8 space-y-4">
            <div className="bg-paper rounded-2xl px-4 py-3.5 border border-border focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10 transition">
              <label className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-semibold">
                Registered Email
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

            {error && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-xl px-3 py-2">
                {error}
              </p>
            )}

            {info && (
              <p className="text-sm text-primary bg-primary/10 rounded-xl px-3 py-2">
                {info}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-ink text-background font-semibold py-4 disabled:opacity-60 transition shadow-sm cursor-pointer"
            >
              {loading ? "Sending reset link…" : "Send Reset Link"}
            </button>

            <div className="flex items-center justify-between text-xs text-muted-foreground pt-2">
              <button
                type="button"
                onClick={() => {
                  setMode("signin");
                  setError(null);
                  setInfo(null);
                }}
                className="hover:text-ink transition font-medium"
              >
                ← Back to Sign in
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!email.trim()) {
                    setError("Please enter your email above first.");
                    return;
                  }
                  setOtpType("recovery");
                  setIsOtpStep(true);
                  setError(null);
                  setInfo(null);
                }}
                className="text-primary hover:underline font-medium"
              >
                Have an OTP code?
              </button>
            </div>
          </form>
        ) : mode === "reset" ? (
          <form onSubmit={handleUpdatePassword} className="mt-8 space-y-3">
            <div className="bg-paper rounded-2xl px-4 py-3.5 border border-border focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10 transition">
              <label className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-semibold">
                New Password
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
                placeholder="••••••••"
                className="mt-1 w-full bg-transparent outline-none text-ink placeholder:text-muted-foreground/60"
              />
            </div>

            <div className="bg-paper rounded-2xl px-4 py-3.5 border border-border focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10 transition">
              <label className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-semibold">
                Confirm New Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
                placeholder="••••••••"
                className="mt-1 w-full bg-transparent outline-none text-ink placeholder:text-muted-foreground/60"
              />
            </div>

            {error && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-xl px-3 py-2">
                {error}
              </p>
            )}

            {info && (
              <p className="text-sm text-primary bg-primary/10 rounded-xl px-3 py-2">
                {info}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-ink text-background font-semibold py-4 disabled:opacity-60 transition shadow-sm cursor-pointer"
            >
              {loading ? "Updating password…" : "Save New Password"}
            </button>

            <div className="text-center text-xs text-muted-foreground pt-2">
              <button
                type="button"
                onClick={() => {
                  setMode("signin");
                  setError(null);
                  setInfo(null);
                }}
                className="hover:text-ink transition font-medium"
              >
                ← Back to Sign in
              </button>
            </div>
          </form>
        ) : (
          <>
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
                <div className="flex items-center justify-between">
                  <label className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-semibold">
                    Password
                  </label>
                  {mode === "signin" && (
                    <button
                      type="button"
                      onClick={() => {
                        setMode("forgot");
                        setError(null);
                        setInfo(null);
                      }}
                      className="text-[11px] text-primary hover:underline underline-offset-2 font-medium cursor-pointer"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
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
                className="w-full rounded-2xl bg-ink text-background font-semibold py-4 disabled:opacity-60 transition"
              >
                {loading
                  ? "Please wait…"
                  : mode === "signup"
                    ? "Create account (Send OTP)"
                    : "Sign in"}
              </button>
            </form>

            <div className="flex items-center gap-3 py-4">
              <div className="flex-1 h-px bg-border" />
              <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                or
              </span>
              <div className="flex-1 h-px bg-border" />
            </div>

            {search.code && loading && (
              <div className="p-3.5 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center gap-3 text-primary text-xs font-semibold">
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span>Signing you in with Google…</span>
              </div>
            )}

            <button
              type="button"
              onClick={handleGoogle}
              disabled={googleLoading || loading}
              className="w-full rounded-2xl bg-paper border border-border text-ink font-medium py-3.5 hover:bg-surface active:scale-[0.99] transition flex items-center justify-center gap-3 disabled:opacity-60 shadow-sm"
            >
              {googleLoading ? (
                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              ) : (
                <GoogleIcon className="w-5 h-5" />
              )}
              <span>{googleLoading ? "Connecting to Google…" : "Continue with Google"}</span>
            </button>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              {mode === "signup" ? "Already have an account?" : "New to Bondoo?"}{" "}
              <button
                type="button"
                onClick={() => {
                  setMode(mode === "signup" ? "signin" : "signup");
                  setError(null);
                  setInfo(null);
                }}
                className="text-primary font-medium"
              >
                {mode === "signup" ? "Sign in" : "Create one"}
              </button>
            </p>
          </>
        )}

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