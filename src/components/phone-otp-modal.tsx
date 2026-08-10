import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { markVerificationStep } from "@/lib/verification.functions";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function PhoneOtpModal({ open, onClose }: Props) {
  const queryClient = useQueryClient();
  const markStep = useServerFn(markVerificationStep);

  const [step, setStep] = useState<"number" | "otp" | "success">("number");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendTimer, setResendTimer] = useState(30);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (step === "otp" && resendTimer > 0) {
      interval = setInterval(() => {
        setResendTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [step, resendTimer]);

  useEffect(() => {
    if (!open) {
      setStep("number");
      setPhoneNumber("");
      setOtp(["", "", "", "", "", ""]);
      setError(null);
      setSending(false);
      setVerifying(false);
    }
  }, [open]);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanNum = phoneNumber.replace(/\D/g, "");
    if (cleanNum.length < 10) {
      setError("Please enter a valid 10-digit mobile number.");
      return;
    }

    setSending(true);
    // Simulate SMS OTP dispatch
    await new Promise((res) => setTimeout(res, 800));
    setSending(false);
    setStep("otp");
    setResendTimer(30);
  };

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);

    // Auto-focus next input box
    if (value && index < 5) {
      const nextInput = document.getElementById(`otp-input-${index + 1}`);
      nextInput?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      const prevInput = document.getElementById(`otp-input-${index - 1}`);
      prevInput?.focus();
    }
  };

  const verifyMutation = useMutation({
    mutationFn: async () => {
      const fullOtp = otp.join("");
      if (fullOtp.length < 6) {
        throw new Error("Please enter all 6 digits of the OTP.");
      }
      setVerifying(true);
      // Simulate OTP verification delay
      await new Promise((res) => setTimeout(res, 1000));
      return markStep({ data: { step: "phone" } });
    },
    onSuccess: () => {
      setVerifying(false);
      setStep("success");
      queryClient.invalidateQueries({ queryKey: ["profile", "me"] });
      setTimeout(() => {
        onClose();
      }, 1200);
    },
    onError: (err) => {
      setVerifying(false);
      setError(err instanceof Error ? err.message : "Invalid OTP. Please try again.");
    },
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-paper border border-border rounded-3xl p-6 shadow-2xl flex flex-col items-center">
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-muted-foreground hover:text-ink text-xl font-bold p-1 rounded-full"
          aria-label="Close modal"
        >
          ✕
        </button>

        <p className="text-[10px] uppercase tracking-[0.22em] text-brand-orange font-semibold text-center">
          Mobile Verification
        </p>

        {step === "number" && (
          <div className="w-full mt-2 space-y-4">
            <h2 className="display text-2xl text-ink text-center">
              Enter your <em className="text-primary not-italic">Mobile Number</em>
            </h2>
            <p className="text-xs text-muted-foreground text-center leading-relaxed">
              We'll send a 6-digit verification code (OTP) to verify your number and unlock +20 Trust Score.
            </p>

            <form onSubmit={handleSendOtp} className="mt-4 space-y-4">
              <div className="bg-background rounded-2xl p-3 border border-border focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10 transition">
                <label className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-semibold">
                  Phone Number
                </label>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-sm font-semibold text-ink bg-surface px-2.5 py-1 rounded-lg border border-border/60 shrink-0">
                    🇮🇳 +91
                  </span>
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="98765 43210"
                    maxLength={14}
                    required
                    autoFocus
                    className="w-full bg-transparent outline-none text-ink font-mono text-base placeholder:text-muted-foreground/60"
                  />
                </div>
              </div>

              {error && (
                <p className="text-xs text-destructive bg-destructive/10 rounded-xl px-3 py-2 text-center">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={sending || !phoneNumber.trim()}
                className="w-full rounded-2xl bg-ink text-background font-semibold py-3.5 text-sm hover:bg-ink/90 active:scale-[0.99] transition disabled:opacity-50"
              >
                {sending ? "Sending OTP…" : "Send 6-Digit OTP →"}
              </button>
            </form>
          </div>
        )}

        {step === "otp" && (
          <div className="w-full mt-2 space-y-4">
            <h2 className="display text-2xl text-ink text-center">
              Verify <em className="text-primary not-italic">OTP Code</em>
            </h2>
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <span>Code sent to <strong className="text-ink font-mono">+91 {phoneNumber}</strong></span>
              <button
                type="button"
                onClick={() => setStep("number")}
                className="text-primary underline text-[11px] font-medium"
              >
                Edit
              </button>
            </div>

            <div className="my-4 flex justify-between gap-2 max-w-[280px] mx-auto">
              {otp.map((digit, idx) => (
                <input
                  key={idx}
                  id={`otp-input-${idx}`}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleOtpChange(idx, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(idx, e)}
                  autoFocus={idx === 0}
                  className="w-10 h-12 text-center font-mono text-lg font-bold bg-background border border-border rounded-xl outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition"
                />
              ))}
            </div>

            {error && (
              <p className="text-xs text-destructive bg-destructive/10 rounded-xl px-3 py-2 text-center">
                {error}
              </p>
            )}

            <button
              type="button"
              disabled={verifying || otp.join("").length < 6}
              onClick={() => verifyMutation.mutate()}
              className="w-full rounded-2xl bg-primary text-primary-foreground font-semibold py-3.5 text-sm disabled:opacity-50 transition"
            >
              {verifying ? "Verifying OTP…" : "Verify & Complete (+20 Trust)"}
            </button>

            <div className="text-center">
              {resendTimer > 0 ? (
                <p className="text-xs text-muted-foreground">
                  Resend code in <span className="font-mono font-semibold text-ink">{resendTimer}s</span>
                </p>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setResendTimer(30);
                    setError(null);
                  }}
                  className="text-xs text-primary font-medium underline"
                >
                  Resend OTP Code
                </button>
              )}
            </div>
          </div>
        )}

        {step === "success" && (
          <div className="w-full mt-4 py-6 text-center space-y-3">
            <div className="h-16 w-16 bg-primary/15 text-primary rounded-full flex items-center justify-center text-3xl mx-auto border border-primary/30 animate-bounce">
              ✓
            </div>
            <h3 className="display text-2xl text-ink">Mobile Verified!</h3>
            <p className="text-xs text-muted-foreground">
              Your mobile number has been verified. +20 added to your Trust Score.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
