"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { markAllInboxRead } from "@/app/actions/customer-inbox";

// "Mark all read" in the Inbox header. The refresh re-renders the page's dots
// and the shell's header dot together.

export function MarkAllReadButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await markAllInboxRead();
          router.refresh();
        })
      }
      className="shrink-0 rounded text-xs font-semibold text-brand-blue transition-colors hover:text-brand-blue-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue disabled:opacity-50"
    >
      {pending ? "Marking…" : "Mark all read"}
    </button>
  );
}
