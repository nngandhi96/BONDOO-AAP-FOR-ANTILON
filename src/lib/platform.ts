import { useState, useEffect } from "react";
import { Capacitor } from "@capacitor/core";

/**
 * Returns true if the app is currently running inside a native mobile wrapper (Android / iOS via Capacitor).
 */
export function isNativeMobileApp(): boolean {
  if (typeof window === "undefined") return false;
  return Capacitor.isNativePlatform();
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
