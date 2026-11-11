import { useState, useEffect } from "react";
import { Capacitor } from "@capacitor/core";

/**
 * Returns true if the app is currently running inside a native mobile wrapper (Android / iOS via Capacitor).
 */
export function isNativeMobileApp(): boolean {
  if (typeof window === "undefined") return false;
  const win = window as unknown as {
    BondooNativeAuth?: unknown;
    androidBridge?: unknown;
    webkit?: { messageHandlers?: { bridge?: unknown } };
    Capacitor?: { isNativePlatform?: () => boolean };
  };
  return (
    Capacitor.isNativePlatform() ||
    !!win.BondooNativeAuth ||
    !!win.androidBridge ||
    !!win.webkit?.messageHandlers?.bridge ||
    (typeof win.Capacitor?.isNativePlatform === "function" && !!win.Capacitor.isNativePlatform()) ||
    /;\s*wv\)/i.test(navigator.userAgent)
  );
}

/**
 * Returns true if running inside an external Android mobile browser (Chrome / Custom Tabs),
 * outside the Bondoo native WebView wrapper.
 */
export function isAndroidBrowser(): boolean {
  if (typeof window === "undefined") return false;
  return !isNativeMobileApp() && /Android/i.test(navigator.userAgent);
}

/**
 * Returns the current platform name ('web' | 'android' | 'ios').
 */
export function getAppPlatform(): string {
  if (typeof window === "undefined") return "web";
  return Capacitor.getPlatform();
}

/**
 * Returns true if the user is running on a standard web browser.
 */
export function isWebBrowser(): boolean {
  return !isNativeMobileApp();
}

/**
 * Hook to get reactive platform and screen information.
 */
export function usePlatform() {
  const [isNative, setIsNative] = useState(false);
  const [platformName, setPlatformName] = useState("web");
  const [isMobileScreen, setIsMobileScreen] = useState(false);

  useEffect(() => {
    setIsNative(isNativeMobileApp());
    setPlatformName(getAppPlatform());

    const checkScreen = () => {
      setIsMobileScreen(window.innerWidth < 768);
    };

    checkScreen();
    window.addEventListener("resize", checkScreen);
    return () => window.removeEventListener("resize", checkScreen);
  }, []);

  return {
    isNative,
    isWeb: !isNative,
    platform: platformName,
    isMobileScreen,
  };
}
