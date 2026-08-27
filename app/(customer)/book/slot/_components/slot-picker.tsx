"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { Loader2, Lock, CheckCircle2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { cn, formatPrice, vehicleLabel } from "@/lib/utils";
import { prepareCheckout, createBookingAction } from "@/app/actions/create-booking";
import type { CreateBookingInput, PrepareCheckoutResult } from "@/app/actions/create-booking";
import { reportOrphanedHold } from "@/app/actions/orphaned-hold";
import { ensureCustomerAccount, requestPasswordReset } from "@/app/actions/booking-account";
import {
  TWO_HOUR_SLOTS,
  ALL_DAY_SLOT,
  slotIso,
  formatBookingSlot,
  isSlotBookable,
  dayHasBookableSlot,
  upcomingDayKeys,
  dayChipLabel,
  londonDateKey,
  MIN_LEAD_MINUTES,
} from "@/lib/slots";
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

// Narrow the prepareCheckout result to its success shapes once we've handled !ok.
type ReadyCheckout = Extract<PrepareCheckoutResult, { ok: true }>;

// --- Surviving a 3-D Secure redirect ---------------------------------------
//
// `redirect: "if_required"` does not mean "no redirect". When the issuer won't
// run its challenge in Stripe's iframe, Stripe navigates the whole page away and
// later returns the customer to `return_url` — to a FRESHLY MOUNTED SlotPicker.
// Every answer they gave (slot, address, parking, instructions, name, email) and
// the `checkout` result itself are component state, and are gone. The hold,
// meanwhile, is live on their card.
//
// So the draft is parked before confirming and replayed on the way back.
// sessionStorage, not the URL: it holds the customer's address. Same tab, dies
// with it — the right lifetime for a half-finished checkout.
//
// Keyed by PaymentIntent id so a customer who abandons one attempt and starts
// another can't have the first attempt's answers replayed against the second
// attempt's hold.

const DRAFT_PREFIX = "bmt.checkout-draft.";

interface CheckoutDraft {
  common: ConfirmCommon;
  /** What the hold was reduced by — createBooking redeems against it. */
  creditAppliedPence: number;
  /**
   * The prepared checkout itself, so a customer whose window closed while
   * they were at their bank can pick another time and finish on the hold they
   * already confirmed. Absent on drafts parked by older builds.
   */
  checkout?: ReadyCheckout;
}

/** Shown on the picker when the customer is sent back to choose again. */
const SLOT_PASSED_NOTICE =
  "That arrival window has passed while you were checking out. Pick another time — your card is already authorised, so you won't need to enter it again.";

/** `pi_3abc..._secret_xyz` → `pi_3abc...` */
function intentIdFrom(clientSecret: string): string {
  return clientSecret.split("_secret_")[0];
}

function saveDraft(intentId: string, draft: CheckoutDraft): void {
  try {
    sessionStorage.setItem(DRAFT_PREFIX + intentId, JSON.stringify(draft));
  } catch {
    // Private mode, or storage full. The common path never redirects and so
    // never reads this back — failing to save must not block the payment.
  }
}

function readDraft(intentId: string): CheckoutDraft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_PREFIX + intentId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CheckoutDraft;
    // A draft missing either of these can't produce a bookable row.
    if (!parsed?.common?.selectedSlot || !parsed.common.addressLine1) return null;
    return parsed;
  } catch {
    return null;
  }
}

function clearDraft(intentId: string): void {
  try {
    sessionStorage.removeItem(DRAFT_PREFIX + intentId);
  } catch {
    // Nothing to do — it dies with the tab regardless.
  }
}

/**
 * Query for the return URL. It must land on a page that RENDERS: /book/slot
 * bounces to /book without `reg` and `repair`. The rest is carried so the header
 * and the form still describe the right vehicle if we have to put the customer
 * back on it. The address is deliberately absent — that's what the draft is for.
 */
type ResumeState =
  | { phase: "idle" }
  /** Back from the challenge, finishing the booking. Do not close the page. */
  | { phase: "completing" }
  /** The hold is live and we can't turn it into a booking. Ops has been told. */
  | { phase: "stranded"; detail?: string };

/** Statuses that mean the customer's money IS committed. */
const MONEY_HELD = new Set(["requires_capture", "succeeded"]);

/** Statuses that mean nothing was taken — safe to put them back on the form. */
const NOTHING_HELD = new Set([
  "requires_payment_method",
  "requires_confirmation",
  "requires_action",
  "canceled",
]);

function returnParams(c: ConfirmCommon): Record<string, string> {
  const params: Record<string, string> = { reg: c.reg, repair: c.repairNodeId };
  if (c.make) params.make = c.make;
  if (c.model) params.model = c.model;
  if (c.preferredMechanicId) params.pref = c.preferredMechanicId;
  return params;
}

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
   * themselves (proxy keeps them out of /dashboard, so the job would be
   * invisible to them), so we ask them to sign out rather than silently
   * attaching the booking to a staff account.
   */
  wrongRole?: string;
  /** Signed-in customer's details, used in place of the account block. */
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  /**
   * `payment_intent_client_secret` off the URL, present only when Stripe has
   * just returned the customer from a 3-D Secure challenge. Threaded down from
   * the page rather than read from `window` so the first render agrees with the
   * server's — this decides whether the picker renders the form at all.
   */
  returnedIntentSecret?: string;
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
  returnedIntentSecret,
}: SlotPickerProps) {
  const router = useRouter();

  // "Now", re-read every minute so a customer who sits on the page watches
  // windows close rather than booking one that has quietly passed. All the
  // date/window maths is UK time (lib/slots) — a device in another zone, or
  // the UTC server rendering this, sees the same days and the same cut-offs.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Seven UK calendar days from today, as "YYYY-MM-DD" keys. Today drops out
  // of the *selectable* set once its last window has closed (after 7pm), so
  // the default selection is the first day that still has something to offer.
  const days = upcomingDayKeys(now);
  const [selectedDay, setSelectedDay] = useState(
    () => days.find((d) => dayHasBookableSlot(d, now)) ?? days[0],
  );
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  // The arrival window the customer picked (persisted + shown to the mechanic).
  // Tracked alongside selectedSlot because the "8am–10am" and all-day windows
  // share the same start time — the ISO alone can't tell them apart.
  const [selectedWindow, setSelectedWindow] = useState<string | null>(null);

  // A window chosen earlier can close while the form is being filled in. It's
  // judged against `now` at render, so the CTA disables (and the button loses
  // its highlight) rather than sending a start the server would reject.
  const selectedSlotOpen =
    !!selectedSlot &&
    new Date(selectedSlot).getTime() - now.getTime() >= MIN_LEAD_MINUTES * 60_000;

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

  // A hold the customer has ALREADY confirmed on their card. Set the moment
  // confirmPayment succeeds and kept if the booking write then fails: Stripe
  // refuses a second confirm on an authorised intent, and a reload would
  // prepare a fresh intent and place a SECOND hold. With this remembered, a
  // retry — or a re-picked time after the window closed — goes straight to
  // the booking write against the hold they already have.
  const [confirmedIntentId, setConfirmedIntentId] = useState<string | null>(null);
  const [slotNotice, setSlotNotice] = useState<string | null>(null);

  // The window closed under them (a 3-D Secure trip that outlasted the lead
  // time, or a long think). Nothing was written and the hold is untouched:
  // drop the slot so the picker comes back, keep everything else.
  function handleSlotPassed() {
    setSelectedSlot(null);
    setSelectedWindow(null);
    setSlotNotice(SLOT_PASSED_NOTICE);
  }

  // Where we are in the return-from-redirect path (see the draft helpers above).
  // "idle" is every ordinary render — the customer arriving at this page normally.
  // Seeded from the prop, not from an effect: a customer coming back from their
  // bank must never be shown the empty "Pick a time" form, not even for a frame.
  const [resume, setResume] = useState<ResumeState>(
    returnedIntentSecret ? { phase: "completing" } : { phase: "idle" },
  );
  const resumeStarted = useRef(false);

  const hasAccount = signedIn || accountReady;
  const accountFilled =
    name.trim().length > 1 &&
    email.trim().includes("@") &&
    password.length >= MIN_PASSWORD_LENGTH;

  const canProceed =
    !wrongRole &&
    selectedSlotOpen &&
    addressLine1.trim().length > 3 &&
    postcode.trim().length >= 5 &&
    (hasAccount || accountFilled);

  // Put a parked draft back on the form, for when the customer failed the
  // challenge and has to try again. Nothing was taken in that case.
  function restoreDraft(c: ConfirmCommon, opts: { keepSlot?: boolean } = {}) {
    if (opts.keepSlot !== false) {
      setSelectedSlot(c.selectedSlot || null);
      setSelectedWindow(c.selectedWindow || null);
      const when = new Date(c.selectedSlot);
      if (c.selectedSlot && !Number.isNaN(when.getTime())) setSelectedDay(londonDateKey(when));
    }
    setAddressLine1(c.addressLine1);
    setPostcode(c.postcode);
    if (PARKING_OPTIONS.some((o) => o.value === c.parkingType)) {
      setParkingType(c.parkingType as ParkingType);
    }
    setInstructions(c.instructions);
    // The account block is hidden once they're signed in (which they are by
    // now — the account is created before the pre-auth), but a guest whose
    // session didn't survive the round trip still gets their details back.
    if (!signedIn) {
      setName(c.customerName);
      setEmail(c.customerEmail);
      setPhone(c.customerPhone);
    }
  }

  // Coming back from a 3-D Secure redirect. Stripe returns the customer to
  // `return_url` with the intent's client secret on the query string; by then
  // the hold is already placed and this component has been remounted from
  // scratch, so finishing the booking is entirely on us.
  useEffect(() => {
    // Runs once — React StrictMode mounts effects twice in dev, and writing the
    // booking twice would mean two rows against one hold.
    if (resumeStarted.current) return;
    const secret = returnedIntentSecret;
    if (!secret) return;
    resumeStarted.current = true;

    // Strip Stripe's params straight away, so a reload can't replay this.
    // history.replaceState, not the router: a router navigation would re-render
    // the server component and wipe the state we're about to restore.
    const url = new URL(window.location.href);
    for (const key of ["payment_intent", "payment_intent_client_secret", "redirect_status"]) {
      url.searchParams.delete(key);
    }
    window.history.replaceState({}, "", url.toString());

    const intentId = intentIdFrom(secret);

    void (async () => {
      const stripe = await stripePromise;
      const retrieved = await stripe?.retrievePaymentIntent(secret);
      const paymentIntent = retrieved?.paymentIntent;

      if (!paymentIntent) {
        // We can't tell whether the hold landed, so we can't safely offer a
        // retry that might place a second one. The report re-reads the real
        // status server-side and only alerts if funds are genuinely held.
        void reportOrphanedHold(intentId, "client could not retrieve the intent");
        setResume({ phase: "stranded" });
        return;
      }

      const draft = readDraft(paymentIntent.id);

      // NOT `succeeded` — a confirmed manual-capture hold sits at
      // `requires_capture`, and nothing is captured until the job is done.
      // Testing for `succeeded` would reject every good payment.
      if (MONEY_HELD.has(paymentIntent.status)) {
        if (!draft) {
          void reportOrphanedHold(paymentIntent.id, "checkout draft missing on return");
          setResume({ phase: "stranded" });
          return;
        }
        // Same call the non-redirect path makes, with the same draft.
        const result = await createBookingAction(
          bookingInputFrom(draft.common, {
            paymentMode: "preauth",
            creditAppliedPence: draft.creditAppliedPence,
            stripePaymentIntentId: paymentIntent.id,
          }),
        );
        if (!result.ok) {
          // The bank took longer than the window's lead time. The hold is
          // good and stays theirs — put them back on the picker with
          // everything else restored, and finish on this intent without
          // confirming again. (Needs the checkout parked in the draft; a
          // draft from an older build without it is treated as stranded.)
          if (result.code === "slot_passed" && draft.checkout) {
            clearDraft(paymentIntent.id);
            restoreDraft(draft.common, { keepSlot: false });
            setCheckout(draft.checkout);
            setConfirmedIntentId(paymentIntent.id);
            setSlotNotice(SLOT_PASSED_NOTICE);
            setResume({ phase: "idle" });
            return;
          }
          void reportOrphanedHold(paymentIntent.id, `booking write failed: ${result.error}`);
          setResume({ phase: "stranded", detail: result.error });
          return;
        }
        clearDraft(paymentIntent.id);
        window.location.href = `/book/confirmed/${result.bookingId}`;
        return;
      }

      if (NOTHING_HELD.has(paymentIntent.status)) {
        // They failed or dismissed the challenge. Their card is untouched, so
        // put them back where they were rather than at step one.
        if (draft) restoreDraft(draft.common);
        clearDraft(paymentIntent.id);
        setStripeError(
          "Your bank didn't authorise that payment, so nothing has been taken. Check your card details and try again.",
        );
        setResume({ phase: "idle" });
        return;
      }

      // `processing`, or something Stripe adds later. Unknown, so treat it as
      // money we might be holding.
      void reportOrphanedHold(paymentIntent.id, `unexpected status: ${paymentIntent.status}`);
      setResume({ phase: "stranded" });
    })();
    // Mount-only: this reads the URL Stripe returned us to, which never changes
    // after the first render (we strip it above).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Back from a 3-D Secure challenge — finishing the booking they've paid for.
  if (resume.phase === "completing") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface-card p-8 text-center">
        <Loader2 size={28} className="animate-spin text-brand-blue" />
        <p className="text-base font-semibold text-text-primary">Confirming your booking…</p>
        <p className="text-sm text-text-secondary">
          Your bank has approved the payment. Please don&apos;t close this page — we&apos;re
          finishing your booking now.
        </p>
      </div>
    );
  }

  // The hold is live and we couldn't write the booking. Say so plainly: they
  // have a pending amount on their card and no job in the system.
  if (resume.phase === "stranded") {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-6">
        <div className="flex items-start gap-2.5">
          <ShieldAlert size={20} className="mt-0.5 shrink-0 text-amber-700" />
          <div>
            <p className="text-base font-semibold text-amber-900">
              We&apos;ve held the funds but couldn&apos;t finish your booking
            </p>
            <p className="mt-1 text-sm text-amber-800">
              Your bank approved the payment, but something went wrong saving your job.
              Please don&apos;t book again — get in touch and we&apos;ll sort it out and
              release the hold if you&apos;d rather start over. Nothing has actually been
              charged, and the hold releases itself within 7 days.
            </p>
            {resume.detail && (
              <p className="mt-2 text-[13px] text-amber-800">Details: {resume.detail}</p>
            )}
            <p className="mt-3 text-sm text-amber-900">
              Email{" "}
              <a
                href="mailto:help@bookmytech.co.uk"
                className="font-semibold underline"
              >
                help@bookmytech.co.uk
              </a>{" "}
              — we already know about this one and are looking at it.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (checkout && selectedSlot) {
    // Fully credit-covered — no card needed.
    if (checkout.mode === "free") {
      return <FreeCheckoutForm {...common} checkout={checkout} onSlotPassed={handleSlotPassed} />;
    }
    // Pre-auth: place the manual-capture hold via Stripe Elements.
    return (
      <Elements
        stripe={stripePromise}
        options={{ clientSecret: checkout.clientSecret, appearance: { theme: "stripe" } }}
      >
        <CheckoutForm
          {...common}
          checkout={checkout}
          confirmedIntentId={confirmedIntentId}
          onConfirmed={setConfirmedIntentId}
          onSlotPassed={handleSlotPassed}
        />
      </Elements>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {slotNotice && (
        <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {slotNotice}
        </p>
      )}

      {/* Date strip */}
      <div>
        <p className="mb-2 text-sm font-semibold text-text-primary">Select a date</p>
        <div className="grid grid-cols-7 gap-2">
          {days.map((day) => {
            const active = day === selectedDay;
            const bookable = dayHasBookableSlot(day, now);
            const label = dayChipLabel(day, now);
            return (
              <button
                key={day}
                type="button"
                disabled={!bookable}
                title={bookable ? undefined : "No more arrival windows today"}
                onClick={() => { setSelectedDay(day); setSelectedSlot(null); setSelectedWindow(null); }}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-2xl border py-3 text-center transition-colors",
                  active
                    ? "border-brand-blue bg-brand-blue"
                    : "border-border bg-surface-card hover:border-brand-blue/40",
                  "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border",
                )}
              >
                <span className={cn("text-[11px] font-semibold uppercase tracking-wide", active ? "text-blue-200" : "text-text-muted")}>
                  {label.weekday}
                </span>
                <span className={cn("text-xl font-extrabold leading-none", active ? "text-white" : "text-text-primary")}>
                  {label.dayOfMonth}
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
            const bookable = isSlotBookable(selectedDay, slot, now);
            const active = bookable && selectedSlot === isoValue && selectedWindow === slot.window;
            return (
              <button
                key={slot.window}
                type="button"
                disabled={!bookable}
                title={bookable ? undefined : "This window has passed"}
                onClick={() => { setSelectedSlot(isoValue); setSelectedWindow(slot.window); }}
                className={cn(
                  "flex items-center justify-center rounded-xl border px-2 py-4 text-center text-sm font-bold transition-colors",
                  active
                    ? "border-brand-blue bg-brand-blue text-white"
                    : "border-border bg-surface-card text-text-primary hover:border-brand-blue/50",
                  "disabled:cursor-not-allowed disabled:text-text-muted disabled:line-through disabled:opacity-50 disabled:hover:border-border",
                )}
              >
                {slot.window}
              </button>
            );
          })}
        </div>

        {(() => {
          const isoValue = slotIso(selectedDay, ALL_DAY_SLOT.startHour);
          const bookable = isSlotBookable(selectedDay, ALL_DAY_SLOT, now);
          const active = bookable && selectedSlot === isoValue && selectedWindow === ALL_DAY_SLOT.window;
          return (
            <button
              type="button"
              disabled={!bookable}
              title={bookable ? undefined : "The all-day window has already started"}
              onClick={() => { setSelectedSlot(isoValue); setSelectedWindow(ALL_DAY_SLOT.window); }}
              className={cn(
                "mt-3 flex w-full flex-col items-center gap-0.5 rounded-xl border px-2 py-3.5 text-center transition-colors",
                active
                  ? "border-brand-blue bg-brand-blue text-white"
                  : "border-border bg-surface-card hover:border-brand-blue/50",
                "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border",
              )}
            >
              <span className={cn("text-sm font-bold", active ? "text-white" : bookable ? "text-text-primary" : "text-text-muted line-through")}>
                All day
              </span>
              <span className={cn("text-[11px] leading-tight", active ? "text-blue-200" : "text-text-muted")}>
                8am – 8pm
              </span>
            </button>
          );
        })()}

        {!dayHasBookableSlot(selectedDay, now) && (
          <p className="mt-3 rounded-lg bg-surface px-4 py-3 text-sm text-text-secondary">
            No more arrival windows today — pick another day above.
          </p>
        )}
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
  confirmedIntentId,
  onConfirmed,
  onSlotPassed,
  ...c
}: ConfirmCommon & {
  checkout: Extract<ReadyCheckout, { mode: "preauth" }>;
  /** The intent already authorised on the card, if this checkout's is. */
  confirmedIntentId: string | null;
  onConfirmed: (intentId: string) => void;
  onSlotPassed: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const piId = intentIdFrom(checkout.clientSecret);
  // The hold is already placed on THIS intent (a retry after the booking
  // write failed, or a re-picked time). Confirming again is refused by
  // Stripe, so the card step is skipped and only the booking is written.
  const alreadyConfirmed = confirmedIntentId === piId;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!alreadyConfirmed && (!stripe || !elements)) return;
    setSubmitting(true);
    setError(null);

    if (!alreadyConfirmed && stripe && elements) {
      // Park the draft BEFORE confirming. If the issuer wants a 3-D Secure
      // challenge Stripe can't run inline, the next thing that happens is the
      // page navigating away — this component won't be here to save anything
      // later. The checkout goes with it so the return path can put the
      // customer back on the picker if their window has closed meanwhile.
      saveDraft(piId, { common: c, creditAppliedPence: checkout.creditAppliedPence, checkout });

      // Place the manual-capture hold now (captured on completion). The hold is
      // always taken — credit only reduces its amount.
      const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          payment_method_data: {
            billing_details: { name: c.customerName, email: c.customerEmail },
          },
          // Required even with `redirect: "if_required"`, which only means "don't
          // redirect unless you have to". When Stripe decides it does have to and
          // finds no return_url, it rejects the confirmation outright and the
          // customer sees a payment failure that retrying can't fix. Must be
          // absolute, and must point somewhere that renders.
          return_url: `${window.location.origin}/book/slot?${new URLSearchParams(returnParams(c))}`,
        },
        redirect: "if_required",
      });
      // Past this point we did NOT redirect — this component still holds every
      // answer, so the parked draft has no further use either way.
      clearDraft(piId);
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
      // The hold is live from here. Remember it before anything else can fail,
      // so every later attempt writes against this hold instead of confirming
      // again (refused) or reloading (a second hold).
      onConfirmed(piId);
    }

    const result = await createBookingAction(
      bookingInputFrom(c, {
        paymentMode: "preauth",
        creditAppliedPence: checkout.creditAppliedPence,
        stripePaymentIntentId: piId,
      }),
    );
    if (!result.ok) {
      setSubmitting(false);
      // Not stranded: nothing was written and the hold is still theirs. Send
      // them back to pick a time; they come back here with the card step
      // already done.
      if (result.code === "slot_passed") {
        onSlotPassed();
        return;
      }
      // The hold is already live here, so this is the same orphaned hold the
      // redirect path can produce — tell ops either way. The customer keeps
      // their filled-in form and sees the real error; pressing the button
      // again retries the write on this hold.
      void reportOrphanedHold(piId, `booking write failed: ${result.error}`);
      setError(result.error);
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

      {alreadyConfirmed ? (
        <p className="flex items-start gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm font-medium text-success">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          <span>
            Your card is already authorised for {formatPrice(checkout.chargePence)} — nothing more
            to enter. Confirm below to finish your booking.
          </span>
        </p>
      ) : (
        <div>
          <p className="mb-3 text-sm font-semibold text-text-primary">Payment details</p>
          <div className="rounded-xl border border-border p-4">
            <PaymentElement />
          </div>
        </div>
      )}

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-danger">{error}</p>
      )}

      <Button
        type="submit"
        variant="primary"
        size="lg"
        fullWidth
        disabled={(!alreadyConfirmed && !stripe) || submitting}
        iconLeft={submitting ? Loader2 : Lock}
      >
        {submitting
          ? "Processing…"
          : alreadyConfirmed
            ? "Confirm booking"
            : `Pre-authorise ${formatPrice(checkout.chargePence)}`}
      </Button>
      <p className="text-center text-[11px] text-text-muted">
        No money is taken now. Your card is pre-authorised only — charged when the job is complete.
        {" "}Free to cancel more than 24 hours before your slot — see our{" "}
        <Link
          href="/cancellation-policy"
          target="_blank"
          className="font-semibold text-brand-blue hover:underline"
        >
          cancellation policy
        </Link>
        .
      </p>
    </form>
  );
}

// --- Free checkout (account credit covers the whole total) ------------------

function FreeCheckoutForm({
  checkout,
  onSlotPassed,
  ...c
}: ConfirmCommon & {
  checkout: Extract<ReadyCheckout, { mode: "free" }>;
  onSlotPassed: () => void;
}) {
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
      setSubmitting(false);
      // No card involved — just back to the picker for another time.
      if (result.code === "slot_passed") {
        onSlotPassed();
        return;
      }
      setError(result.error);
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
