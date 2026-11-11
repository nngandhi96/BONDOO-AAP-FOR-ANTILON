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
export const DEFAULT_RADIUS_KM = 100;

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

/**
 * Standard coordinates for major Indian cities (latitude, longitude)
 */
export const CITY_COORDINATES: Record<string, Coordinates> = {
  Delhi: { latitude: 28.6139, longitude: 77.209 },
  Patna: { latitude: 25.5941, longitude: 85.1376 },
  Mumbai: { latitude: 19.076, longitude: 72.8777 },
  Bengaluru: { latitude: 12.9716, longitude: 77.5946 },
  Kolkata: { latitude: 22.5726, longitude: 88.3639 },
  Hyderabad: { latitude: 17.385, longitude: 78.4867 },
  Pune: { latitude: 18.5204, longitude: 73.8567 },
  Chennai: { latitude: 13.0827, longitude: 80.2707 },
  Jaipur: { latitude: 26.9124, longitude: 75.7873 },
  Ahmedabad: { latitude: 23.0225, longitude: 72.5714 },
  Lucknow: { latitude: 26.8467, longitude: 80.9462 },
  Chandigarh: { latitude: 30.7333, longitude: 76.7794 },
  Noida: { latitude: 28.5355, longitude: 77.391 },
  Gurugram: { latitude: 28.4595, longitude: 77.0266 },
  Indore: { latitude: 22.7196, longitude: 75.8577 },
  Bhopal: { latitude: 23.2599, longitude: 77.4126 },
  Ranchi: { latitude: 23.3441, longitude: 85.3096 },
};

/**
 * Get coordinates for a given city name
 */
export function getCityCoordinates(cityName?: string | null): Coordinates | null {
  if (!cityName) return null;
  const norm = normalizeCityName(cityName);
  return CITY_COORDINATES[norm] ?? null;
}

/**
 * Haversine distance in kilometers between two GPS coordinate points
 */
export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371; // Earth radius in km
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

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
 * Get saved coordinates preference from localStorage
 */
export function getSavedCoordinates(): Coordinates | null {
  if (typeof window === "undefined") return null;
  try {
    const latStr = localStorage.getItem(STORAGE_KEY_CACHED_LAT);
    const lngStr = localStorage.getItem(STORAGE_KEY_CACHED_LNG);
    if (latStr && lngStr) {
      const lat = parseFloat(latStr);
      const lng = parseFloat(lngStr);
      if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
        return { latitude: lat, longitude: lng };
      }
    }
  } catch {}
  return null;
}

/**
 * Save coordinates preference to localStorage
 */
export function saveCoordinates(lat: number, lng: number): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY_CACHED_LAT, String(lat));
    localStorage.setItem(STORAGE_KEY_CACHED_LNG, String(lng));
  } catch {}
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
    // If coordinates for this city exist in lookup, cache them too
    const coords = getCityCoordinates(city);
    if (coords) {
      saveCoordinates(coords.latitude, coords.longitude);
    }
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
      const savedCoords = getSavedCoordinates();
      const cityCoords = getCityCoordinates(manual.trim());
      const finalLat = savedCoords?.latitude ?? cityCoords?.latitude ?? null;
      const finalLng = savedCoords?.longitude ?? cityCoords?.longitude ?? null;
      return {
        city: manual.trim(),
        cityNormalized: manual.trim().toLowerCase(),
        latitude: finalLat,
        longitude: finalLng,
        source: "manual",
      };
    }
  }

  // 2. Try GPS coordinates detection
  const coords = await getDeviceCoordinates();
  if (coords) {
    saveCoordinates(coords.latitude, coords.longitude);
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
      const savedCoords = getSavedCoordinates();
      const cityCoords = getCityCoordinates(cached.trim());
      return {
        city: cached.trim(),
        cityNormalized: cached.trim().toLowerCase(),
        latitude: savedCoords?.latitude ?? cityCoords?.latitude ?? null,
        longitude: savedCoords?.longitude ?? cityCoords?.longitude ?? null,
        source: "cache",
      };
    }
  }

  // 4. User profile fallback
  const profCity = profileFallback?.home_city || profileFallback?.neighbourhood;
  if (profCity && profCity.trim()) {
    const standardized = normalizeCityName(profCity.trim());
    const cityCoords = getCityCoordinates(standardized);
    return {
      city: standardized,
      cityNormalized: standardized.toLowerCase(),
      latitude: profileFallback?.home_lat ?? cityCoords?.latitude ?? null,
      longitude: profileFallback?.home_lng ?? cityCoords?.longitude ?? null,
      source: "profile",
    };
  }

  // 5. Default fallback (Delhi)
  const defaultCoords = CITY_COORDINATES[DEFAULT_FALLBACK_CITY];
  return {
    city: DEFAULT_FALLBACK_CITY,
    cityNormalized: DEFAULT_FALLBACK_CITY.toLowerCase(),
    latitude: defaultCoords.latitude,
    longitude: defaultCoords.longitude,
    source: "fallback",
  };
}

