import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BondooLogo } from "@/components/bondoo-logo";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Bondoo — Real connections, simple activities" },
      {
        name: "description",
        content:
          "Meet verified neighbours for walks, coffee, and reading. Trust-first, not dating.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  return (
    <main className="min-h-screen bg-background flex flex-col relative overflow-hidden">
      {/* soft orange sun */}
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

        <div className="mt-14">
              <p className="text-xs uppercase tracking-[0.22em] text-brand-orange font-semibold">
                An anti-loneliness club
              </p>
              <h1 className="display mt-4 text-[3.4rem] leading-[0.95] text-ink">
                Meet someone
                <br />
                for a <em className="text-primary not-italic">walk</em>.
              </h1>
              <p className="mt-5 text-[15px] leading-relaxed text-muted-foreground max-w-[22rem]">
                Bondoo connects verified neighbours for simple, human things —
                a coffee, a reading hour, a lap around the park.
                <span className="text-ink"> No dating. Just company.</span>
              </p>
        </div>

        <div className="mt-10 space-y-3">
          <Link
            to="/auth"
            className="block w-full rounded-2xl bg-ink text-background font-semibold py-4 text-center hover:bg-ink/90 active:scale-[0.99] transition"
          >
            Sign in or create an account
          </Link>
          <p className="text-center text-xs text-muted-foreground">
            Email & password, or continue with Google.
          </p>
        </div>

        <p className="mt-auto pt-10 text-center text-[11px] text-muted-foreground leading-relaxed">
          By continuing you agree to Bondoo's{" "}
          <Link to="/" className="underline underline-offset-2">
            Terms
          </Link>{" "}
          &{" "}
          <Link to="/" className="underline underline-offset-2">
            Community Guidelines
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
