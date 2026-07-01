"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { updateResolutionStatus } from "@/app/actions/resolutions";

// Lets the mechanic who raised a case close it once it's sorted.
export function CloseCaseButton({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function close() {
    start(async () => {
      const res = await updateResolutionStatus(caseId, "closed");
      if (res.ok) {
        toast.success("Case closed.");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={close}
      disabled={pending}
      className="inline-flex h-9 items-center gap-2 rounded-button border border-border px-4 text-sm font-semibold text-text-secondary transition hover:bg-surface disabled:opacity-50"
    >
      {pending && <Loader2 size={14} className="animate-spin" />}
      Close case
    </button>
  );
}
