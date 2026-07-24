import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getGovIdSignedUrl } from "@/lib/gov-id.functions";

type Props = {
  targetUserId: string;
  targetName: string;
  viewerName: string;
  open: boolean;
  onClose: () => void;
};

/**
 * View-only Government ID modal.
 * - Signed URL expires in 60s and is re-fetched on demand.
 * - Right-click, drag, selection, and long-press are disabled.
 * - A live watermark (viewer name + timestamp) is overlaid on the image.
 * - No download / save button is ever rendered.
 *
 * NOTE: OS-level screenshots cannot be blocked in a web app. The watermark
 * makes any leaked capture traceable, and every view is logged server-side.
 */
export function GovIdViewer({ targetUserId, targetName, viewerName, open, onClose }: Props) {
  const fetchUrl = useServerFn(getGovIdSignedUrl);
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "ready"; url: string; verified: boolean; expiresAt: number }
    | { kind: "expired" }
    | { kind: "error"; msg: string }
  >({ kind: "idle" });
  const [now, setNow] = useState(() => Date.now());
  const imgRef = useRef<HTMLImageElement | null>(null);

  // Load the signed URL when the modal opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setState({ kind: "loading" });
    fetchUrl({ data: { targetUserId } })
      .then((res) => {
        if (cancelled) return;
        setState({
          kind: "ready",
          url: res.url,
          verified: res.verified,
          expiresAt: Date.now() + res.expiresInSeconds * 1000,
        });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setState({
          kind: "error",
          msg: e instanceof Error ? e.message : "Could not open ID.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [open, targetUserId, fetchUrl]);

  // Ticker for watermark timestamp + expiry countdown.
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [open]);

  // Auto-expire on the client too.
  useEffect(() => {
    if (state.kind !== "ready") return;
    if (now >= state.expiresAt) setState({ kind: "expired" });
  }, [now, state]);

  // Blur the ID whenever the tab/window loses focus (guards screen-share).
  const [focused, setFocused] = useState(true);
  useEffect(() => {
    if (!open) return;
    const onBlur = () => setFocused(false);
    const onFocus = () => setFocused(true);
    const onVis = () => setFocused(!document.hidden);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [open]);

  if (!open) return null;

  const secondsLeft =
    state.kind === "ready"
      ? Math.max(0, Math.round((state.expiresAt - now) / 1000))
      : 0;
  const stamp = new Date(now).toISOString().replace("T", " ").slice(0, 19);
  const watermark = `${viewerName} · ${stamp} · Bondoo`;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 flex flex-col"
      onContextMenu={(e) => e.preventDefault()}
    >
      <header className="flex items-center justify-between px-4 py-3 text-white">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.22em] opacity-70">
            View-only · {targetName}'s ID
          </p>
          <p className="text-xs opacity-70">
            {state.kind === "ready"
              ? `Link expires in ${secondsLeft}s`
              : state.kind === "expired"
                ? "Link expired"
                : ""}
          </p>
        </div>
        <button
          onClick={onClose}
          className="rounded-full border border-white/30 px-3 py-1 text-xs font-semibold"
        >
          Close
        </button>
      </header>

      <div className="flex-1 flex items-center justify-center p-4">
        {state.kind === "loading" && (
          <p className="text-white/70 text-sm">Preparing secure view…</p>
        )}
        {state.kind === "error" && (
          <p className="max-w-xs text-center text-red-200 text-sm">{state.msg}</p>
        )}
        {state.kind === "expired" && (
          <button
            onClick={() => {
              setState({ kind: "loading" });
              fetchUrl({ data: { targetUserId } })
                .then((res) =>
                  setState({
                    kind: "ready",
                    url: res.url,
                    verified: res.verified,
                    expiresAt: Date.now() + res.expiresInSeconds * 1000,
                  }),
                )
                .catch((e: unknown) =>
                  setState({
                    kind: "error",
                    msg: e instanceof Error ? e.message : "Could not open ID.",
                  }),
                );
            }}
            className="rounded-full bg-white text-black px-4 py-2 text-sm font-semibold"
          >
            Reopen for 60s
          </button>
        )}
        {state.kind === "ready" && (
          <div
            className="relative max-w-full max-h-full select-none"
            style={{
              WebkitUserSelect: "none",
              userSelect: "none",
              WebkitTouchCallout: "none",
            }}
          >
            <img
              ref={imgRef}
              src={state.url}
              alt="Government ID (view only)"
              draggable={false}
              onDragStart={(e) => e.preventDefault()}
              onContextMenu={(e) => e.preventDefault()}
              className={`max-h-[70vh] max-w-full object-contain rounded-lg pointer-events-none transition-[filter] duration-200 ${
                focused ? "" : "blur-2xl"
              }`}
              style={{ WebkitUserDrag: "none" } as React.CSSProperties}
            />
            {/* Diagonal repeated watermark overlay */}
            <div
              aria-hidden
              className="absolute inset-0 pointer-events-none overflow-hidden rounded-lg opacity-60 mix-blend-difference"
              style={{
                backgroundImage: `repeating-linear-gradient(-30deg, transparent 0 60px, rgba(255,255,255,0.05) 60px 61px)`,
              }}
            >
              <div className="absolute inset-0 flex flex-wrap items-center justify-center rotate-[-24deg] gap-6 p-6 text-[10px] font-semibold text-white/70 uppercase tracking-[0.2em]">
                {Array.from({ length: 24 }).map((_, i) => (
                  <span key={i}>{watermark}</span>
                ))}
              </div>
            </div>
            {!focused && (
              <p className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-white text-sm font-semibold">
                Hidden while window is inactive
              </p>
            )}
          </div>
        )}
      </div>

      <footer className="px-4 py-3 text-center text-[11px] text-white/60">
        View is logged. Screenshots &amp; downloads violate Bondoo's Terms.
      </footer>
    </div>
  );
}