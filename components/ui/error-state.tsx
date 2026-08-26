"use client";

import Link from "next/link";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

// The shared body of every error.tsx boundary in the app.
//
// Error boundaries have to be Client Components, so this is one too, and each
// route segment's error.tsx is a thin wrapper that supplies the copy for its
// audience — a customer mid-booking needs different reassurance from a mechanic
// on a job, who needs different reassurance from an admin.
//
// `digest` is the only handle we have on what actually happened: in production
// React deliberately strips the real message before it reaches the browser, so
// the server log is the source of truth and this hash is how you find the entry.
// Showing it is the difference between "it broke" and a support conversation
// that can be resolved.

export interface ErrorStateProps {
  /** Headline. Written for the audience of this route segment. */
  title: string;
  /** One or two sentences: what happened, and what it means for them. */
  description: string;
  error: Error & { digest?: string };
  /**
   * Next 16 renamed this from `reset`. Re-runs the failed render; if the cause
   * was transient the boundary is replaced by the real content.
   */
  retry: () => void;
  /** Where "go back" should lead — the area's home, not necessarily "/". */
  homeHref?: string;
  homeLabel?: string;
}

export function ErrorState({
  title,
  description,
  error,
  retry,
  homeHref = "/",
  homeLabel = "Back to home",
}: ErrorStateProps) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-16">
      <div className="w-full max-w-md text-center">
        <span className="mx-auto mb-5 flex size-14 items-center justify-center rounded-full bg-red-50 text-danger">
          <AlertTriangle size={26} />
        </span>

        <h1 className="text-2xl font-extrabold tracking-[-0.02em] text-text-primary">
          {title}
        </h1>
        <p className="mx-auto mt-2.5 max-w-sm text-[15px] leading-[1.6] text-text-secondary">
          {description}
        </p>

        <div className="mt-7 flex flex-col items-center justify-center gap-2.5 sm:flex-row">
          <Button onClick={retry} iconLeft={RotateCw} size="md">
            Try again
          </Button>
          <Link href={homeHref}>
            <Button variant="ghost" size="md">
              {homeLabel}
            </Button>
          </Link>
        </div>

        <p className="mt-7 text-sm text-text-muted">
          Still stuck?{" "}
          <a
            href="mailto:support@bookmytech.co.uk"
            className="font-semibold text-brand-blue hover:underline"
          >
            support@bookmytech.co.uk
          </a>
        </p>

        {error.digest && (
          <p className="mt-3 text-xs text-text-muted">
            Reference{" "}
            <code className="rounded bg-border-subtle px-1.5 py-0.5 font-mono text-[11px] text-text-secondary">
              {error.digest}
            </code>{" "}
            — quote this and we can find exactly what went wrong.
          </p>
        )}
      </div>
    </div>
  );
}
