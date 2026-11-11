import { useEffect } from "react";
import { BondooLogo } from "@/components/bondoo-logo";
import type { MobileAppHandoff } from "@/lib/mobile-auth";

export function MobileAppHandoffScreen({
  handoff,
  onContinueInBrowser,
}: {
  handoff: MobileAppHandoff;
  onContinueInBrowser: () => void;
}) {
  useEffect(() => {
    // Automatically bounce back from mobile Chrome / Custom Tabs into the native Bondoo app.
    const timer = window.setTimeout(() => {
      try {
        window.location.href = handoff.intentUrl;
      } catch {
        window.location.href = handoff.schemeUrl;
      }
    }, 60);

    return () => window.clearTimeout(timer);
  }, [handoff]);

  return (
    <main className="min-h-screen bg-background flex flex-col items-center justify-center px-6 py-10 relative overflow-hidden">
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

      <div className="relative w-full max-w-sm bg-paper border border-border rounded-3xl p-7 shadow-xl text-center">
        <div className="flex justify-center">
          <BondooLogo className="h-10" />
        </div>

        <p className="mt-6 text-[11px] uppercase tracking-[0.22em] text-brand-orange font-semibold">
          Google Sign-In Complete
        </p>
        <h1 className="display mt-2 text-3xl text-ink leading-tight">
          Returning to <em className="text-primary not-italic">Bondoo</em>…
        </h1>
        <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
          If the Bondoo app didn't open automatically, tap the button below to continue inside the
          app.
        </p>

        <div className="mt-6 space-y-3">
          <a
            href={handoff.intentUrl}
            className="block w-full rounded-2xl bg-ink text-background font-semibold py-4 text-center shadow-md hover:bg-ink/90 active:scale-[0.99] transition"
          >
            Open Bondoo App
          </a>

          <a
            href={handoff.schemeUrl}
            className="block w-full rounded-2xl bg-background border border-border text-ink text-sm font-medium py-3 text-center hover:bg-surface transition"
          >
            Open via Direct App Link
          </a>
        </div>

        <button
          type="button"
          onClick={onContinueInBrowser}
          className="mt-6 text-xs text-muted-foreground hover:text-ink underline underline-offset-2 transition cursor-pointer"
        >
          Continue in Chrome browser instead
        </button>
      </div>
    </main>
  );
}
