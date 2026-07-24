import { useState } from "react";

type Props = {
  place: string;
  address?: string | null;
  className?: string;
};

/** Keyless Google Maps embed + shareable link with copy. */
export function MapPreview({ place, address, className = "" }: Props) {
  const query = [place, address].filter(Boolean).join(", ");
  const q = encodeURIComponent(query);
  const embedSrc = `https://www.google.com/maps?q=${q}&output=embed`;
  const shareUrl = `https://www.google.com/maps/search/?api=1&query=${q}`;
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className={`rounded-2xl overflow-hidden border border-border bg-paper ${className}`}>
      <div className="relative aspect-[16/10] bg-secondary">
        <iframe
          key={q}
          title={`Map preview for ${query}`}
          src={embedSrc}
          className="absolute inset-0 h-full w-full"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allowFullScreen
        />
      </div>
      <div className="flex items-center gap-2 px-3 py-2 border-t border-border bg-background">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
            Shareable link
          </p>
          <p className="text-xs text-ink truncate">{shareUrl}</p>
        </div>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 text-[11px] uppercase tracking-[0.18em] font-semibold px-3 py-1.5 rounded-full bg-ink text-background"
        >
          {copied ? "Copied ✓" : "Copy"}
        </button>
        <a
          href={shareUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="shrink-0 text-[11px] uppercase tracking-[0.18em] font-semibold px-3 py-1.5 rounded-full border border-border text-ink"
        >
          Open ↗
        </a>
      </div>
    </div>
  );
}