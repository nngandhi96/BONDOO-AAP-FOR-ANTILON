import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BondooLogo } from "@/components/bondoo-logo";

// Beta namespace on the Supabase JS client — typed via a small local wrapper.
type AuthorizationDetails = {
  client?: { name?: string; client_uri?: string } | null;
  redirect_uri?: string | null;
  redirect_url?: string | null;
  redirect_to?: string | null;
  scope?: string | null;
  scopes?: string[] | null;
};

type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
  approveAuthorization: (id: string) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
  denyAuthorization: (id: string) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
};

function oauthApi(): OAuthApi {
  const auth = supabase.auth as unknown as { oauth: OAuthApi };
  return auth.oauth;
}

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      const next = location.pathname + location.searchStr;
      throw redirect({ to: "/auth", search: { next } });
    }
  },
  loader: async ({ location }) => {
    const id = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauthApi().getAuthorizationDetails(id);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: ConsentScreen,
  errorComponent: ({ error }) => (
    <main className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="max-w-md text-center">
        <h1 className="display text-2xl text-ink">We couldn't load this authorization</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {String((error as Error)?.message ?? error)}
        </p>
      </div>
    </main>
  ),
});

function ConsentScreen() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clientName = details?.client?.name ?? "an app";
  const scopes = details?.scopes ?? (details?.scope ? details.scope.split(" ").filter(Boolean) : []);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const api = oauthApi();
    const { data, error } = approve
      ? await api.approveAuthorization(authorization_id)
      : await api.denyAuthorization(authorization_id);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("No redirect returned by the authorization server.");
      return;
    }
    window.location.href = target;
  }

  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-md rounded-3xl border border-border bg-paper p-8 shadow-sm">
        <div className="flex items-center justify-between">
          <BondooLogo className="h-9" />
          <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Connect
          </span>
        </div>

        <h1 className="display mt-6 text-[1.75rem] leading-tight text-ink">
          Connect <em className="not-italic text-primary">{clientName}</em> to your Bondoo account
        </h1>
        <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
          This lets {clientName} use Bondoo as you. It can call Bondoo's enabled tools on
          your behalf while you're signed in.
        </p>

        {scopes.length > 0 && (
          <div className="mt-5 rounded-2xl border border-border bg-background px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
              Requested access
            </p>
            <ul className="mt-2 space-y-1 text-sm text-ink">
              {scopes.map((s: string) => (
                <li key={s}>• {s}</li>
              ))}
            </ul>
          </div>
        )}

        <p className="mt-5 text-xs text-muted-foreground">
          This does not bypass Bondoo's own permissions — {clientName} sees only what your
          account can normally access.
        </p>

        {error && (
          <p className="mt-4 text-sm text-destructive bg-destructive/10 rounded-xl px-3 py-2" role="alert">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-col gap-2">
          <button
            disabled={busy}
            onClick={() => decide(true)}
            className="w-full rounded-2xl bg-ink text-background font-semibold py-3.5 disabled:opacity-60"
          >
            {busy ? "Please wait…" : `Approve & connect ${clientName}`}
          </button>
          <button
            disabled={busy}
            onClick={() => decide(false)}
            className="w-full rounded-2xl border border-border bg-paper text-ink font-medium py-3 hover:bg-surface transition disabled:opacity-60"
          >
            Cancel connection
          </button>
        </div>
      </div>
    </main>
  );
}