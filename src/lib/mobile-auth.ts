import { isAndroidBrowser } from "@/lib/platform";

const NATIVE_AUTH_NEXT_KEY = "bondoo.native_auth_next";
const WEB_OAUTH_PENDING_KEY = "bondoo.web_oauth_pending";
const WEB_OAUTH_TTL_MS = 15 * 60 * 1000;

export type OAuthCallbackParams = {
  code: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  error: string | null;
  errorDescription: string | null;
  next: string;
  mode: string | null;
  type: string | null;
};

export type MobileAppHandoff = OAuthCallbackParams & {
  intentUrl: string;
  schemeUrl: string;
};

/**
 * Only allows same-origin relative paths for post-auth redirects.
 */
export function safeAuthNext(input: unknown): string {
  if (typeof input !== "string" || !input) return "/dashboard";
  if (!input.startsWith("/") || input.startsWith("//")) return "/dashboard";
  return input;
}

/**
 * Saves the post-login destination inside the native WebView before opening external OAuth.
 */
export function saveNativeAuthNext(next: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(NATIVE_AUTH_NEXT_KEY, safeAuthNext(next));
  } catch {
    /* ignore */
  }
}

/**
 * Reads the saved native post-login destination without removing it prematurely.
 */
export function peekNativeAuthNext(fallback?: string | null): string {
  if (typeof window === "undefined") return safeAuthNext(fallback);
  try {
    const saved = window.localStorage.getItem(NATIVE_AUTH_NEXT_KEY);
    if (saved) return safeAuthNext(saved);
  } catch {
    /* ignore */
  }
  return safeAuthNext(fallback);
}

/**
 * Reads and clears the saved native post-login destination.
 */
export function consumeNativeAuthNext(fallback?: string | null): string {
  const dest = peekNativeAuthNext(fallback);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(NATIVE_AUTH_NEXT_KEY);
    } catch {
      /* ignore */
    }
  }
  return dest;
}

/**
 * Marks that an OAuth sign-in flow was intentionally started inside the current web browser tab,
 * so the callback stays in the web browser instead of bouncing into the Android app.
 */
export function markWebOAuthInitiated(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(WEB_OAUTH_PENDING_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

export function clearWebOAuthInitiated(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(WEB_OAUTH_PENDING_KEY);
  } catch {
    /* ignore */
  }
}

export function wasWebOAuthInitiatedInBrowser(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.sessionStorage.getItem(WEB_OAUTH_PENDING_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    return Number.isFinite(ts) && Date.now() - ts < WEB_OAUTH_TTL_MS;
  } catch {
    return false;
  }
}

/**
 * Parses OAuth callback parameters from either standard https:// URLs or bondoo:// custom scheme URLs.
 */
export function parseOAuthCallbackUrl(rawUrl: string): OAuthCallbackParams {
  const dummyOrigin = "https://bondoo-connect-main.vercel.app";
  const normalized = rawUrl.startsWith("bondoo://")
    ? rawUrl.replace("bondoo://auth", `${dummyOrigin}/auth`).replace("bondoo://", `${dummyOrigin}/`)
    : rawUrl;

  const parsed = new URL(normalized, dummyOrigin);
  const hashParams = parsed.hash ? new URLSearchParams(parsed.hash.replace(/^#/, "")) : null;

  const pick = (key: string): string | null =>
    parsed.searchParams.get(key) || hashParams?.get(key) || null;

  return {
    code: pick("code"),
    accessToken: pick("access_token"),
    refreshToken: pick("refresh_token"),
    error: pick("error"),
    errorDescription: pick("error_description"),
    next: safeAuthNext(pick("next")),
    mode: pick("mode"),
    type: pick("type"),
  };
}

/**
 * Builds Android custom-scheme and intent:// URLs containing all OAuth params in the query string
 * so Android intent parsing never conflicts with '#' fragments.
 */
export function buildAndroidAppReturnUrls(params: OAuthCallbackParams): {
  intentUrl: string;
  schemeUrl: string;
} {
  const qs = new URLSearchParams();
  if (params.code) qs.set("code", params.code);
  if (params.accessToken) qs.set("access_token", params.accessToken);
  if (params.refreshToken) qs.set("refresh_token", params.refreshToken);
  if (params.error) qs.set("error", params.error);
  if (params.errorDescription) qs.set("error_description", params.errorDescription);
  if (params.next && params.next !== "/dashboard") qs.set("next", params.next);

  const queryStr = qs.toString() ? `?${qs.toString()}` : "";
  const schemeUrl = `bondoo://auth${queryStr}`;
  const intentUrl = `intent://auth${queryStr}#Intent;scheme=bondoo;package=com.bondoo.connect;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;end`;
  return { intentUrl, schemeUrl };
}

let cachedHandoff: MobileAppHandoff | null | undefined;
let handoffDismissed = false;

/**
 * Detects synchronously on module load (before Supabase initializes and touches window.location)
 * whether an OAuth redirect landed in an Android external browser instead of returning to the native app.
 */
export function getPendingMobileAppHandoff(): MobileAppHandoff | null {
  if (typeof window === "undefined" || handoffDismissed) return null;
  if (cachedHandoff !== undefined) return cachedHandoff;

  if (!isAndroidBrowser() || wasWebOAuthInitiatedInBrowser()) {
    cachedHandoff = null;
    return null;
  }

  try {
    const params = parseOAuthCallbackUrl(window.location.href);
    const hasCallbackData = Boolean(
      params.code || params.accessToken || params.error || params.errorDescription,
    );
    const isPasswordReset = params.type === "recovery" || params.mode === "reset";

    if (!hasCallbackData || isPasswordReset) {
      cachedHandoff = null;
      return null;
    }

    const { intentUrl, schemeUrl } = buildAndroidAppReturnUrls(params);
    cachedHandoff = { ...params, intentUrl, schemeUrl };
    return cachedHandoff;
  } catch {
    cachedHandoff = null;
    return null;
  }
}

export function dismissMobileAppHandoff(): void {
  handoffDismissed = true;
  cachedHandoff = null;
  markWebOAuthInitiated();
}
