"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addGarageVehicle } from "@/app/actions/customer-garage";
import { Button, ButtonLink, Panel } from "@/components/dashboard/ui";
import { RegPlateInput } from "@/components/ui/reg-plate-input";

// The garage's inline Add form, opened by `?add=1`. The server action checks
// the registration with DVLA; its sentence is shown as it comes back.

const INPUT =
  "h-12 w-full rounded-xl border border-border bg-white px-3.5 text-[15px] text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20";

export function AddVehicleForm({ nicknameMax }: { nicknameMax: number }) {
  const router = useRouter();
  const regId = useId();
  const nicknameId = useId();
  const [registration, setRegistration] = useState("");
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await addGarageVehicle({ registration, nickname });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Back to the list, which renders fresh with the new vehicle in it.
      router.replace("/dashboard/garage", { scroll: false });
    });
  }

  return (
    <Panel tone="float" padding="lg">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div>
          <h2 className="font-display text-base font-bold text-text-primary">Add a vehicle</h2>
          <p className="mt-1 text-[13px] leading-[19px] text-text-secondary">
            We&apos;ll look it up with the DVLA and fill in its MOT and tax dates.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <span id={regId} className="text-sm font-semibold text-text-primary">
            Registration
          </span>
          <RegPlateInput
            aria-labelledby={regId}
            value={registration}
            onChange={(event) => setRegistration(event.target.value.toUpperCase())}
            autoFocus
            required
            className="h-12 w-full sm:w-72"
          />
        </div>

        <label htmlFor={nicknameId} className="flex flex-col gap-1.5 text-sm font-semibold text-text-primary">
          <span>
            Nickname <span className="font-normal text-text-muted">(optional)</span>
          </span>
          <input
            id={nicknameId}
            type="text"
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            maxLength={nicknameMax}
            placeholder="e.g. Weekend car"
            className={INPUT}
          />
        </label>

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <Button type="submit" disabled={pending || !registration.trim()} className="flex-1 sm:flex-none">
            {pending ? "Checking…" : "Add vehicle"}
          </Button>
          <ButtonLink href="/dashboard/garage" variant="ghost">
            Cancel
          </ButtonLink>
        </div>
      </form>
    </Panel>
  );
}
