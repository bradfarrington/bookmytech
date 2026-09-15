"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { updateCustomerProfile, type ProfileState } from "@/app/actions/customer-profile";
import { Button } from "@/components/dashboard/ui";
import { Field, FormAlert, TextInput } from "./field";

// "Your details" on the Account screen: name and mobile, saved through
// updateCustomerProfile (which owns the validation). After a save the page
// revalidates, the defaults catch up with what was typed, and Save greys out.

const initial: ProfileState = null;

export function DetailsForm({ defaultName, defaultPhone }: { defaultName: string; defaultPhone: string }) {
  const [state, formAction, pending] = useActionState(updateCustomerProfile, initial);
  const [name, setName] = useState(defaultName);
  const [phone, setPhone] = useState(defaultPhone);

  useEffect(() => {
    if (state?.ok) toast.success("Your details have been saved.");
  }, [state]);

  const dirty = name.trim() !== defaultName.trim() || phone.trim() !== defaultPhone.trim();

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <Field label="Full name" htmlFor="details-name">
        <TextInput
          id="details-name"
          name="full_name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          required
          disabled={pending}
        />
      </Field>
      <Field
        label="Mobile number"
        htmlFor="details-phone"
        help="So we can text you when your mechanic is on the way."
      >
        <TextInput
          id="details-phone"
          name="phone"
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          autoComplete="tel"
          placeholder="07700 900123"
          aria-describedby="details-phone-help"
          disabled={pending}
        />
      </Field>

      {state?.error && <FormAlert>{state.error}</FormAlert>}

      <Button type="submit" variant="secondary" disabled={pending || !dirty} className="self-start">
        {pending ? "Saving…" : "Save details"}
      </Button>
    </form>
  );
}
