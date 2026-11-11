import { useState } from "react";
import { POPULAR_CITIES, ALL_CITIES_LABEL, normalizeCityName } from "@/lib/location";

interface CitySelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCity: string;
  onSelectCity: (city: string) => void;
  onDetectLocation: () => Promise<void>;
  isDetecting: boolean;
}

export function CitySelectorModal({
  isOpen,
  onClose,
  selectedCity,
  onSelectCity,
  onDetectLocation,
  isDetecting,
}: CitySelectorModalProps) {
  const [search, setSearch] = useState("");

  if (!isOpen) return null;

  const filteredCities = POPULAR_CITIES.filter((c) =>
    c.toLowerCase().includes(search.trim().toLowerCase()),
  );

  function handleCustomSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!search.trim()) return;
    const normalized = normalizeCityName(search.trim());
    onSelectCity(normalized);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-ink/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-background rounded-3xl p-6 shadow-2xl border border-border animate-in slide-in-from-bottom duration-200"
      >
        <div className="flex items-center justify-between pb-3 border-b border-border">
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-brand-orange font-semibold">
              Location Filter · 100 km Radius
            </p>
            <h3 className="display text-2xl text-ink leading-tight mt-0.5">
              Select your <em className="text-primary not-italic">city</em>
            </h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Showing posts within 100 km radius of your location
            </p>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-full bg-paper border border-border text-muted-foreground hover:text-ink flex items-center justify-center text-sm font-semibold transition"
          >
            ✕
          </button>
        </div>

        {/* GPS Auto-Detect Button */}
        <div className="mt-4">
          <button
            type="button"
            onClick={async () => {
              await onDetectLocation();
              onClose();
            }}
            disabled={isDetecting}
            className="w-full flex items-center justify-center gap-2.5 rounded-2xl bg-primary/10 border border-primary/30 py-3 px-4 text-primary font-semibold text-xs hover:bg-primary/15 active:scale-[0.99] transition disabled:opacity-50"
          >
            <span className="text-base">{isDetecting ? "⏳" : "🎯"}</span>
            <span>{isDetecting ? "Detecting current city…" : "Detect My Current City via GPS"}</span>
          </button>
        </div>

        {/* Search or Type Custom City */}
        <form onSubmit={handleCustomSubmit} className="mt-4">
          <div className="relative">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search or enter city (e.g. Delhi, Patna)…"
              className="w-full rounded-2xl border border-border bg-paper px-4 py-3 text-sm text-ink outline-none focus:border-primary transition"
            />
            {search.trim() && (
              <button
                type="submit"
                className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-xl bg-ink text-background text-xs font-semibold hover:bg-ink/90 transition"
              >
                Set
              </button>
            )}
          </div>
        </form>

        {/* Popular Cities Grid */}
        <div className="mt-4 max-h-64 overflow-y-auto no-scrollbar pr-1">
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-semibold mb-2">
            Popular Cities
          </p>
          <div className="grid grid-cols-2 gap-2">
            {filteredCities.map((c) => {
              const isSelected = selectedCity.toLowerCase() === c.toLowerCase();
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    onSelectCity(c);
                    onClose();
                  }}
                  className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium border text-left transition ${
                    isSelected
                      ? "bg-brand-orange text-ink border-brand-orange font-semibold shadow-sm"
                      : "bg-paper text-ink border-border hover:bg-surface"
                  }`}
                >
                  <span className="truncate">{c === ALL_CITIES_LABEL ? "🌐 All Cities" : `📍 ${c}`}</span>
                  {isSelected && <span className="text-xs">✓</span>}
                </button>
              );
            })}
          </div>

          {filteredCities.length === 0 && search.trim() && (
            <div className="text-center py-6">
              <p className="text-sm text-ink font-semibold">"{search.trim()}" not in popular list</p>
              <button
                type="button"
                onClick={handleCustomSubmit}
                className="mt-2 text-xs text-primary font-semibold underline underline-offset-2"
              >
                Use "{normalizeCityName(search.trim())}" anyway
              </button>
            </div>
          )}
        </div>

        <div className="mt-5 pt-3 border-t border-border flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-muted-foreground hover:text-ink transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

