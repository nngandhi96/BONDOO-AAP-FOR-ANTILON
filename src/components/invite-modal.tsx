import { useState } from "react";
import { Copy, Check, Share2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import type { ThemeMode } from "@/lib/theme";

interface InviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  themeMode?: ThemeMode;
  shareUrl?: string;
  title?: string;
  description?: string;
}

const DEFAULT_SHARE_URL = "https://www.bondooconnect.com";
const DEFAULT_TITLE = "Join me on Bondoo! ⚡";
const DEFAULT_TEXT =
  "Bondoo connects verified people nearby for walks, coffee, and study sessions in public spots. No dating agenda, just genuine company! ☕🌳";

export function InviteModal({
  isOpen,
  onClose,
  themeMode = "zine",
  shareUrl = DEFAULT_SHARE_URL,
  title = DEFAULT_TITLE,
  description = DEFAULT_TEXT,
}: InviteModalProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const isGenZ = themeMode === "genz";
  const fullShareText = `${title}\n\n${description}\n\nCheck it out here: ${shareUrl}`;

  async function handleCopy() {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = shareUrl;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }
      setCopied(true);
      toast.success("Link copied to clipboard!");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("Could not copy link automatically");
    }
  }

  function handleWhatsApp() {
    const text = encodeURIComponent(`${title}\n\n${description}\n\n${shareUrl}`);
    window.open(`https://api.whatsapp.com/send?text=${text}`, "_blank");
    toast.success("Opening WhatsApp…");
  }

  async function handleInstagram() {
    try {
      await navigator.clipboard.writeText(fullShareText);
      toast.success("Invite copied! Paste it in your Instagram Chat or Story.");
    } catch {
      /* ignore */
    }

    if (navigator.share) {
      try {
        await navigator.share({
          title,
          text: description,
          url: shareUrl,
        });
        return;
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
      }
    }

    // Try app link or web fallback
    window.open("https://instagram.com/direct/inbox/", "_blank");
  }

  async function handleSnapchat() {
    try {
      await navigator.clipboard.writeText(fullShareText);
    } catch {
      /* ignore */
    }

    if (navigator.share) {
      try {
        await navigator.share({
          title,
          text: description,
          url: shareUrl,
        });
        return;
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
      }
    }

    // Snapchat web share attachment URL
    const snapUrl = `https://www.snapchat.com/scan?attachmentUrl=${encodeURIComponent(shareUrl)}`;
    window.open(snapUrl, "_blank");
    toast.success("Opening Snapchat…");
  }

  function handleFacebook() {
    const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
      shareUrl,
    )}&quote=${encodeURIComponent(fullShareText)}`;
    window.open(fbUrl, "_blank", "width=600,height=500");
  }

  function handleTwitter() {
    const tweet = encodeURIComponent(`${title}\n\n${description}`);
    const twitterUrl = `https://twitter.com/intent/tweet?text=${tweet}&url=${encodeURIComponent(
      shareUrl,
    )}`;
    window.open(twitterUrl, "_blank", "width=600,height=500");
  }

  async function handleNativeShare() {
    if (navigator.share) {
      try {
        await navigator.share({
          title,
          text: description,
          url: shareUrl,
        });
        return;
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
      }
    }
    // Fallback: copy link
    handleCopy();
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-md rounded-3xl p-6 shadow-2xl border transition-all animate-in slide-in-from-bottom duration-200 ${
          isGenZ
            ? "bg-[#0E121E] text-white border-[#222A40] shadow-[0_0_50px_rgba(91,104,246,0.15)]"
            : "bg-background text-ink border-border shadow-2xl"
        }`}
      >
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-white/10 dark:border-white/10">
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <Sparkles className={`w-3.5 h-3.5 ${isGenZ ? "text-[#FFA84A]" : "text-brand-orange"}`} />
              <p
                className={`text-[10px] uppercase font-bold tracking-[0.2em] ${
                  isGenZ ? "text-[#FFA84A]" : "text-brand-orange"
                }`}
              >
                {isGenZ ? "GROW THE CIRCLE ⚡" : "INVITE YOUR FRIENDS · BONDOO"}
              </p>
            </div>
            <h3
              className={`text-2xl font-extrabold leading-tight ${
                isGenZ ? "tracking-tight text-white font-['Plus_Jakarta_Sans',sans-serif]" : "display text-ink"
              }`}
            >
              Bring friends to <em className="text-primary not-italic">Bondoo</em>
            </h3>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Meetups are better with good people. Share with your circle on social media!
            </p>
          </div>
          <button
            onClick={onClose}
            className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-semibold transition active:scale-95 shrink-0 ${
              isGenZ
                ? "bg-[#161C2E] border border-[#2A3450] text-[#8E9BB0] hover:text-white"
                : "bg-paper border border-border text-muted-foreground hover:text-ink"
            }`}
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Big WhatsApp CTA Button */}
        <div className="mt-5">
          <button
            type="button"
            onClick={handleWhatsApp}
            className="w-full flex items-center justify-center gap-2.5 rounded-2xl bg-[#25D366] hover:bg-[#20ba5a] text-white font-bold py-3.5 px-4 shadow-lg shadow-[#25D366]/20 active:scale-[0.99] transition cursor-pointer"
          >
            {/* WhatsApp SVG Icon */}
            <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
              <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.771-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.299.045-.677.063-1.092-.069-.252-.08-.575-.187-.988-.365-1.739-.751-2.874-2.502-2.961-2.617-.087-.116-.708-.94-.708-1.793s.448-1.273.607-1.446c.159-.173.346-.217.462-.217l.332.006c.106.005.249-.04.39.298.144.347.491 1.2.534 1.287.043.087.072.188.014.304-.058.116-.087.188-.173.289l-.26.304c-.087.086-.177.18-.076.354.101.174.449.741.964 1.201.662.591 1.221.774 1.394.86s.275.072.376-.043c.101-.116.433-.506.549-.68.116-.173.231-.145.39-.087s1.011.477 1.184.564.289.13.332.202c.045.072.045.419-.099.824zm-3.423-14.416c-6.627 0-12 5.373-12 12 0 2.155.57 4.178 1.564 5.923l-1.664 6.077 6.241-1.637c1.706.945 3.668 1.487 5.759 1.487 6.627 0 12-5.373 12-12 0-6.627-5.373-12-12-12z" />
            </svg>
            <span className="text-sm">Share on WhatsApp</span>
          </button>
        </div>

        {/* Social Share Grid (5 major icons + native share) */}
        <div className="mt-5">
          <p className="text-[10px] uppercase font-bold tracking-[0.16em] text-muted-foreground text-center mb-3">
            Share on social platforms
          </p>

          <div className="grid grid-cols-5 gap-2.5">
            {/* 1. WhatsApp */}
            <button
              type="button"
              onClick={handleWhatsApp}
              className="flex flex-col items-center gap-1.5 group cursor-pointer"
            >
              <div className="w-12 h-12 rounded-2xl bg-[#25D366] text-white flex items-center justify-center shadow-md shadow-[#25D366]/20 group-hover:scale-105 active:scale-95 transition">
                <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                  <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.771-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.299.045-.677.063-1.092-.069-.252-.08-.575-.187-.988-.365-1.739-.751-2.874-2.502-2.961-2.617-.087-.116-.708-.94-.708-1.793s.448-1.273.607-1.446c.159-.173.346-.217.462-.217l.332.006c.106.005.249-.04.39.298.144.347.491 1.2.534 1.287.043.087.072.188.014.304-.058.116-.087.188-.173.289l-.26.304c-.087.086-.177.18-.076.354.101.174.449.741.964 1.201.662.591 1.221.774 1.394.86s.275.072.376-.043c.101-.116.433-.506.549-.68.116-.173.231-.145.39-.087s1.011.477 1.184.564.289.13.332.202c.045.072.045.419-.099.824zm-3.423-14.416c-6.627 0-12 5.373-12 12 0 2.155.57 4.178 1.564 5.923l-1.664 6.077 6.241-1.637c1.706.945 3.668 1.487 5.759 1.487 6.627 0 12-5.373 12-12 0-6.627-5.373-12-12-12z" />
                </svg>
              </div>
              <span className="text-[11px] font-medium text-muted-foreground group-hover:text-ink dark:group-hover:text-white transition">
                WhatsApp
              </span>
            </button>

            {/* 2. Instagram */}
            <button
              type="button"
              onClick={handleInstagram}
              className="flex flex-col items-center gap-1.5 group cursor-pointer"
            >
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#f09433] via-[#dc2743] to-[#bc1888] text-white flex items-center justify-center shadow-md shadow-[#dc2743]/20 group-hover:scale-105 active:scale-95 transition">
                <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                </svg>
              </div>
              <span className="text-[11px] font-medium text-muted-foreground group-hover:text-ink dark:group-hover:text-white transition">
                Instagram
              </span>
            </button>

            {/* 3. Snapchat */}
            <button
              type="button"
              onClick={handleSnapchat}
              className="flex flex-col items-center gap-1.5 group cursor-pointer"
            >
              <div className="w-12 h-12 rounded-2xl bg-[#FFFC00] text-black flex items-center justify-center shadow-md shadow-[#FFFC00]/20 group-hover:scale-105 active:scale-95 transition">
                {/* Snapchat Ghost SVG */}
                <svg className="w-6 h-6 fill-black stroke-black" viewBox="0 0 24 24">
                  <path d="M12.001 2c-3.874 0-6.42 2.859-6.42 6.45 0 .97.348 2.228.375 2.327.042.158-.094.228-.201.258-.519.143-1.492.483-1.892 1.341-.24.515-.121 1.092.355 1.717.38.498.981.821 1.637.887.112.011.164.088.139.183-.174.659-.516 1.716-1.503 2.19-.387.186-.67.433-.67.755 0 .546.772.84 1.558.948.749.103 1.52.062 2.253.308.385.129.742.41 1.05.807.575.742 1.494 1.629 3.318 1.629 1.825 0 2.744-.887 3.319-1.629.308-.397.665-.678 1.05-.807.733-.246 1.504-.205 2.253-.308.786-.108 1.558-.402 1.558-.948 0-.322-.283-.569-.67-.755-.987-.474-1.329-1.531-1.503-2.19-.025-.095.027-.172.139-.183.656-.066 1.257-.389 1.637-.887.476-.625.595-1.202.355-1.717-.4-.858-1.373-1.198-1.892-1.341-.107-.03-.243-.1-.201-.258.027-.099.375-1.357.375-2.327 0-3.591-2.546-6.45-6.42-6.45z" />
                </svg>
              </div>
              <span className="text-[11px] font-medium text-muted-foreground group-hover:text-ink dark:group-hover:text-white transition">
                Snapchat
              </span>
            </button>

            {/* 4. Facebook */}
            <button
              type="button"
              onClick={handleFacebook}
              className="flex flex-col items-center gap-1.5 group cursor-pointer"
            >
              <div className="w-12 h-12 rounded-2xl bg-[#1877F2] text-white flex items-center justify-center shadow-md shadow-[#1877F2]/20 group-hover:scale-105 active:scale-95 transition">
                <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                </svg>
              </div>
              <span className="text-[11px] font-medium text-muted-foreground group-hover:text-ink dark:group-hover:text-white transition">
                Facebook
              </span>
            </button>

            {/* 5. X (Twitter) */}
            <button
              type="button"
              onClick={handleTwitter}
              className="flex flex-col items-center gap-1.5 group cursor-pointer"
            >
              <div className="w-12 h-12 rounded-2xl bg-black text-white border border-white/10 flex items-center justify-center shadow-md shadow-black/20 group-hover:scale-105 active:scale-95 transition">
                <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </div>
              <span className="text-[11px] font-medium text-muted-foreground group-hover:text-ink dark:group-hover:text-white transition">
                X / Twitter
              </span>
            </button>
          </div>
        </div>

        {/* Copy Link Section */}
        <div className="mt-5">
          <p className="text-[10px] uppercase font-bold tracking-[0.16em] text-muted-foreground mb-2">
            Or copy your invite link
          </p>
          <div
            className={`flex items-center gap-2 p-1.5 rounded-2xl border transition ${
              isGenZ
                ? "bg-[#141828] border-[#222A40]"
                : "bg-paper border-border"
            }`}
          >
            <input
              type="text"
              readOnly
              value={shareUrl}
              className="flex-1 bg-transparent px-3 py-1.5 text-xs font-mono text-muted-foreground truncate outline-none select-all"
            />
            <button
              type="button"
              onClick={handleCopy}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition active:scale-95 cursor-pointer shrink-0 ${
                copied
                  ? "bg-green-600 text-white"
                  : isGenZ
                    ? "bg-[#5B68F6] hover:bg-[#4C58E0] text-white shadow-md shadow-[#5B68F6]/25"
                    : "bg-ink hover:bg-ink/90 text-background"
              }`}
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Link</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* System / More Share Options */}
        <div className="mt-4 pt-3 border-t border-white/10 dark:border-white/10 flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">More sharing options:</span>
          <button
            type="button"
            onClick={handleNativeShare}
            className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border transition active:scale-95 cursor-pointer ${
              isGenZ
                ? "bg-[#141828] border-[#222A40] text-[#8E9BB0] hover:text-white"
                : "bg-paper border-border text-ink hover:bg-paper/80"
            }`}
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>More Apps…</span>
          </button>
        </div>
      </div>
    </div>
  );
}
