"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { markInboxRead } from "@/app/actions/customer-inbox";
import { cn } from "@/lib/utils";

// Opening an Inbox item: mark it read (for every device, Task 52), go where it
// points, then refresh so the shell layout re-runs and the header's unread dot
// catches up. Layouts don't re-render on a client navigation on their own.
// A real link underneath, so a new-tab open still works (and still marks it read).

export function OpenInboxItem({
  id,
  href,
  unread,
  children,
}: {
  id: string;
  href: string;
  unread: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onClick(event: React.MouseEvent<HTMLAnchorElement>) {
    const newTab = event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
    if (newTab) {
      if (unread) void markInboxRead(id);
      return;
    }
    event.preventDefault();
    startTransition(async () => {
      if (unread) await markInboxRead(id);
      router.push(href);
      if (unread) router.refresh();
    });
  }

  return (
    <a
      href={href}
      onClick={onClick}
      aria-busy={pending || undefined}
      className={cn(
        "group block rounded-2xl transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2",
        pending && "opacity-70",
      )}
    >
      {children}
    </a>
  );
}
