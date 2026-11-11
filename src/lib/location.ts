import { Geolocation } from "@capacitor/geolocation";
import { isNativeMobileApp } from "@/lib/platform";

export type Coordinates = {
  latitude: number;
  longitude: number;
};

export type LocationResult = {
  city: string; // Formatted city name, e.g. "Delhi"
  cityNormalized: string; // Lowercase city name, e.g. "delhi"
  latitude: number | null;
  longitude: number | null;
  source: "gps" | "cache" | "profile" | "manual" | "fallback";
};

export const DEFAULT_FALLBACK_CITY = "Delhi";
export const ALL_CITIES_LABEL = "All Cities";

export const POPULAR_CITIES = [
  ALL_CITIES_LABEL,
  "Delhi",
  "Patna",
  "Mumbai",
  "Bengaluru",
  "Kolkata",
  "Hyderabad",
  "Pune",
  "Chennai",
  "Jaipur",
  "Ahmedabad",
  "Lucknow",
  "Chandigarh",
  "Noida",
  "Gurugram",
  "Indore",
  "Bhopal",
  "Ranchi",
] as const;

const STORAGE_KEY_SELECTED_CITY = "bondoo_selected_city";
const STORAGE_KEY_CACHED_CITY = "bondoo_cached_city";
const STORAGE_KEY_CACHED_LAT = "bondoo_cached_lat";
const STORAGE_KEY_CACHED_LNG = "bondoo_cached_lng";

/**
 * Standardize city names (e.g. "New Delhi" -> "Delhi", "Bangalore" -> "Bengaluru")
 */
export function normalizeCityName(raw: string): string {
  const clean = raw.trim();
  const lower = clean.toLowerCase();

  if (lower.includes("delhi")) return "Delhi";
  if (lower.includes("patna")) return "Patna";
  if (lower.includes("mumbai") || lower.includes("bombay")) return "Mumbai";
  if (lower.includes("bengaluru") || lower.includes("bangalore")) return "Bengaluru";
  if (lower.includes("kolkata") || lower.includes("calcutta")) return "Kolkata";
  if (lower.includes("hyderabad")) return "Hyderabad";
  if (lower.includes("chennai") || lower.includes("madras")) return "Chennai";
  if (lower.includes("pune")) return "Pune";
  if (lower.includes("jaipur")) return "Jaipur";
  if (lower.includes("lucknow")) return "Lucknow";
  if (lower.includes("ahmedabad")) return "Ahmedabad";
  if (lower.includes("chandigarh")) return "Chandigarh";
  if (lower.includes("noida")) return "Noida";
  if (lower.includes("gurugram") || lower.includes("gurgaon")) return "Gurugram";

  // Title-case default
  return clean.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Get saved city preference from localStorage
 */
export function getSavedCity(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(STORAGE_KEY_SELECTED_CITY) || localStorage.getItem(STORAGE_KEY_CACHED_CITY);
  } catch {
    return null;
  }
}

/**
 * Save selected city preference to localStorage
 */
export function saveSelectedCity(city: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY_SELECTED_CITY, city);
  } catch {}
}

/**
 * Retrieve user's current GPS coordinates using @capacitor/geolocation with navigator fallback
 */
export async function getDeviceCoordinates(): Promise<Coordinates | null> {
  // 1. Try Capacitor Geolocation plugin
  try {
    const position = await Geolocation.getCurrentPosition({
      enableHighAccuracy: false,
      timeout: 8000,
      maximumAge: 300000, // 5 min cache
    });
    if (position?.coords) {
      return {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
    }
  } catch (capError) {
    console.warn("[Location] Capacitor Geolocation error, falling back to navigator", capError);
  }

  // 2. Fallback to Web Geolocation API
  if (typeof window !== "undefined" && "geolocation" in navigator) {
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          timeout: 8000,
          maximumAge: 300000,
        });
      });
      return {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      };
    } catch (navError) {
      console.warn("[Location] Navigator Geolocation failed or permission denied", navError);
    }
  }

  return null;
}

/**
 * Reverse-geocode latitude and longitude into a clean standardized city name using OpenStreetMap Nominatim
 */
export async function reverseGeocodeCity(lat: number, lng: number): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&zoom=10&addressdetails=1`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "BondooApp/1.0.6",
      },
    });
    clearTimeout(timeoutId);

    if (!res.ok) return null;
    const json = await res.json();
    const addr = json?.address;
    if (!addr) return null;

    const rawCity: string | undefined =
      addr.city ||
      addr.town ||
      addr.village ||
      addr.municipality ||
      addr.state_district ||
      addr.suburb ||
      addr.county ||
      addr.state;

    if (!rawCity) return null;
    const standardized = normalizeCityName(rawCity);

    // Cache locally
    try {
      localStorage.setItem(STORAGE_KEY_CACHED_CITY, standardized);
      localStorage.setItem(STORAGE_KEY_CACHED_LAT, String(lat));
      localStorage.setItem(STORAGE_KEY_CACHED_LNG, String(lng));
    } catch {}

    return standardized;
  } catch (e) {
    console.warn("[Location] Reverse geocoding failed", e);
    return null;
  }
}

/**
 * Master helper: resolves the user's city following a robust fallback hierarchy:
 * 1. Active manual selection in localStorage
 * 2. GPS coordinates detection + reverse geocoding
 * 3. Cached city in localStorage
 * 4. User profile home_city or neighbourhood
 * 5. Default fallback city (Delhi)
 */
export async function resolveUserCity(
  profileFallback?: { home_city?: string | null; neighbourhood?: string | null; home_lat?: number | null; home_lng?: number | null } | null,
  forceDetectGps = false,
): Promise<LocationResult> {
  // 1. If manual selection exists and not forcing fresh GPS detection
  if (!forceDetectGps && typeof window !== "undefined") {
    const manual = localStorage.getItem(STORAGE_KEY_SELECTED_CITY);
    if (manual && manual.trim()) {
      const latStr = localStorage.getItem(STORAGE_KEY_CACHED_LAT);
      const lngStr = localStorage.getItem(STORAGE_KEY_CACHED_LNG);
      return {
        city: manual.trim(),
        cityNormalized: manual.trim().toLowerCase(),
        latitude: latStr ? parseFloat(latStr) : null,
        longitude: lngStr ? parseFloat(lngStr) : null,
        source: "manual",
      };
    }
  }

  // 2. Try GPS coordinates detection
  const coords = await getDeviceCoordinates();
  if (coords) {
    const geocoded = await reverseGeocodeCity(coords.latitude, coords.longitude);
    if (geocoded) {
      return {
        city: geocoded,
        cityNormalized: geocoded.toLowerCase(),
        latitude: coords.latitude,
        longitude: coords.longitude,
        source: "gps",
      };
    }
  }

  // 3. Cached city in localStorage
  if (typeof window !== "undefined") {
    const cached = localStorage.getItem(STORAGE_KEY_CACHED_CITY);
    if (cached && cached.trim()) {
      const latStr = localStorage.getItem(STORAGE_KEY_CACHED_LAT);
      const lngStr = localStorage.getItem(STORAGE_KEY_CACHED_LNG);
      return {
        city: cached.trim(),
        cityNormalized: cached.trim().toLowerCase(),
        latitude: latStr ? parseFloat(latStr) : null,
        longitude: lngStr ? parseFloat(lngStr) : null,
        source: "cache",
      };
    }
  }

  // 4. User profile fallback
  const profCity = profileFallback?.home_city || profileFallback?.neighbourhood;
  if (profCity && profCity.trim()) {
    const standardized = normalizeCityName(profCity.trim());
    return {
      city: standardized,
      cityNormalized: standardized.toLowerCase(),
      latitude: profileFallback?.home_lat ?? null,
      longitude: profileFallback?.home_lng ?? null,
      source: "profile",
    };
  }

  // 5. Default fallback
  return {
    city: DEFAULT_FALLBACK_CITY,
    cityNormalized: DEFAULT_FALLBACK_CITY.toLowerCase(),
    latitude: 28.6139,
    longitude: 77.209,
    source: "fallback",
  };
}
