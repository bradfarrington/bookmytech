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
import { Select } from "@/components/ui/select";
import { cn, formatPrice, vehicleLabel } from "@/lib/utils";
import { prepareCheckout, createBookingAction } from "@/app/actions/create-booking";
import type { CreateBookingInput, PrepareCheckoutResult } from "@/app/actions/create-booking";
import { TWO_HOUR_SLOTS, ALL_DAY_SLOT, slotIso, formatBookingSlot } from "@/lib/slots";
import { track, FUNNEL_EVENTS } from "@/lib/analytics/track";

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

function dayName(date: Date) {
  if (isToday(date)) return "Today";
  if (isTomorrow(date)) return "Tmrw";
  return format(date, "EEE");
}

// Narrow the prepareCheckout result to its success shapes once we've handled !ok.
type ReadyCheckout = Extract<PrepareCheckoutResult, { ok: true }>;

interface SlotPickerProps {
  reg: string;
  make: string;
  model?: string;
  defaultPostcode?: string;
  /** Display name of the repair being booked, e.g. "Renew the front brake pads". */
  repairName: string;
  /** HaynesPro repair node id — the server re-quotes from (reg, node). */
  repairNodeId: string;
  pricePence: number;
  preferredMechanicId?: string;
  /** Signed-in customer's spendable account credit (0 for guests). */
  availableCreditPence?: number;
}

export function SlotPicker({
  reg,
  make,
  model,
  defaultPostcode = "",
  repairName,
  repairNodeId,
  pricePence,
  preferredMechanicId,
  availableCreditPence = 0,
}: SlotPickerProps) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(new Date(), i));
  const [selectedDay, setSelectedDay] = useState(days[0]);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  // The arrival window the customer picked (persisted + shown to the mechanic).
  // Tracked alongside selectedSlot because the "8am–10am" and all-day windows
  // share the same start time — the ISO alone can't tell them apart.
  const [selectedWindow, setSelectedWindow] = useState<string | null>(null);
  const [addressLine1, setAddressLine1] = useState("");
  const [postcode, setPostcode] = useState(defaultPostcode);
  const [parkingType, setParkingType] = useState<ParkingType>("driveway");
  const [instructions, setInstructions] = useState("");
  // The server prices, applies any account credit, and decides the payment mode
  // (pre-auth hold, or 'free' when credit covers the whole total) when the
  // customer confirms — that, not the URL estimate, is authoritative.
  const [checkout, setCheckout] = useState<ReadyCheckout | null>(null);
  const [stripeError, setStripeError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const canProceed =
    !!selectedSlot &&
    addressLine1.trim().length > 3 &&
    postcode.trim().length >= 5;

  function handleProceedToPayment() {
    if (!canProceed) return;
    track(FUNNEL_EVENTS.slotPicked, { repairNodeId, slot: selectedSlot });
    setStripeError(null);
    startTransition(async () => {
      const result = await prepareCheckout({ postcode, vehicleReg: reg, repairNodeId });
      if (!result.ok) {
        setStripeError(result.error);
        return;
      }
      setCheckout(result);
    });
  }

  const common = {
    selectedSlot: selectedSlot ?? "",
    selectedWindow: selectedWindow ?? "",
    addressLine1,
    postcode,
    parkingType,
    instructions,
    reg,
    make,
    model,
    repairName,
    repairNodeId,
    preferredMechanicId,
  };

  if (checkout && selectedSlot) {
    // Fully credit-covered — no card needed.
    if (checkout.mode === "free") {
      return <FreeCheckoutForm {...common} checkout={checkout} />;
    }
    // Pre-auth: place the manual-capture hold via Stripe Elements.
    return (
      <Elements
        stripe={stripePromise}
        options={{ clientSecret: checkout.clientSecret, appearance: { theme: "stripe" } }}
      >
        <CheckoutForm {...common} checkout={checkout} />
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
                onClick={() => { setSelectedDay(day); setSelectedSlot(null); setSelectedWindow(null); }}
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

      {/* Time slots — 2-hour arrival windows, plus an all-day option */}
      <div>
        <p className="mb-2 text-sm font-semibold text-text-primary">Select an arrival window</p>
        <div className="grid grid-cols-3 gap-3">
          {TWO_HOUR_SLOTS.map((slot) => {
            const isoValue = slotIso(selectedDay, slot.startHour);
            const active = selectedSlot === isoValue && selectedWindow === slot.window;
            return (
              <button
                key={slot.window}
                type="button"
                onClick={() => { setSelectedSlot(isoValue); setSelectedWindow(slot.window); }}
                className={cn(
                  "flex items-center justify-center rounded-xl border px-2 py-4 text-center text-sm font-bold transition-colors",
                  active
                    ? "border-brand-blue bg-brand-blue text-white"
                    : "border-border bg-surface-card text-text-primary hover:border-brand-blue/50",
                )}
              >
                {slot.window}
              </button>
            );
          })}
        </div>

        {(() => {
          const isoValue = slotIso(selectedDay, ALL_DAY_SLOT.startHour);
          const active = selectedSlot === isoValue && selectedWindow === ALL_DAY_SLOT.window;
          return (
            <button
              type="button"
              onClick={() => { setSelectedSlot(isoValue); setSelectedWindow(ALL_DAY_SLOT.window); }}
              className={cn(
                "mt-3 flex w-full flex-col items-center gap-0.5 rounded-xl border px-2 py-3.5 text-center transition-colors",
                active
                  ? "border-brand-blue bg-brand-blue text-white"
                  : "border-border bg-surface-card hover:border-brand-blue/50",
              )}
            >
              <span className={cn("text-sm font-bold", active ? "text-white" : "text-text-primary")}>
                All day
              </span>
              <span className={cn("text-[11px] leading-tight", active ? "text-blue-200" : "text-text-muted")}>
                8am – 8pm
              </span>
            </button>
          );
        })()}
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

      {availableCreditPence > 0 && (
        <p className="rounded-lg bg-green-50 px-4 py-3 text-sm font-medium text-success">
          You have {formatPrice(availableCreditPence)} in credit — it&apos;ll be applied at the next step.
        </p>
      )}

      {stripeError && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-danger">{stripeError}</p>
      )}

      {/* Sticky CTA */}
      <div className="sticky bottom-4 rounded-2xl border border-border bg-surface-card p-4 shadow-hero">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm text-text-secondary">Estimated total</span>
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
          {pending ? "Setting up…" : "Confirm booking"}
        </Button>
        <p className="mt-2 text-center text-[11px] text-text-muted">
          No money taken until your job is complete
        </p>
      </div>
    </div>
  );
}

// --- Shared confirm-step props ---------------------------------------------

interface ConfirmCommon {
  selectedSlot: string;
  selectedWindow: string;
  addressLine1: string;
  postcode: string;
  parkingType: string;
  instructions: string;
  reg: string;
  make: string;
  model?: string;
  repairName: string;
  repairNodeId: string;
  preferredMechanicId?: string;
}

function bookingInputFrom(
  c: ConfirmCommon,
  name: string,
  email: string,
  phone: string,
  extra: Partial<CreateBookingInput>,
): CreateBookingInput {
  return {
    vehicleReg: c.reg,
    vehicleMake: c.make,
    vehicleModel: c.model,
    repairNodeId: c.repairNodeId,
    scheduledAt: c.selectedSlot,
    slotWindow: c.selectedWindow || undefined,
    customerEmail: email.trim(),
    customerName: name.trim(),
    customerPhone: phone.trim() || undefined,
    addressLine1: c.addressLine1,
    postcode: c.postcode.trim().toUpperCase(),
    parkingType: c.parkingType,
    specialInstructions: c.instructions || undefined,
    preferredMechanicId: c.preferredMechanicId || undefined,
    ...extra,
  };
}

// Price breakdown shown on every confirm step.
function PriceSummary({
  totalPence,
  creditAppliedPence,
  chargePence,
}: {
  totalPence: number;
  creditAppliedPence: number;
  chargePence: number;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 text-sm">
      <div className="flex items-center justify-between text-text-secondary">
        <span>Repair total</span>
        <span>{formatPrice(totalPence)}</span>
      </div>
      {creditAppliedPence > 0 && (
        <div className="mt-1 flex items-center justify-between font-medium text-success">
          <span>Account credit</span>
          <span>−{formatPrice(creditAppliedPence)}</span>
        </div>
      )}
      <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-base font-bold text-text-primary">
        <span>To pay</span>
        <span>{formatPrice(chargePence)}</span>
      </div>
    </div>
  );
}

// --- Stripe checkout form: pre-auth hold (always taken at booking) ----------

function CheckoutForm({
  checkout,
  ...c
}: ConfirmCommon & { checkout: Extract<ReadyCheckout, { mode: "preauth" }> }) {
  const stripe = useStripe();
  const elements = useElements();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
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

    // Place the manual-capture hold now (captured on completion). The hold is
    // always taken — credit only reduces its amount.
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
    const piId = checkout.clientSecret.split("_secret_")[0];

    const result = await createBookingAction(
      bookingInputFrom(c, name, email, phone, {
        paymentMode: "preauth",
        creditAppliedPence: checkout.creditAppliedPence,
        stripePaymentIntentId: piId,
      }),
    );
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
        <p className="font-semibold text-text-primary">{c.repairName}</p>
        <p className="text-text-secondary">{vehicleLabel(c.reg, c.make, c.model)} · {formatBookingSlot(c.selectedSlot, c.selectedWindow)}</p>
      </div>

      <PriceSummary
        totalPence={checkout.totalPence}
        creditAppliedPence={checkout.creditAppliedPence}
        chargePence={checkout.chargePence}
      />

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
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Mobile number (optional — for text updates)"
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
        {submitting ? "Processing…" : `Pre-authorise ${formatPrice(checkout.chargePence)}`}
      </Button>
      <p className="text-center text-[11px] text-text-muted">
        No money is taken now. Your card is pre-authorised only — charged when the job is complete.
      </p>
    </form>
  );
}

// --- Free checkout (account credit covers the whole total) ------------------

function FreeCheckoutForm({
  checkout,
  ...c
}: ConfirmCommon & { checkout: Extract<ReadyCheckout, { mode: "free" }> }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      setError("Please enter your name and email.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await createBookingAction(
      bookingInputFrom(c, name, email, phone, {
        paymentMode: "free",
        creditAppliedPence: checkout.creditAppliedPence,
      }),
    );
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
        <p className="font-semibold text-text-primary">{c.repairName}</p>
        <p className="text-text-secondary">{vehicleLabel(c.reg, c.make, c.model)} · {formatBookingSlot(c.selectedSlot, c.selectedWindow)}</p>
      </div>

      <PriceSummary
        totalPence={checkout.totalPence}
        creditAppliedPence={checkout.creditAppliedPence}
        chargePence={0}
      />

      <p className="rounded-lg bg-green-50 px-4 py-3 text-sm font-medium text-success">
        Your account credit covers this booking in full — there&apos;s nothing to pay.
      </p>

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
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Mobile number (optional — for text updates)"
          className="h-12 rounded-lg border border-border bg-surface-card px-3 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/25"
        />
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-danger">{error}</p>
      )}

      <Button type="submit" variant="primary" size="lg" fullWidth disabled={submitting} iconLeft={submitting ? Loader2 : Lock}>
        {submitting ? "Processing…" : "Confirm booking"}
      </Button>
    </form>
  );
}
