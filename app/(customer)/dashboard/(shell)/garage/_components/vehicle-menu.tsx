"use client";

import { useCallback, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { removeVehicle, renameVehicle } from "@/app/actions/customer-garage";
import { Button } from "@/components/dashboard/ui";
import { ConfirmPanel, MenuItem, OverflowMenu } from "@/components/dashboard/overflow-menu";

// A garage card's ⋮: Rename (the nickname) and Remove, with a check first.

type Mode = "closed" | "menu" | "rename" | "remove";

export function VehicleMenu({
  id,
  name,
  nickname,
  registration,
  nicknameMax,
}: {
  id: string;
  /** What the card is titled, for the button's accessible name. */
  name: string;
  nickname: string | null;
  /** "AB12 CDE" */
  registration: string;
  nicknameMax: number;
}) {
  const router = useRouter();
  const inputId = useId();
  const [mode, setMode] = useState<Mode>("closed");
  const [value, setValue] = useState(nickname ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const setOpen = useCallback((open: boolean) => {
    setError(null);
    setMode(open ? "menu" : "closed");
  }, []);

  function rename(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await renameVehicle(id, value);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMode("closed");
      router.refresh();
    });
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await removeVehicle(id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMode("closed");
      router.refresh();
    });
  }

  return (
    <OverflowMenu label={`Options for ${name}`} open={mode !== "closed"} onOpenChange={setOpen}>
      {mode === "menu" && (
        <>
          <MenuItem
            icon={Pencil}
            onClick={() => {
              setValue(nickname ?? "");
              setMode("rename");
            }}
          >
            Rename
          </MenuItem>
          <MenuItem icon={Trash2} tone="danger" onClick={() => setMode("remove")}>
            Remove
          </MenuItem>
        </>
      )}

      {mode === "rename" && (
        <form onSubmit={rename} className="flex flex-col gap-2 p-2.5">
          <label htmlFor={inputId} className="text-xs font-semibold text-text-secondary">
            Nickname
          </label>
          <input
            id={inputId}
            type="text"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            maxLength={nicknameMax}
            placeholder="e.g. Weekend car"
            autoFocus
            className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20"
          />
          <p className="text-xs leading-4 text-text-muted">Leave it empty to show the make and model.</p>
          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-2.5 py-2 text-xs leading-4 text-red-700">
              {error}
            </p>
          )}
          <div className="mt-0.5 flex gap-2">
            <Button type="submit" size="sm" disabled={pending} className="flex-1">
              {pending ? "Saving…" : "Save"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {mode === "remove" && (
        <ConfirmPanel
          title={`Remove ${registration} from your garage?`}
          body="Your bookings for it aren't affected."
          confirmLabel="Remove"
          pendingLabel="Removing…"
          pending={pending}
          error={error}
          onConfirm={remove}
          onCancel={() => setOpen(false)}
        />
      )}
    </OverflowMenu>
  );
}
