"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

type Result = { ok: true } | { ok: false; error: string };

/**
 * Runs a catalogue server action, toasts the outcome and refreshes the page
 * so the server-rendered tree shows the change. Every control on
 * /admin/repairs goes through this so they behave the same.
 */
export function useCatalogueAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(
    action: () => Promise<Result>,
    options: { success?: string; onSuccess?: () => void } = {},
  ) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (options.success) toast.success(options.success);
      options.onSuccess?.();
      router.refresh();
    });
  }

  return { pending, run };
}
