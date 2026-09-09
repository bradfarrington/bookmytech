"use client";

import { useEffect, useRef, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils";

// Collecting the card again for a SECOND manual-capture hold (Task 33 quotes,
// Task 37 revised jobs): the booking's own hold can't be increased, so the
// customer authorises the extra amount here with Stripe Elements, and the
// caller's `confirm` proves the hold against Stripe before anything is
// approved. A 3-D Secure detour returns to the page with the intent's client
// secret on the URL; `useResumeHold` picks that up and runs the same confirm.

export const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null;

export type ConfirmHold = (paymentIntentId: string) => Promise<{ ok: true } | { ok: false; error: string }>;

/**
 * Back from a 3-D Secure redirect: the hold is placed; prove it and finish.
 * Runs once per mount; strips Stripe's query params from the URL either way.
 */
export function useResumeHold(args: {
  confirm: ConfirmHold;
  onConfirming: () => void;
  onDone: () => void;
  onFail: (message: string) => void;
}) {
  const { confirm, onConfirming, onDone, onFail } = args;
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current) return;
    const url = new URL(window.location.href);
    const secret = url.searchParams.get("payment_intent_client_secret");
    if (!secret) return;
    resumed.current = true;
    for (const key of ["payment_intent", "payment_intent_client_secret", "redirect_status"]) url.searchParams.delete(key);
    window.history.replaceState({}, "", url.toString());
    void (async () => {
      const stripe = await stripePromise;
      onConfirming();
      const retrieved = await stripe?.retrievePaymentIntent(secret);
      const pi = retrieved?.paymentIntent;
      if (!pi || pi.status !== "requires_capture") {
        onFail("Your card wasn't authorised. Please try again.");
        return;
      }
      const res = await confirm(pi.id);
      if (!res.ok) {
        onFail(res.error);
        return;
      }
      onDone();
    })();
    // Mount-only by design: the URL is read once and rewritten.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export interface HoldPaymentProps {
  clientSecret: string;
  paymentIntentId: string;
  amountPence: number;
  customerName: string;
  customerEmail: string;
  /** Where Stripe sends a 3-D Secure detour back to — this page. */
  returnUrl: string;
  /** The line under the card box, e.g. "£19 is held now and charged when the job is complete." */
  holdNote: string;
  confirm: ConfirmHold;
  onDone: () => void;
  onBack: () => void;
}

export function HoldPayment(props: HoldPaymentProps) {
  if (!stripePromise) {
    return <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">Payments aren&apos;t configured.</p>;
  }
  return (
    <Elements stripe={stripePromise} options={{ clientSecret: props.clientSecret, appearance: { theme: "stripe" } }}>
      <HoldPaymentForm {...props} />
    </Elements>
  );
}

function HoldPaymentForm({ paymentIntentId, amountPence, customerName, customerEmail, returnUrl, holdNote, confirm, onDone, onBack }: HoldPaymentProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);
    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        payment_method_data: { billing_details: { name: customerName, email: customerEmail } },
        return_url: returnUrl,
      },
      redirect: "if_required",
    });
    if (confirmError) {
      setError(confirmError.message ?? "Payment failed. Please try again.");
      setSubmitting(false);
      return;
    }
    if (!paymentIntent || paymentIntent.status !== "requires_capture") {
      setError("Your card wasn't authorised. Please try again.");
      setSubmitting(false);
      return;
    }
    const res = await confirm(paymentIntentId);
    if (!res.ok) {
      setError(res.error);
      setSubmitting(false);
      return;
    }
    onDone();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <p className="mb-3 text-sm font-semibold text-text-primary">Card details</p>
        <div className="rounded-xl border border-border p-4">
          <PaymentElement />
        </div>
        <p className="mt-2 text-xs text-text-muted">{holdNote}</p>
      </div>
      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-danger">{error}</p>}
      <Button type="submit" size="lg" fullWidth disabled={submitting || !stripe || !elements}>
        {submitting ? "Authorising…" : `Authorise ${formatPrice(amountPence)}`}
      </Button>
      <button type="button" onClick={onBack} className="text-sm font-semibold text-text-muted hover:text-text-primary">
        Back
      </button>
    </form>
  );
}
