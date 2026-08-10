import { useState, useRef, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { markVerificationStep } from "@/lib/verification.functions";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function SelfieCameraModal({ open, onClose }: Props) {
  const queryClient = useQueryClient();
  const markStep = useServerFn(markVerificationStep);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  const verifyMutation = useMutation({
    mutationFn: async () => {
      setVerifying(true);
      // Simulate face liveness detection delay
      await new Promise((res) => setTimeout(res, 1200));
      return markStep({ data: { step: "selfie" } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile", "me"] });
      stopCamera();
      setCapturedImage(null);
      setVerifying(false);
      onClose();
    },
    onError: (err) => {
      setVerifying(false);
      setCameraError(err instanceof Error ? err.message : "Verification failed");
    },
  });

  const startCamera = async () => {
    setCameraError(null);
    setCapturedImage(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Direct camera stream not supported on this browser.");
      }
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 720 } },
        audio: false,
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.warn("Camera stream error:", err);
      setCameraError("Camera permission blocked or unavailable. You can upload a selfie below.");
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  };

  useEffect(() => {
    if (open) {
      startCamera();
    } else {
      stopCamera();
      setCapturedImage(null);
      setCameraError(null);
    }
    return () => {
      stopCamera();
    };
  }, [open]);

  const captureSnapshot = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    // Flip horizontally for selfie mirror effect
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    setCapturedImage(dataUrl);
    stopCamera();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      if (evt.target?.result) {
        setCapturedImage(evt.target.result as string);
        stopCamera();
      }
    };
    reader.readAsDataURL(file);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-paper border border-border rounded-3xl p-6 shadow-2xl flex flex-col items-center">
        {/* Close button */}
        <button
          type="button"
          onClick={() => {
            stopCamera();
            onClose();
          }}
          className="absolute top-4 right-4 text-muted-foreground hover:text-ink text-xl font-bold p-1 rounded-full"
          aria-label="Close modal"
        >
          ✕
        </button>

        <p className="text-[10px] uppercase tracking-[0.22em] text-brand-orange font-semibold text-center">
          Selfie Match
        </p>
        <h2 className="display text-2xl text-ink text-center mt-1">
          Liveness & Face <em className="text-primary not-italic">Verification</em>
        </h2>

        {/* Camera stream or Captured Preview */}
        <div className="mt-5 relative w-full aspect-square max-w-[280px] bg-black rounded-3xl overflow-hidden border border-border shadow-inner flex items-center justify-center">
          {capturedImage ? (
            <img
              src={capturedImage}
              alt="Selfie preview"
              className="w-full h-full object-cover"
            />
          ) : stream ? (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover -scale-x-100"
              />
              {/* Face Guide Oval */}
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center p-4">
                <div className="w-44 h-56 rounded-full border-2 border-dashed border-primary/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)] flex items-center justify-center">
                  <span className="text-[10px] uppercase tracking-wider text-white/90 bg-black/60 px-2 py-1 rounded-full font-semibold">
                    Position Face Here
                  </span>
                </div>
              </div>
            </>
          ) : (
            <div className="p-4 text-center text-xs text-muted-foreground space-y-2">
              <p>Camera inactive</p>
              {cameraError && <p className="text-destructive text-[11px]">{cameraError}</p>}
            </div>
          )}
        </div>

        <canvas ref={canvasRef} className="hidden" />

        {/* Action Controls */}
        <div className="mt-6 w-full space-y-3">
          {capturedImage ? (
            <div className="flex gap-3">
              <button
                type="button"
                disabled={verifying}
                onClick={startCamera}
                className="flex-1 rounded-2xl border border-border text-ink font-semibold py-3 text-sm disabled:opacity-50"
              >
                Retake Photo
              </button>
              <button
                type="button"
                disabled={verifying}
                onClick={() => verifyMutation.mutate()}
                className="flex-1 rounded-2xl bg-primary text-primary-foreground font-semibold py-3 text-sm disabled:opacity-50"
              >
                {verifying ? "Verifying…" : "Submit & Verify"}
              </button>
            </div>
          ) : stream ? (
            <button
              type="button"
              onClick={captureSnapshot}
              className="w-full rounded-2xl bg-ink text-background font-semibold py-3.5 text-sm hover:bg-ink/90 active:scale-[0.99] transition"
            >
              📸 Take Snapshot
            </button>
          ) : (
            <div className="space-y-2">
              <button
                type="button"
                onClick={startCamera}
                className="w-full rounded-2xl bg-primary text-primary-foreground font-semibold py-3.5 text-sm"
              >
                🎥 Open Camera
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full rounded-2xl border border-border text-ink font-semibold py-3 text-sm"
              >
                📁 Upload Photo from Device
              </button>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="user"
            className="hidden"
            onChange={handleFileUpload}
          />
        </div>

        <p className="mt-4 text-[11px] text-muted-foreground text-center leading-tight">
          Your selfie is used solely for 1-to-1 liveness matching against your profile picture and is stored securely.
        </p>
      </div>
    </div>
  );
}
