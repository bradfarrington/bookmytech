"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { suspendMechanic, liftSuspension } from "@/app/actions/mechanic-admin";

// Suspend / un-suspend control on the admin mechanic detail page (and reachable
// from dispute arbitration via the mechanic link). Suspended mechanics are
// immediately removed from dispatch.
export function SuspensionControls({
  mechanicId,
  isSuspended,
  suspendedUntil,
}: {
  mechanicId: string;
  isSuspended: boolean;
  suspendedUntil: string | null;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [until, setUntil] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong.");
      else router.refresh();
    });
  }

  if (isSuspended) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          This account is suspended
          {suspendedUntil
            ? ` until ${new Date(suspendedUntil).toLocaleDateString("en-GB", { dateStyle: "long" })}.`
            : " indefinitely, pending review."}
        </div>
        {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-danger">{error}</p>}
        <Button
          variant="secondary"
          iconLeft={pending ? Loader2 : ShieldCheck}
          disabled={pending}
          onClick={() => run(() => liftSuspension(mechanicId))}
        >
          {pending ? "Lifting…" : "Lift suspension"}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        placeholder="Reason for suspension (sent to the mechanic)…"
        className="w-full rounded-lg border border-border bg-surface-card px-3 py-2.5 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/25 resize-none"
      />
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
          End date (optional)
          <input
            type="date"
            value={until}
            onChange={(e) => setUntil(e.target.value)}
            className="h-10 rounded-lg border border-border bg-surface-card px-3 text-sm font-normal text-text-primary outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/25"
          />
        </label>
        <Button
          variant="primary"
          iconLeft={pending ? Loader2 : Ban}
          disabled={pending}
          onClick={() => run(() => suspendMechanic(mechanicId, reason, until || null))}
        >
          {pending ? "Suspending…" : "Suspend mechanic"}
        </Button>
      </div>
      <p className="text-xs text-text-muted">
        Leave the end date blank for an indefinite suspension (lift it manually). Suspended
        mechanics stop receiving job offers immediately.
      </p>
      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-danger">{error}</p>}
    </div>
  );
}
