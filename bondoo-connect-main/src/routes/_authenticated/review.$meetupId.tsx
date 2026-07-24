import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { haveIReviewed, submitReview } from "@/lib/reviews.functions";
import { getMeetup } from "@/lib/meetups.functions";

export const Route = createFileRoute("/_authenticated/review/$meetupId")({
  head: () => ({
    meta: [
      { title: "Rate this meetup · Bondoo" },
      { name: "description", content: "Share how your Bondoo meetup went." },
    ],
  }),
  component: ReviewPage,
});

function ReviewPage() {
  const { meetupId } = useParams({ from: "/_authenticated/review/$meetupId" });
  const navigate = useNavigate();
  const fetchMeetup = useServerFn(getMeetup);
  const checkReviewed = useServerFn(haveIReviewed);
  const send = useServerFn(submitReview);

  const [rating, setRating] = useState<number>(0);
  const [comment, setComment] = useState("");
  const [hover, setHover] = useState<number>(0);

  const { data: meetup } = useQuery({
    queryKey: ["meetup", meetupId],
    queryFn: () => fetchMeetup({ data: { meetupId } }),
  });

  const { data: reviewed } = useQuery({
    queryKey: ["review", "mine", meetupId],
    queryFn: () => checkReviewed({ data: { meetupId } }),
  });

  const mut = useMutation({
    mutationFn: () =>
      send({ data: { meetupId, rating, comment: comment.trim() || null } }),
    onSuccess: () => {
      navigate({ to: "/dashboard", replace: true });
    },
  });

  if (reviewed?.reviewed) {
    return (
      <main className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
        <p className="display text-3xl text-ink">Already rated ✓</p>
        <p className="mt-2 text-sm text-muted-foreground text-center">
          Thanks for sharing your feedback.
        </p>
        <button
          onClick={() => navigate({ to: "/dashboard" })}
          className="mt-6 rounded-2xl bg-ink text-background font-semibold px-6 py-3"
        >
          Back home
        </button>
      </main>
    );
  }

  const other =
    meetup?.me === meetup?.meetup.proposer_id ? meetup?.recipient : meetup?.proposer;

  return (
    <main className="min-h-screen bg-background pb-16">
      <header className="max-w-md mx-auto px-6 pt-8">
        <button
          onClick={() => navigate({ to: "/meetup/$meetupId", params: { meetupId } })}
          className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold hover:text-ink"
        >
          ← Meetup
        </button>
        <p className="mt-4 text-[11px] uppercase tracking-[0.2em] text-brand-orange font-semibold">
          How did it go?
        </p>
        <h1 className="display text-4xl text-ink mt-2 leading-tight">
          Rate <em className="text-primary not-italic">{other?.display_name || "your meet"}</em>
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your rating shapes Bondoo's Trust Score. Kind, honest, one-time.
        </p>
      </header>

      <section className="max-w-md mx-auto px-6 pt-8">
        <div className="rounded-3xl border border-border bg-paper p-6">
          <div className="flex justify-center gap-2">
            {[1, 2, 3, 4, 5].map((n) => {
              const on = (hover || rating) >= n;
              return (
                <button
                  key={n}
                  onMouseEnter={() => setHover(n)}
                  onMouseLeave={() => setHover(0)}
                  onClick={() => setRating(n)}
                  aria-label={`${n} star${n > 1 ? "s" : ""}`}
                  className={`text-4xl transition ${on ? "scale-110" : "opacity-40"}`}
                >
                  {on ? "★" : "☆"}
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-center text-xs text-muted-foreground uppercase tracking-[0.2em]">
            {rating === 0
              ? "Tap to rate"
              : rating <= 2
                ? "It didn't feel great"
                : rating === 3
                  ? "It was okay"
                  : rating === 4
                    ? "It was good"
                    : "It was wonderful"}
          </p>

          <label className="block mt-6">
            <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-semibold">
              Anything to add? <span className="normal-case tracking-normal text-muted-foreground/70">(optional)</span>
            </span>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
              maxLength={500}
              placeholder="What made it a nice meetup?"
              className="mt-2 w-full rounded-2xl bg-background border border-border px-4 py-3 text-sm text-ink outline-none focus:border-primary resize-none"
            />
          </label>
        </div>

        {mut.isError && (
          <p className="mt-3 text-xs text-destructive">
            {(mut.error as Error).message}
          </p>
        )}

        <button
          onClick={() => rating > 0 && mut.mutate()}
          disabled={rating === 0 || mut.isPending}
          className="mt-6 w-full rounded-2xl bg-ink text-background font-semibold py-4 disabled:opacity-40"
        >
          {mut.isPending ? "Sending…" : "Submit rating"}
        </button>

        <p className="mt-4 text-center text-[11px] text-muted-foreground">
          Ratings are private to the person you meet.
        </p>
      </section>
    </main>
  );
}