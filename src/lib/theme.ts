export type ThemeMode = "editorial" | "genz";

export const THEME_STORAGE_KEY = "bondoo_theme_mode";

/**
 * Retrieve saved theme preference from localStorage with fallback to editorial
 */
export function getSavedTheme(): ThemeMode {
  if (typeof window === "undefined") return "editorial";
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "genz" || saved === "editorial") {
      return saved;
    }
  } catch {}
  return "editorial";
}

/**
 * Save theme preference to localStorage and apply it to document root
 */
export function saveTheme(mode: ThemeMode): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {}
  applyThemeToDocument(mode);
}

/**
 * Apply theme data-attribute and dark class to document root
 */
export function applyThemeToDocument(mode: ThemeMode): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", mode);
  if (mode === "genz") {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
}

