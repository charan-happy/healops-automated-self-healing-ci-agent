"use client";

import { useState } from "react";
import { ThumbsUp, ThumbsDown, Send, Loader2 } from "lucide-react";
import { trackEvent, POSTHOG_EVENTS } from "@/app/_libs/utils/analytics";

interface Props {
  jobId: string;
  failureId: string;
}

type Rating = "helpful" | "not_helpful" | null;

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";

export function FixFeedbackWidget({ jobId, failureId }: Props) {
  const [rating, setRating] = useState<Rating>(null);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!rating) return;
    setSubmitting(true);

    trackEvent(POSTHOG_EVENTS.FIX_FEEDBACK_SUBMITTED, {
      jobId,
      failureId,
      rating,
      hasComment: comment.length > 0,
    });

    try {
      await fetch(`${BACKEND_URL}/v1/healops/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, failureId, rating, comment }),
      });
    } catch {
      // Fire-and-forget — feedback should not block the user
    }

    setSubmitted(true);
    setSubmitting(false);
  };

  if (submitted) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
        <ThumbsUp className="size-4 text-emerald-400" />
        <p className="text-sm text-emerald-400">Thanks for your feedback!</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4 space-y-3">
      <p className="text-sm font-semibold">Was this fix helpful?</p>

      <div className="flex items-center gap-2">
        <button
          onClick={() => setRating("helpful")}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-all ${
            rating === "helpful"
              ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
              : "border-white/10 text-muted-foreground hover:border-white/20"
          }`}
        >
          <ThumbsUp className="size-3.5" />
          Helpful
        </button>
        <button
          onClick={() => setRating("not_helpful")}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-all ${
            rating === "not_helpful"
              ? "border-red-500/50 bg-red-500/10 text-red-400"
              : "border-white/10 text-muted-foreground hover:border-white/20"
          }`}
        >
          <ThumbsDown className="size-3.5" />
          Not helpful
        </button>
      </div>

      {rating && (
        <div className="space-y-2">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={
              rating === "helpful"
                ? "What worked well? (optional)"
                : "What went wrong? This helps us improve."
            }
            rows={2}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-brand-cyan/50 resize-none"
          />
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex items-center gap-1.5 rounded-lg bg-brand-cyan px-3 py-1.5 text-sm font-semibold text-black transition-all hover:bg-brand-cyan/90 disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Send className="size-3.5" />
            )}
            Submit Feedback
          </button>
        </div>
      )}
    </div>
  );
}
