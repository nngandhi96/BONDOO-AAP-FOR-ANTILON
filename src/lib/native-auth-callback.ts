import { App } from "@capacitor/app";
import { supabase } from "@/integrations/supabase/client";
import { getStoredAgeConsent } from "@/components/age-gate";
import { isNativeMobileApp } from "@/lib/platform";
import { consumeNativeAuthNext, parseOAuthCallbackUrl } from "@/lib/mobile-auth";

const processedUrls = new Set<string>();
let nativeDeepLinkInProgress = false;

export function isProcessingNativeDeepLink(): boolean {
  return nativeDeepLinkInProgress;
}

/**
 * Syncs stored 18+ age consent timestamp to the user's Supabase profile if present.
 */
export async function syncStoredAgeConsent(userId: string): Promise<void> {
  const consent = getStoredAgeConsent();
  if (!consent) return;
  try {
    await supabase
      .from("profiles")
      .update({ age_confirmed_at: consent.confirmedAt })
      .eq("id", userId);
  } catch (e) {
    console.warn("[Auth] Failed to update age_confirmed_at", e);
  }
}

async function handleIncomingDeepLink(
  rawUrl: string,
  onProcessing?: (busy: boolean) => void,
): Promise<void> {
  if (!rawUrl || processedUrls.has(rawUrl)) return;

  const params = parseOAuthCallbackUrl(rawUrl);
  const hasAuthPayload = Boolean(
    params.code ||
    (params.accessToken && params.refreshToken) ||
    params.error ||
    params.errorDescription,
  );

  if (!hasAuthPayload) {
    // Handle standard deep link navigation into app routes (e.g., /meetup/...)
    try {
      if (rawUrl.startsWith("https://bondoo-connect-main.vercel.app/")) {
        const parsed = new URL(rawUrl);
        const dest = `${parsed.pathname}${parsed.search}${parsed.hash}`;
        if (dest && dest !== "/" && dest !== window.location.pathname) {
          processedUrls.add(rawUrl);
          window.location.replace(dest);
        }
      }
    } catch {
      /* ignore */
    }
    return;
  }

  processedUrls.add(rawUrl);

  const errMsg = params.errorDescription || params.error;
  if (errMsg) {
    onProcessing?.(false);
    window.location.replace(`/auth?error_description=${encodeURIComponent(errMsg)}`);
    return;
  }

  const targetNext = consumeNativeAuthNext(params.next);
  nativeDeepLinkInProgress = true;
  onProcessing?.(true);

  try {
    if (params.accessToken && params.refreshToken) {
      const { data, error } = await supabase.auth.setSession({
        access_token: params.accessToken,
        refresh_token: params.refreshToken,
      });
      if (!error && data.session?.user) {
        await syncStoredAgeConsent(data.session.user.id);
        window.location.replace(targetNext);
        return;
      }
      if (error) {
        throw error;
      }
    }

    if (params.code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(params.code);
      if (!error && data.session?.user) {
        await syncStoredAgeConsent(data.session.user.id);
        window.location.replace(targetNext);
        return;
      }

      // Check if session was already established concurrently
      const { data: existing } = await supabase.auth.getSession();
      if (existing.session?.user) {
        await syncStoredAgeConsent(existing.session.user.id);
        window.location.replace(targetNext);
        return;
      }

      if (error) {
        throw error;
      }
    }

    nativeDeepLinkInProgress = false;
    onProcessing?.(false);
  } catch (err) {
    nativeDeepLinkInProgress = false;
    onProcessing?.(false);
    const message =
      err instanceof Error ? err.message : "Could not complete Google sign-in. Please try again.";
    window.location.replace(`/auth?error_description=${encodeURIComponent(message)}`);
  }
}

/**
 * Registers global Capacitor cold-launch and warm-resume deep link listeners
 * so OAuth callbacks returning via bondoo://auth or verified HTTPS links complete inside the app.
 */
export function setupNativeAuthDeepLinkListener(
  onProcessing?: (busy: boolean) => void,
): () => void {
  if (!isNativeMobileApp()) {
    return () => {};
  }

  let disposed = false;
  let removeAppUrlListener: (() => void) | null = null;

  App.getLaunchUrl()
    .then((launch) => {
      if (!disposed && launch?.url) {
        void handleIncomingDeepLink(launch.url, onProcessing);
      }
    })
    .catch(() => {
      /* ignore on web */
    });

  App.addListener("appUrlOpen", (event) => {
    if (!disposed && event.url) {
      void handleIncomingDeepLink(event.url, onProcessing);
    }
  })
    .then((handle) => {
      if (disposed) {
        void handle.remove();
      } else {
        removeAppUrlListener = () => {
          void handle.remove();
        };
      }
    })
    .catch(() => {
      /* ignore */
    });

  return () => {
    disposed = true;
    removeAppUrlListener?.();
  };
}
