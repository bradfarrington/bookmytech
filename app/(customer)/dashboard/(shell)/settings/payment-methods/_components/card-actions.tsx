"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { makeCardDefault, removeCard } from "@/app/actions/customer-cards";
import { Button, Panel } from "@/components/dashboard/ui";

// Make default and Remove (with a check first) under a saved card.

export function CardActions({ id, name, isDefault }: { id: string; name: string; isDefault: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setConfirming(false);
      router.refresh();
    });
  }

  if (confirming) {
    return (
      <Panel tone="danger">
        <div className="text-sm font-bold leading-5 text-text-primary">Remove your {name}?</div>
        <p className="mt-1 text-[13px] leading-[19px] text-text-secondary">You can add it again at any time.</p>
        {error && (
          <p role="alert" className="mt-2 text-[13px] leading-[19px] text-red-700">
            {error}
          </p>
        )}
        <div className="mt-3 flex gap-2">
          <Button variant="destructive" size="sm" disabled={pending} onClick={() => run(() => removeCard(id))}>
            {pending ? "Removing…" : "Remove card"}
          </Button>
          <Button variant="ghost" size="sm" disabled={pending} onClick={() => setConfirming(false)}>
            Keep it
          </Button>
        </div>
      </Panel>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex gap-2">
        {!isDefault && (
          <Button variant="secondary" size="sm" disabled={pending} onClick={() => run(() => makeCardDefault(id))}>
            {pending ? "Saving…" : "Make default"}
          </Button>
        )}
        <Button
          variant="outline-danger"
          size="sm"
          disabled={pending}
          onClick={() => {
            setError(null);
            setConfirming(true);
          }}
        >
          Remove
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-right text-xs leading-4 text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
