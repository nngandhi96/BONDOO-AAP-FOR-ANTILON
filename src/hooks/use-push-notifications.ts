import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getPushConfig,
  savePushSubscription,
  deletePushSubscription,
} from "@/lib/push.functions";

function b64urlToUint8(b64url: string): Uint8Array {
  const pad = b64url.length % 4 === 2 ? "==" : b64url.length % 4 === 3 ? "=" : "";
  const b64 = (b64url + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bufToB64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export type PushStatus =
  | "unsupported"
  | "unconfigured"
  | "loading"
  | "denied"
  | "off"
  | "on";

export function usePushNotifications() {
  const [status, setStatus] = useState<PushStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const fetchConfig = useServerFn(getPushConfig);
  const saveSub = useServerFn(savePushSubscription);
  const deleteSub = useServerFn(deletePushSubscription);

  const supported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;

  const refresh = useCallback(async () => {
    if (!supported) {
      setStatus("unsupported");
      return;
    }
    try {
      const cfg = await fetchConfig();
      if (!cfg.vapidPublicKey) {
        setStatus("unconfigured");
        return;
      }
      if (Notification.permission === "denied") {
        setStatus("denied");
        return;
      }
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const existing = await reg?.pushManager.getSubscription();
      setStatus(existing ? "on" : "off");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Push init failed");
      setStatus("off");
    }
  }, [fetchConfig, supported]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const enable = useCallback(async () => {
    setError(null);
    if (!supported) return;
    try {
      const cfg = await fetchConfig();
      if (!cfg.vapidPublicKey) {
        setStatus("unconfigured");
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg =
        (await navigator.serviceWorker.getRegistration("/sw.js")) ??
        (await navigator.serviceWorker.register("/sw.js"));
      await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: b64urlToUint8(cfg.vapidPublicKey) as BufferSource,
        });
      }
      const key = sub.getKey("p256dh");
      const auth = sub.getKey("auth");
      if (!key || !auth) throw new Error("Missing subscription keys");
      await saveSub({
        data: {
          endpoint: sub.endpoint,
          p256dh: bufToB64url(key),
          auth: bufToB64url(auth),
          userAgent: navigator.userAgent.slice(0, 300),
        },
      });
      setStatus("on");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not enable notifications");
    }
  }, [fetchConfig, saveSub, supported]);

  const disable = useCallback(async () => {
    setError(null);
    if (!supported) return;
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await deleteSub({ data: { endpoint: sub.endpoint } });
        await sub.unsubscribe();
      }
      setStatus("off");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not disable notifications");
    }
  }, [deleteSub, supported]);

  return { status, error, enable, disable, refresh };
}