import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  REPORT_REASONS,
  blockUser,
  isBlocked,
  reportUser,
  unblockUser,
} from "@/lib/safety.functions";

type Props = {
  userId: string;
  displayName?: string;
  context: "profile" | "chat";
  conversationId?: string;
  variant?: "button" | "link";
  onBlocked?: () => void;
};

export function SafetyMenu({
  userId,
  displayName,
  context,
  conversationId,
  variant = "link",
  onBlocked,
}: Props) {
  const qc = useQueryClient();
  const checkBlocked = useServerFn(isBlocked);
  const block = useServerFn(blockUser);
  const unblock = useServerFn(unblockUser);
  const report = useServerFn(reportUser);

  const { data: blockedState } = useQuery({
    queryKey: ["blocked", userId],
    queryFn: () => checkBlocked({ data: { userId } }),
  });
  const blocked = !!blockedState?.blocked;

  const [open, setOpen] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showBlock, setShowBlock] = useState(false);
  const [reason, setReason] = useState<string>(REPORT_REASONS[0]);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const submitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await report({
        data: { userId, reason, details, context, conversationId },
      });
      setShowReport(false);
      setDetails("");
      setMsg("Report submitted. Thank you.");
      setTimeout(() => setMsg(null), 3500);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Could not submit");
    } finally {
      setBusy(false);
    }
  };

  const toggleBlock = async () => {
    setBusy(true);
    try {
      if (blocked) {
        await unblock({ data: { userId } });
      } else {
        await block({ data: { userId } });
      }
      qc.invalidateQueries({ queryKey: ["blocked", userId] });
      setShowBlock(false);
      setOpen(false);
      if (!blocked) onBlocked?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          variant === "button"
            ? "rounded-2xl border border-border bg-background text-ink font-semibold py-2.5 px-4 text-sm"
            : "text-xs display italic text-brand-orange"
        }
        aria-label="Safety options"
      >
        {variant === "button" ? "Safety" : "⋯"}
      </button>

      {msg && (
        <div className="fixed top-4 inset-x-0 z-40 flex justify-center px-4 pointer-events-none">
          <div className="rounded-2xl bg-ink text-background text-sm px-4 py-2 shadow-lg">
            {msg}
          </div>
        </div>
      )}

      {open && (
        <div
          className="fixed inset-0 z-30 bg-ink/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-background rounded-3xl p-6 shadow-2xl border border-border"
          >
            <p className="text-center text-[11px] uppercase tracking-[0.22em] text-brand-orange font-semibold">
              Safety
            </p>
            <h3 className="display text-2xl text-ink text-center mt-1 leading-tight">
              {displayName || "This user"}
            </h3>
            <div className="mt-5 space-y-2">
              <button
                onClick={() => {
                  setOpen(false);
                  setShowReport(true);
                }}
                className="w-full rounded-2xl border border-border bg-paper text-ink font-semibold py-3 text-sm text-left px-4"
              >
                🚩 Report user
              </button>
              <button
                onClick={() => {
                  setOpen(false);
                  setShowBlock(true);
                }}
                className="w-full rounded-2xl border border-border bg-paper text-ink font-semibold py-3 text-sm text-left px-4"
              >
                {blocked ? "🔓 Unblock user" : "🚫 Block user"}
              </button>
              <button
                onClick={() => setOpen(false)}
                className="w-full rounded-2xl bg-ink text-background font-semibold py-3 text-sm mt-2"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showReport && (
        <div
          className="fixed inset-0 z-30 bg-ink/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={() => setShowReport(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={submitReport}
            className="w-full max-w-md bg-background rounded-3xl p-7 shadow-2xl border border-border"
          >
            <p className="text-center text-[11px] uppercase tracking-[0.22em] text-brand-orange font-semibold">
              Report
            </p>
            <h2 className="display text-2xl text-ink text-center mt-1 leading-tight">
              What's <em className="text-primary not-italic">wrong</em>?
            </h2>
            <div className="mt-5 space-y-2">
              {REPORT_REASONS.map((r) => (
                <label
                  key={r}
                  className={`flex items-center gap-3 rounded-2xl border px-4 py-3 cursor-pointer text-sm ${
                    reason === r
                      ? "border-primary bg-primary/5"
                      : "border-border bg-paper"
                  }`}
                >
                  <input
                    type="radio"
                    name="reason"
                    value={r}
                    checked={reason === r}
                    onChange={() => setReason(r)}
                    className="accent-primary"
                  />
                  <span className="text-ink">{r}</span>
                </label>
              ))}
            </div>
            <div className="mt-4">
              <label className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
                Details (optional)
              </label>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                rows={3}
                placeholder="What happened?"
                className="mt-1 w-full resize-none rounded-2xl border border-border bg-paper px-4 py-2.5 text-ink outline-none focus:border-primary"
              />
            </div>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setShowReport(false)}
                className="flex-1 rounded-2xl border border-border bg-background text-ink font-semibold py-3"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="flex-1 rounded-2xl bg-ink text-background font-semibold py-3 disabled:opacity-40"
              >
                {busy ? "Sending…" : "Submit report"}
              </button>
            </div>
          </form>
        </div>
      )}

      {showBlock && (
        <div
          className="fixed inset-0 z-30 bg-ink/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={() => setShowBlock(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-background rounded-3xl p-7 shadow-2xl border border-border"
          >
            <p className="text-center text-[11px] uppercase tracking-[0.22em] text-brand-orange font-semibold">
              {blocked ? "Unblock" : "Block"}
            </p>
            <h2 className="display text-2xl text-ink text-center mt-1 leading-tight">
              {blocked ? (
                <>Allow <em className="text-primary not-italic">contact</em>?</>
              ) : (
                <>Stop <em className="text-brand-orange not-italic">contact</em>?</>
              )}
            </h2>
            <p className="text-sm text-muted-foreground text-center mt-3">
              {blocked
                ? `${displayName || "This user"} will be able to see your profile and message you again.`
                : `${displayName || "This user"} won't be able to message you or send connection requests. You can undo this anytime.`}
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setShowBlock(false)}
                className="flex-1 rounded-2xl border border-border bg-background text-ink font-semibold py-3"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={toggleBlock}
                disabled={busy}
                className="flex-1 rounded-2xl bg-ink text-background font-semibold py-3 disabled:opacity-40"
              >
                {busy ? "…" : blocked ? "Unblock" : "Block"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}