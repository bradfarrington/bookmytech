"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { Check, Clock, Plus } from "lucide-react";
import { startAddingSavedCard } from "@/app/actions/customer-cards";
import { Button, Notice, Panel } from "@/components/dashboard/ui";
import { stripePromise } from "@/components/customer/hold-payment";

// "Add a new card" (Task 53): the server makes a SetupIntent on the customer's
// Stripe Customer, Stripe's PaymentElement confirms it here, and Stripe attaches
// the card itself, so the list only needs refreshing. A 3-D Secure detour comes
// back to this page with Stripe's parameters on the URL (see strip-setup-return).

type Outcome = "saved" | "processing" | null;

const RETURN_PATH = "/dashboard/settings/payment-methods";

export function AddCard() {
  const router = useRouter();
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [pending, startTransition] = useTransition();

  function start() {
    setError(null);
    setOutcome(null);
    if (!stripePromise) {
      setError("Card payments aren't available just now. Please try again shortly.");
      return;
    }
    startTransition(async () => {
      const result = await startAddingSavedCard();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSecret(result.setupIntentClientSecret);
    });
  }

  if (secret && stripePromise) {
    return (
      <Panel padding="lg">
        <Elements stripe={stripePromise} options={{ clientSecret: secret, appearance: { theme: "stripe" } }}>
          <SetupForm
            onDone={(status) => {
              setSecret(null);
              setOutcome(status);
              router.refresh();
            }}
            onCancel={() => setSecret(null)}
          />
        </Elements>
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {outcome === "saved" && <Notice icon={Check} title="Your card has been saved." />}
      {outcome === "processing" && (
        <Notice icon={Clock} title="We're still checking your card.">
          It will appear here once your bank has confirmed it.
        </Notice>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <Button variant="secondary" full icon={Plus} onClick={start} disabled={pending}>
        {pending ? "Just a moment…" : "Add a new card"}
      </Button>
    </div>
  );
}

function SetupForm({
  onDone,
  onCancel,
}: {
  onDone: (status: "saved" | "processing") => void;
  onCancel: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);

    const result = await stripe.confirmSetup({
      elements,
      redirect: "if_required",
      confirmParams: { return_url: `${window.location.origin}${RETURN_PATH}` },
    });

    if (result.error) {
      setError(result.error.message ?? "Your card couldn't be saved. Please try again.");
      setSubmitting(false);
      return;
    }
    if (result.setupIntent.status === "succeeded") return onDone("saved");
    if (result.setupIntent.status === "processing") return onDone("processing");
    setError("Your card couldn't be saved. Please try again.");
    setSubmitting(false);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div>
        <h2 className="font-display text-base font-bold text-text-primary">Add a card</h2>
        <p className="mt-1 text-[13px] leading-[19px] text-text-secondary">
          Your card details go straight to Stripe. Nothing is charged now.
        </p>
      </div>
      <PaymentElement />
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={!stripe || !elements || submitting} className="flex-1">
          {submitting ? "Saving…" : "Save card"}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
