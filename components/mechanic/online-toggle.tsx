"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { setOwnAvailability } from "@/app/actions/mechanic-status";

export interface OnlineToggleProps {
  /** The mechanic's current status from the server. 'on_job' renders as online
   *  but locked — they can't go offline mid-job from here. */
  initialStatus: "online" | "offline" | "on_job";
}

export function OnlineToggle({ initialStatus }: OnlineToggleProps) {
  const [status, setStatus] = useState(initialStatus);
  const [pending, startTransition] = useTransition();

  const isOnline = status === "online" || status === "on_job";
  const locked = status === "on_job";

  function toggle() {
    if (locked || pending) return;
    const next = isOnline ? "offline" : "online";
    const previous = status;
    // Optimistic flip — revert on failure.
    setStatus(next);
    startTransition(async () => {
      const result = await setOwnAvailability(next);
      if (!result.ok) {
        setStatus(previous);
        toast.error(result.error);
        return;
      }
      toast.success(
        next === "online" ? "You're online for jobs." : "You're offline.",
      );
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending || locked}
      aria-pressed={isOnline}
      title={
        locked
          ? "You're on a job — finish it to change availability"
          : isOnline
            ? "Tap to go offline"
            : "Tap to go online for jobs"
      }
      className={cn(
        "flex items-center gap-2.5 rounded-full py-2 pl-3 pr-3.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2",
        isOnline
          ? "bg-green-100 text-green-700"
          : "bg-border-subtle text-text-secondary hover:bg-border",
        (pending || locked) && "cursor-not-allowed opacity-70",
      )}
    >
      <span
        className={cn(
          "size-2 rounded-full",
          isOnline ? "bg-success" : "bg-text-disabled",
        )}
        style={
          isOnline
            ? { boxShadow: "0 0 0 4px rgba(34,197,94,0.25)" }
            : undefined
        }
      />
      {locked
        ? "On a job"
        : isOnline
          ? "Available for jobs"
          : "Offline"}
    </button>
  );
}
