import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const MAX_SIZE = 8 * 1024 * 1024; // 8 MB
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;

type Props = {
  userId: string;
  currentPath: string | null;
};

export function GovIdUpload({ userId, currentPath }: Props) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "success">("idle");
  const [error, setError] = useState<string | null>(null);
  const [uploadedName, setUploadedName] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);

    if (!ALLOWED.includes(file.type as (typeof ALLOWED)[number])) {
      setError("Only JPG, PNG, WebP, or PDF files are allowed.");
      return;
    }
    if (file.size > MAX_SIZE) {
      setError("File is too large. Max 8 MB.");
      return;
    }
    if (file.size === 0) {
      setError("File appears to be empty.");
      return;
    }

    setStatus("uploading");

    const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
    const path = `${userId}/${Date.now()}-id.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("gov-ids")
      .upload(path, file, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      setError(uploadError.message);
      setStatus("idle");
      return;
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        gov_id_path: path,
        gov_id_submitted_at: new Date().toISOString(),
      })
      .eq("id", userId);

    if (profileError) {
      setError(profileError.message);
      setStatus("idle");
      return;
    }

    setUploadedName(file.name);
    setStatus("success");
    queryClient.invalidateQueries({ queryKey: ["profile", "me"] });
  }

  const hasExisting = Boolean(currentPath);

  return (
    <article className="rounded-3xl bg-paper border border-border p-6">
      <p className="text-[10px] uppercase tracking-[0.22em] text-brand-orange font-semibold">
        Government ID
      </p>
      <h2 className="display text-2xl text-ink mt-1">
        Verify your <em className="text-primary not-italic">identity</em>
      </h2>
      <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
        Upload a clear photo of your Aadhaar, passport, or driving licence.
        Stored privately — only you and our verification team can access it.
      </p>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />

      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={status === "uploading"}
          className="rounded-2xl bg-ink text-background font-semibold px-5 py-3 text-sm disabled:opacity-60"
        >
          {status === "uploading"
            ? "Uploading…"
            : hasExisting || status === "success"
              ? "Replace file"
              : "Choose file"}
        </button>
        <span className="text-xs text-muted-foreground">
          JPG · PNG · WebP · PDF · max 8 MB
        </span>
      </div>

      {status === "success" && (
        <p className="mt-4 text-sm text-primary">
          Uploaded {uploadedName ? `"${uploadedName}"` : "file"} — pending review.
        </p>
      )}
      {status !== "success" && hasExisting && (
        <p className="mt-4 text-sm text-muted-foreground">
          A file is on record — pending review.
        </p>
      )}
      {error && (
        <p className="mt-4 text-sm text-destructive bg-destructive/10 rounded-xl px-3 py-2">
          {error}
        </p>
      )}
    </article>
  );
}