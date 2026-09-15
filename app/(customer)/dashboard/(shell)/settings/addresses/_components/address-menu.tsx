"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Star, Trash2 } from "lucide-react";
import { deleteCustomerAddress, setDefaultCustomerAddress } from "@/app/actions/customer-addresses";
import { ConfirmPanel, MenuItem, OverflowMenu } from "@/components/dashboard/overflow-menu";

// An address card's ⋮: Edit, Set as default, and Remove with a check first.

type Mode = "closed" | "menu" | "remove";

export function AddressMenu({ id, label, isDefault }: { id: string; label: string; isDefault: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("closed");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const setOpen = useCallback((open: boolean) => {
    setError(null);
    setMode(open ? "menu" : "closed");
  }, []);

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMode("closed");
      router.refresh();
    });
  }

  return (
    <OverflowMenu label={`Options for ${label}`} open={mode !== "closed"} onOpenChange={setOpen}>
      {mode === "menu" && (
        <>
          <MenuItem icon={Pencil} href={`/dashboard/settings/addresses/${id}`}>
            Edit
          </MenuItem>
          {!isDefault && (
            <MenuItem icon={Star} disabled={pending} onClick={() => run(() => setDefaultCustomerAddress(id))}>
              {pending ? "Saving…" : "Set as default"}
            </MenuItem>
          )}
          <MenuItem icon={Trash2} tone="danger" disabled={pending} onClick={() => setMode("remove")}>
            Remove
          </MenuItem>
          {error && (
            <p role="alert" className="m-1 rounded-lg bg-red-50 px-2.5 py-2 text-xs leading-4 text-red-700">
              {error}
            </p>
          )}
        </>
      )}

      {mode === "remove" && (
        <ConfirmPanel
          title={`Remove ${label}?`}
          body={
            isDefault
              ? "Your most recently updated address becomes your default. Past bookings aren't affected."
              : "Past bookings aren't affected."
          }
          confirmLabel="Remove"
          pendingLabel="Removing…"
          pending={pending}
          error={error}
          onConfirm={() => run(() => deleteCustomerAddress(id))}
          onCancel={() => setOpen(false)}
        />
      )}
    </OverflowMenu>
  );
}
