import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { setMyAvatarPath } from "@/lib/profile.functions";

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED = ["image/jpeg", "image/png", "image/webp"] as const;

type Props = {
  userId: string;
  currentUrl: string | null;
  displayName?: string | null;
};

export function AvatarUpload({ userId, currentUrl, displayName }: Props) {
  const qc = useQueryClient();
  const savePath = useServerFn(setMyAvatarPath);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const initials =
    (displayName || "?")
      .split(" ")
      .map((s) => s[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?";

  async function handleFile(file: File) {
    setError(null);
    if (!ALLOWED.includes(file.type as (typeof ALLOWED)[number])) {
      setError("Only JPG, PNG, or WebP images are allowed.");
      return;
    }
    if (file.size > MAX_SIZE) {
      setError("Image is too large. Max 5 MB.");
      return;
    }
    if (file.size === 0) {
      setError("File appears to be empty.");
      return;
    }

    setBusy(true);
    const ext =
      file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `${userId}/${Date.now()}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from("avatars")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (upErr) {
      setError(upErr.message);
      setBusy(false);
      return;
    }

    try {
      const { url } = await savePath({ data: { path } });
      if (url) setPreviewUrl(url);
      qc.invalidateQueries({ queryKey: ["profile", "me"] });
      qc.invalidateQueries({ queryKey: ["user-profile", userId] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save photo");
    } finally {
      setBusy(false);
    }
  }

  const shownUrl = previewUrl ?? currentUrl;

  return (
    <div className="flex items-center gap-4">
      <div className="h-20 w-20 rounded-full bg-secondary overflow-hidden flex items-center justify-center font-semibold text-ink border border-border">
        {shownUrl ? (
          <img
            src={shownUrl}
            alt="Your profile photo"
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-lg">{initials}</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-[0.22em] text-brand-orange font-semibold">
          Profile photo
        </p>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          JPG, PNG, or WebP · max 5 MB. Visible to people you match with.
        </p>
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="text-sm font-semibold text-primary disabled:opacity-50"
          >
            {busy ? "Uploading…" : shownUrl ? "Change photo" : "Upload photo"}
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}