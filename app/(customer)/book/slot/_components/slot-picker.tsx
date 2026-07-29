"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { addDays, format, isToday, isTomorrow } from "date-fns";
import { Loader2, Lock, CheckCircle2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { cn, formatPrice, vehicleLabel } from "@/lib/utils";
import { prepareCheckout, createBookingAction } from "@/app/actions/create-booking";
import type { CreateBookingInput, PrepareCheckoutResult } from "@/app/actions/create-booking";
import { ensureCustomerAccount, requestPasswordReset } from "@/app/actions/booking-account";
import { TWO_HOUR_SLOTS, ALL_DAY_SLOT, slotIso, formatBookingSlot } from "@/lib/slots";
import { track, FUNNEL_EVENTS } from "@/lib/analytics/track";

type ParkingType = "driveway" | "street" | "car_park" | "other";

const PARKING_OPTIONS: ReadonlyArray<{ value: ParkingType; label: string }> = [
  { value: "driveway", label: "Driveway" },
  { value: "street", label: "Street" },
  { value: "car_park", label: "Car park" },
  { value: "other", label: "Other" },
];

const MIN_PASSWORD_LENGTH = 8;

const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null;

const inputClass =
  "h-12 rounded-lg border border-border bg-surface-card px-3 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/25";

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
  /** Whether the visitor is signed in AS A CUSTOMER — hides the account block. */
  signedIn?: boolean;
  /**
   * Set when the session belongs to an admin or mechanic. They can't book as
   * themselves (middleware keeps them out of /dashboard, so the job would be
   * invisible to them), so we ask them to sign out rather than silently
   * attaching the booking to a staff account.
   */
  wrongRole?: string;
  /** Signed-in customer's details, used in place of the account block. */
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
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
  signedIn = false,
  wrongRole,
  customerName = "",
  customerEmail = "",
  customerPhone = "",
}: SlotPickerProps) {
  const router = useRouter();
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

  // --- Account (guests only) -------------------------------------------------
  // Every booking needs an account so the customer lands on a dashboard that
  // owns their job. It's created BEFORE the pre-auth: a failure here costs the
  // customer nothing, and the session lets prepareCheckout price their credit.
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  // "signin" once we've found their email already has an account.
  const [accountMode, setAccountMode] = useState<"create" | "signin">("create");
  const [accountReady, setAccountReady] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const [resetPending, startResetTransition] = useTransition();
  const [signOutPending, startSignOutTransition] = useTransition();

  // The server prices, applies any account credit, and decides the payment mode
  // (pre-auth hold, or 'free' when credit covers the whole total) when the
  // customer confirms — that, not the URL estimate, is authoritative.
  const [checkout, setCheckout] = useState<ReadyCheckout | null>(null);
  const [stripeError, setStripeError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const hasAccount = signedIn || accountReady;
  const accountFilled =
    name.trim().length > 1 &&
    email.trim().includes("@") &&
    password.length >= MIN_PASSWORD_LENGTH;

  const canProceed =
    !wrongRole &&
    !!selectedSlot &&
    addressLine1.trim().length > 3 &&
    postcode.trim().length >= 5 &&
    (hasAccount || accountFilled);

  // Clear the staff session in the browser and re-render the page as a guest —
  // a server sign-out would redirect away and lose the funnel.
  function handleSignOut() {
    startSignOutTransition(async () => {
      await createClient().auth.signOut();
      router.refresh();
    });
  }

  function handleProceedToPayment() {
    if (!canProceed) return;
    track(FUNNEL_EVENTS.slotPicked, { repairNodeId, slot: selectedSlot });
    setStripeError(null);
    setAccountError(null);
    startTransition(async () => {
      // Account first — nothing is authorised until this succeeds.
      if (!hasAccount) {
        const account = await ensureCustomerAccount({
          fullName: name,
          email,
          password,
          phone,
        });
        if (!account.ok) {
          setAccountError(account.error);
          if (account.needsPassword) {
            setAccountMode("signin");
            setPassword("");
          }
          return;
        }
        setAccountReady(true);
      }

      const result = await prepareCheckout({ postcode, vehicleReg: reg, repairNodeId });
      if (!result.ok) {
        setStripeError(result.error);
        return;
      }
      setCheckout(result);
    });
  }

  function handleForgotPassword() {
    startResetTransition(async () => {
      const result = await requestPasswordReset(email);
      if (!result.ok) {
        setAccountError(result.error);
        return;
      }
      setResetSent(true);
      setAccountError(null);
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
    // Identity is settled before this step — the checkout no longer asks.
    customerName: signedIn ? customerName : name.trim(),
    customerEmail: signedIn ? customerEmail : email.trim(),
    customerPhone: signedIn ? customerPhone : phone.trim(),
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
          className={inputClass}
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

      {/* Account — created before payment so the booking lands on a dashboard */}
      {wrongRole ? (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-2.5">
            <ShieldAlert size={18} className="mt-0.5 shrink-0 text-amber-700" />
            <div>
              <p className="text-sm font-semibold text-amber-900">
                You&apos;re signed in as {wrongRole === "mechanic" ? "a mechanic" : "an admin"}
              </p>
              <p className="mt-0.5 text-[13px] text-amber-800">
                Staff accounts can&apos;t book — the job wouldn&apos;t show on a customer
                dashboard. Sign out to book (or test the flow) as a customer.
              </p>
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleSignOut}
            disabled={signOutPending}
            iconLeft={signOutPending ? Loader2 : undefined}
          >
            {signOutPending ? "Signing out…" : "Sign out and continue"}
          </Button>
        </div>
      ) : signedIn ? (
        <p className="rounded-lg bg-surface px-4 py-3 text-sm text-text-secondary">
          Booking as{" "}
          <span className="font-semibold text-text-primary">{customerEmail}</span>
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-sm font-semibold text-text-primary">
              {accountMode === "signin" ? "Sign in to continue" : "Your details"}
            </p>
            <p className="mt-0.5 text-[13px] text-text-muted">
              {accountMode === "signin"
                ? "You've booked with us before — enter your password."
                : "We'll create your account so you can track this job, message your mechanic and rebook in a tap."}
            </p>
          </div>

          {accountMode === "create" && (
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
              autoComplete="name"
              className={inputClass}
            />
          )}

          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email address"
            autoComplete="email"
            className={inputClass}
          />

          {accountMode === "create" && (
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Mobile number (optional — for text updates)"
              autoComplete="tel"
              className={inputClass}
            />
          )}

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={
              accountMode === "signin"
                ? "Your password"
                : `Create a password (${MIN_PASSWORD_LENGTH}+ characters)`
            }
            autoComplete={accountMode === "signin" ? "current-password" : "new-password"}
            minLength={MIN_PASSWORD_LENGTH}
            className={inputClass}
          />

          {accountMode === "signin" && !resetSent && (
            <button
              type="button"
              onClick={handleForgotPassword}
              disabled={resetPending}
              className="self-start text-[13px] font-semibold text-brand-blue hover:underline disabled:opacity-50"
            >
              {resetPending ? "Sending…" : "Forgotten your password?"}
            </button>
          )}

          {resetSent && (
            <p className="rounded-lg bg-blue-50 px-4 py-3 text-sm text-brand-blue">
              We&apos;ve emailed you a link to set a new password. Open it, choose a
              password, then come back and finish your booking.
            </p>
          )}

          {accountError && (
            <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-danger">
              {accountError}
            </p>
          )}
        </div>
      )}

      {accountReady && !signedIn && (
        <p className="flex items-center gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm font-medium text-success">
          <CheckCircle2 size={16} /> Your account is ready.
        </p>
      )}

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
          {pending ? "Setting up…" : "Continue to payment"}
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
  /** Resolved before this step — the customer always has an account by now. */
  customerName: string;
  customerEmail: string;
  customerPhone: string;
}

function bookingInputFrom(
  c: ConfirmCommon,
  extra: Partial<CreateBookingInput>,
): CreateBookingInput {
  return {
    vehicleReg: c.reg,
    vehicleMake: c.make,
    vehicleModel: c.model,
    repairNodeId: c.repairNodeId,
    scheduledAt: c.selectedSlot,
    slotWindow: c.selectedWindow || undefined,
    customerEmail: c.customerEmail,
    customerName: c.customerName,
    customerPhone: c.customerPhone || undefined,
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

// Job + account recap at the top of the confirm step.
function BookingRecap({ c }: { c: ConfirmCommon }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 text-sm">
      <p className="font-semibold text-text-primary">{c.repairName}</p>
      <p className="text-text-secondary">
        {vehicleLabel(c.reg, c.make, c.model)} · {formatBookingSlot(c.selectedSlot, c.selectedWindow)}
      </p>
      <p className="mt-2 border-t border-border pt-2 text-text-muted">
        Booking as <span className="font-medium text-text-secondary">{c.customerEmail}</span>
      </p>
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
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);

    // Place the manual-capture hold now (captured on completion). The hold is
    // always taken — credit only reduces its amount.
    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        payment_method_data: {
          billing_details: { name: c.customerName, email: c.customerEmail },
        },
      },
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
      bookingInputFrom(c, {
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
      <BookingRecap c={c} />

      <PriceSummary
        totalPence={checkout.totalPence}
        creditAppliedPence={checkout.creditAppliedPence}
        chargePence={checkout.chargePence}
      />

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
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await createBookingAction(
      bookingInputFrom(c, {
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
      <BookingRecap c={c} />

      <PriceSummary
        totalPence={checkout.totalPence}
        creditAppliedPence={checkout.creditAppliedPence}
        chargePence={0}
      />

      <p className="rounded-lg bg-green-50 px-4 py-3 text-sm font-medium text-success">
        Your account credit covers this booking in full — there&apos;s nothing to pay.
      </p>

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-danger">{error}</p>
      )}

      <Button type="submit" variant="primary" size="lg" fullWidth disabled={submitting} iconLeft={submitting ? Loader2 : Lock}>
        {submitting ? "Processing…" : "Confirm booking"}
      </Button>
    </form>
  );
}
