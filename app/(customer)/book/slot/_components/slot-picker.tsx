"use client";

import { useState, useTransition } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { addDays, format, isToday, isTomorrow } from "date-fns";
import { Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { Select } from "@/components/ui/select";
import { cn, formatPrice } from "@/lib/utils";
import { createPaymentIntentAction, createBookingAction } from "@/app/actions/create-booking";
import type { CreateBookingInput } from "@/app/actions/create-booking";

type ParkingType = "driveway" | "street" | "car_park" | "other";

const PARKING_OPTIONS: ReadonlyArray<{ value: ParkingType; label: string }> = [
  { value: "driveway", label: "Driveway" },
  { value: "street", label: "Street" },
  { value: "car_park", label: "Car park" },
  { value: "other", label: "Other" },
];

const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null;

const TIME_SLOTS = [
  { label: "Morning", range: "8:00am – 12:00pm", hour: 8, badge: null },
  { label: "Afternoon", range: "12:00pm – 5:00pm", hour: 12, badge: "Popular" },
  { label: "Evening", range: "5:00pm – 8:00pm", hour: 17, badge: "Last" },
] as const;

function dayName(date: Date) {
  if (isToday(date)) return "Today";
  if (isTomorrow(date)) return "Tmrw";
  return format(date, "EEE");
}

interface SlotPickerProps {
  reg: string;
  make: string;
  model?: string;
  defaultPostcode?: string;
  serviceName: string;
  serviceId: string;
  pricePence: number;
}

export function SlotPicker({
  reg,
  make,
  model,
  defaultPostcode = "",
  serviceName,
  serviceId,
  pricePence,
}: SlotPickerProps) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(new Date(), i));
  const [selectedDay, setSelectedDay] = useState(days[0]);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [addressLine1, setAddressLine1] = useState("");
  const [postcode, setPostcode] = useState(defaultPostcode);
  const [parkingType, setParkingType] = useState<ParkingType>("driveway");
  const [instructions, setInstructions] = useState("");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [stripeError, setStripeError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const canProceed =
    !!selectedSlot &&
    addressLine1.trim().length > 3 &&
    postcode.trim().length >= 5;

  function handleProceedToPayment() {
    if (!canProceed) return;
    setStripeError(null);
    startTransition(async () => {
      const result = await createPaymentIntentAction(pricePence);
      if (!result.ok) {
        setStripeError(result.error);
        return;
      }
      setClientSecret(result.clientSecret);
    });
  }

  if (clientSecret && selectedSlot) {
    return (
      <Elements
        stripe={stripePromise}
        options={{ clientSecret, appearance: { theme: "stripe" } }}
      >
        <CheckoutForm
          clientSecret={clientSecret}
          selectedSlot={selectedSlot}
          addressLine1={addressLine1}
          postcode={postcode}
          parkingType={parkingType}
          instructions={instructions}
          reg={reg}
          make={make}
          model={model}
          serviceName={serviceName}
          serviceId={serviceId}
          pricePence={pricePence}
        />
      </Elements>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Date strip */}
      <div>
        <p className="mb-2 text-sm font-semibold text-text-primary">Select a date</p>
        <div className="grid grid-cols-7 gap-2">
          {days.map((day) => {
            const active = day.toDateString() === selectedDay.toDateString();
            return (
              <button
                key={day.toISOString()}
                type="button"
                onClick={() => { setSelectedDay(day); setSelectedSlot(null); }}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-2xl border py-3 text-center transition-colors",
                  active
                    ? "border-brand-blue bg-brand-blue"
                    : "border-border bg-surface-card hover:border-brand-blue/40",
                )}
              >
                <span className={cn("text-[11px] font-semibold uppercase tracking-wide", active ? "text-blue-200" : "text-text-muted")}>
                  {dayName(day)}
                </span>
                <span className={cn("text-xl font-extrabold leading-none", active ? "text-white" : "text-text-primary")}>
                  {format(day, "d")}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Time slots */}
      <div>
        <p className="mb-2 text-sm font-semibold text-text-primary">Select a time</p>
        <div className="grid grid-cols-3 gap-3">
          {TIME_SLOTS.map((slot) => {
            const isoValue = (() => {
              const d = new Date(selectedDay);
              d.setHours(slot.hour, 0, 0, 0);
              return d.toISOString();
            })();
            const active = isoValue === selectedSlot;
            return (
              <button
                key={slot.label}
                type="button"
                onClick={() => setSelectedSlot(isoValue)}
                className={cn(
                  "relative flex flex-col items-center gap-1 rounded-xl border px-2 py-4 text-center transition-colors",
                  active
                    ? "border-brand-blue bg-brand-blue text-white"
                    : "border-border bg-surface-card hover:border-brand-blue/50",
                )}
              >
                {slot.badge && !active && (
                  <span className="absolute -top-2 left-1/2 -translate-x-1/2">
                    <Pill tone={slot.badge === "Popular" ? "active" : "neutral"}>
                      {slot.badge}
                    </Pill>
                  </span>
                )}
                <span className={cn("text-sm font-bold", active ? "text-white" : "text-text-primary")}>
                  {slot.label}
                </span>
                <span className={cn("text-[11px] leading-tight", active ? "text-blue-200" : "text-text-muted")}>
                  {slot.range}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Address */}
      <div className="flex flex-col gap-3">
        <p className="text-sm font-semibold text-text-primary">Your address</p>
        <input
          type="text"
          value={addressLine1}
          onChange={(e) => setAddressLine1(e.target.value)}
          placeholder="House number and street"
          className="h-12 rounded-lg border border-border bg-surface-card px-3 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/25"
        />
        <input
          type="text"
          value={postcode}
          onChange={(e) => setPostcode(e.target.value.toUpperCase())}
          placeholder="Postcode"
          autoComplete="postal-code"
          autoCapitalize="characters"
          maxLength={8}
          className="h-12 rounded-lg border border-border bg-surface-card px-3 text-sm font-bold uppercase tracking-[0.04em] text-text-primary outline-none transition-colors placeholder:font-medium placeholder:normal-case placeholder:tracking-normal placeholder:text-text-muted focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/25"
        />

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-semibold text-text-primary">Parking type</label>
          <Select<ParkingType>
            value={parkingType}
            onChange={setParkingType}
            options={PARKING_OPTIONS}
            aria-label="Parking type"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-semibold text-text-primary">
            Special instructions{" "}
            <span className="font-normal text-text-muted">(optional)</span>
          </label>
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="e.g. ring the bell on arrival, gate code is 1234…"
            rows={2}
            className="rounded-lg border border-border bg-surface-card px-3 py-2.5 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/25 resize-none"
          />
        </div>
      </div>

      {stripeError && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-danger">{stripeError}</p>
      )}

      {/* Sticky CTA */}
      <div className="sticky bottom-4 rounded-2xl border border-border bg-surface-card p-4 shadow-hero">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm text-text-secondary">Amount to pre-authorise</span>
          <span className="text-xl font-bold text-text-primary">{formatPrice(pricePence)}</span>
        </div>
        <Button
          variant="primary"
          size="lg"
          fullWidth
          disabled={!canProceed || pending}
          onClick={handleProceedToPayment}
          iconLeft={pending ? Loader2 : Lock}
        >
          {pending ? "Setting up payment…" : "Confirm booking"}
        </Button>
        <p className="mt-2 text-center text-[11px] text-text-muted">
          No money taken until your job is complete
        </p>
      </div>
    </div>
  );
}

// --- Stripe checkout form shown after PaymentIntent is created ---

interface CheckoutFormProps {
  clientSecret: string;
  selectedSlot: string;
  addressLine1: string;
  postcode: string;
  parkingType: string;
  instructions: string;
  reg: string;
  make: string;
  model?: string;
  serviceName: string;
  serviceId: string;
  pricePence: number;
}

function CheckoutForm({
  clientSecret,
  selectedSlot,
  addressLine1,
  postcode,
  parkingType,
  instructions,
  reg,
  make,
  model,
  serviceName,
  serviceId,
  pricePence,
}: CheckoutFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    if (!name.trim() || !email.trim()) {
      setError("Please enter your name and email.");
      return;
    }
    setSubmitting(true);
    setError(null);

    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: { payment_method_data: { billing_details: { name, email } } },
      redirect: "if_required",
    });

    if (confirmError) {
      setError(confirmError.message ?? "Payment failed. Please try again.");
      setSubmitting(false);
      return;
    }

    if (!paymentIntent) {
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
      return;
    }

    // Extract PI id from clientSecret (format: pi_xxx_secret_yyy)
    const piId = clientSecret.split("_secret_")[0];

    const input: CreateBookingInput = {
      vehicleReg: reg,
      vehicleMake: make,
      vehicleModel: model,
      serviceName,
      serviceId,
      scheduledAt: selectedSlot,
      totalPence: pricePence,
      customerEmail: email.trim(),
      customerName: name.trim(),
      addressLine1: addressLine1,
      postcode: postcode.trim().toUpperCase(),
      parkingType,
      specialInstructions: instructions || undefined,
      stripePaymentIntentId: piId,
    };

    const result = await createBookingAction(input);

    if (!result.ok) {
      setError(result.error);
      setSubmitting(false);
      return;
    }

    window.location.href = `/book/confirmed/${result.bookingId}`;
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div className="rounded-xl border border-border bg-surface p-4 text-sm">
        <p className="font-semibold text-text-primary">{serviceName}</p>
        <p className="text-text-secondary">{reg} · {format(new Date(selectedSlot), "EEE d MMM, h:mm a")}</p>
        <p className="mt-1 text-lg font-bold text-text-primary">{formatPrice(pricePence)}</p>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-semibold text-text-primary">Your details</p>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Full name"
          required
          className="h-12 rounded-lg border border-border bg-surface-card px-3 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/25"
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email address"
          required
          className="h-12 rounded-lg border border-border bg-surface-card px-3 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/25"
        />
      </div>

      <div>
        <p className="mb-3 text-sm font-semibold text-text-primary">Payment details</p>
        <div className="rounded-xl border border-border p-4">
          <PaymentElement />
        </div>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-danger">{error}</p>
      )}

      <Button
        type="submit"
        variant="primary"
        size="lg"
        fullWidth
        disabled={!stripe || submitting}
        iconLeft={submitting ? Loader2 : Lock}
      >
        {submitting ? "Processing…" : `Pre-authorise ${formatPrice(pricePence)}`}
      </Button>
      <p className="text-center text-[11px] text-text-muted">
        No money is taken now. Your card is pre-authorised only — charged when the job is complete.
      </p>
    </form>
  );
}
