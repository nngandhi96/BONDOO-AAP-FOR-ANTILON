import { useEffect, useState } from "react";

const STORAGE_KEY = "bondoo.age_consent.v1";
const MIN_AGE = 14;

export type AgeConsent = {
  confirmedAt: string; // ISO
  minAge: number;
};

export function getStoredAgeConsent(): AgeConsent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AgeConsent;
    if (!parsed?.confirmedAt || parsed.minAge < MIN_AGE) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveConsent(): AgeConsent {
  const consent: AgeConsent = {
    confirmedAt: new Date().toISOString(),
    minAge: MIN_AGE,
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(consent));
  return consent;
}

export function AgeGate({ onConfirm }: { onConfirm?: (c: AgeConsent) => void }) {
  const [open, setOpen] = useState(false);
  const [declined, setDeclined] = useState(false);

  useEffect(() => {
    setOpen(!getStoredAgeConsent());
  }, []);

  if (!open) return null;

  if (declined) {
    return (
      <div className="fixed inset-0 z-[60] bg-ink/70 backdrop-blur-sm flex items-center justify-center px-6">
        <div className="max-w-sm w-full bg-paper rounded-3xl border border-border p-7 text-center">
          <h2 className="display text-3xl text-ink">Sorry — you must be 14+</h2>
          <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
            Bondoo is only available to people aged {MIN_AGE} and above. Please
            come back when you're old enough.
          </p>
          <button
            onClick={() => setDeclined(false)}
            className="mt-6 text-primary text-sm font-medium"
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[60] bg-ink/70 backdrop-blur-sm flex items-center justify-center px-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="age-gate-title"
    >
      <div className="max-w-sm w-full bg-paper rounded-3xl border border-border p-7">
        <p className="text-[10px] uppercase tracking-[0.22em] text-brand-orange font-semibold">
          Age check
        </p>
        <h2 id="age-gate-title" className="display text-3xl mt-2 text-ink leading-tight">
          Are you {MIN_AGE} or older?
        </h2>
        <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
          Bondoo is for people aged {MIN_AGE}+. By continuing you confirm your age
          and agree to our safety guidelines.
        </p>
        <div className="mt-6 space-y-2.5">
          <button
            onClick={() => {
              const c = saveConsent();
              setOpen(false);
              onConfirm?.(c);
            }}
            className="w-full rounded-2xl bg-ink text-background font-semibold py-3.5"
          >
            Yes, I'm {MIN_AGE} or older
          </button>
          <button
            onClick={() => setDeclined(true)}
            className="w-full rounded-2xl bg-transparent border border-border text-ink font-medium py-3.5"
          >
            No, I'm younger
          </button>
        </div>
      </div>
    </div>
  );
}