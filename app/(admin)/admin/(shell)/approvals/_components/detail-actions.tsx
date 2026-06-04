"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  approveApplication,
  rejectApplication,
  requestInfo,
} from "@/app/actions/approvals";

type Mode = "reject" | "needs_info" | null;

const TEXTAREA =
  "w-full rounded-button border border-border bg-surface-card px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20";

export function DetailActions({
  applicationId,
  decided,
}: {
  applicationId: string;
  /** True once approved/rejected — actions are hidden. */
  decided: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>(null);
  const [text, setText] = useState("");

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        toast.error(result.error ?? "Something went wrong.");
        return;
      }
      toast.success(success);
      setMode(null);
      setText("");
      router.refresh();
    });
  }

  if (decided) {
    return (
      <p className="rounded-button bg-border-subtle px-3 py-2 text-center text-sm text-text-muted">
        This application has been decided. No further actions available.
      </p>
    );
  }

  if (mode) {
    const isReject = mode === "reject";
    return (
      <div className="space-y-3">
        <label className="block text-sm font-semibold text-text-primary">
          {isReject ? "Reason for rejection" : "What does the applicant need to supply?"}
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder={
            isReject
              ? "e.g. Insurance certificate has expired."
              : "e.g. Your trade insurance certificate is unreadable — please re-upload a clear copy."
          }
          className={TEXTAREA}
          autoFocus
        />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" disabled={pending} onClick={() => { setMode(null); setText(""); }}>
            Cancel
          </Button>
          <Button
            variant={isReject ? "destructive" : "primary"}
            disabled={pending || !text.trim()}
            onClick={() =>
              run(
                () =>
                  isReject
                    ? rejectApplication(applicationId, text)
                    : requestInfo(applicationId, text),
                isReject ? "Application rejected." : "Info request sent.",
              )
            }
          >
            {pending ? "Sending…" : isReject ? "Reject application" : "Send request"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="primary"
        disabled={pending}
        onClick={() => run(() => approveApplication(applicationId, false), "Mechanic approved & invited.")}
      >
        Approve
      </Button>
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() => run(() => approveApplication(applicationId, true), "Approved with 28-day grace.")}
      >
        Approve with 28-day grace
      </Button>
      <Button variant="ghost" disabled={pending} onClick={() => setMode("needs_info")}>
        Request more info
      </Button>
      <Button variant="destructive" disabled={pending} onClick={() => setMode("reject")}>
        Reject
      </Button>
    </div>
  );
}
