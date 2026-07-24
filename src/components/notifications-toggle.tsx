import { usePushNotifications } from "@/hooks/use-push-notifications";

export function NotificationsToggle() {
  const { status, error, enable, disable } = usePushNotifications();

  const busy = status === "loading";
  const on = status === "on";

  return (
    <article className="rounded-3xl bg-paper border border-border p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.22em] text-brand-orange font-semibold">
            Notifications
          </p>
          <h2 className="display text-2xl text-ink mt-1">
            Stay <em className="text-primary not-italic">in the loop</em>
          </h2>
          <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
            Get a gentle ping when someone messages you, sends a connect request, or proposes a meetup.
          </p>
        </div>
        <button
          type="button"
          onClick={on ? disable : enable}
          disabled={busy || status === "unsupported" || status === "unconfigured" || status === "denied"}
          className={`shrink-0 rounded-2xl px-4 py-2.5 text-sm font-semibold transition ${
            on
              ? "bg-primary text-primary-foreground"
              : "bg-ink text-background"
          } disabled:opacity-40`}
        >
          {busy ? "…" : on ? "On" : "Enable"}
        </button>
      </div>
      {status === "unsupported" && (
        <p className="mt-4 text-xs text-muted-foreground">
          This browser doesn't support web push. Try the installed app or Chrome/Firefox on desktop.
        </p>
      )}
      {status === "unconfigured" && (
        <p className="mt-4 text-xs text-muted-foreground">
          Notifications aren't configured on the server yet.
        </p>
      )}
      {status === "denied" && (
        <p className="mt-4 text-xs text-destructive">
          Notifications are blocked. Enable them in your browser's site settings and refresh.
        </p>
      )}
      {error && status !== "denied" && (
        <p className="mt-4 text-xs text-destructive">{error}</p>
      )}
    </article>
  );
}