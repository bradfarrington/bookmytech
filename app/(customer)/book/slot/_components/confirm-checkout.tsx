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
import { Loader2, Lock, ShieldAlert } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { cn, formatPrice, vehicleLabel } from "@/lib/utils";
import { prepareCheckout, createBookingAction } from "@/app/actions/create-booking";
import type { CreateBookingInput, PrepareCheckoutResult } from "@/app/actions/create-booking";
import { groupRepairLines, type RepairLineLite } from "@/lib/bookings/repair-lines";
import { reportOrphanedHold } from "@/app/actions/orphaned-hold";
import { ensureCustomerAccount, requestPasswordReset } from "@/app/actions/booking-account";
import { formatBookingWhen } from "@/lib/slots";
import {
  parkingLabel,
  useAddressDraft,
  writeAddressDraft,
  PARKING_OPTIONS,
  type ParkingType,
} from "@/lib/bookings/address-draft";
import type { BookingBaseParams, BookingTimeParams } from "@/lib/bookings/step-params";
import { track, FUNNEL_EVENTS } from "@/lib/analytics/track";
import {
  EMPTY_TIME,
  TimePicker,
  isTimeOpen,
  timeValueFrom,
  type TimeValue,
} from "../../_components/time-picker";

// Confirm: the last step of the booking funnel (Task 47). The time and address
// were chosen on the two steps before and are shown here as a summary; this
// step handles the account, the discount code and the payment.
//
// Everything below the summary is the checkout that used to live in the slot
// picker, moved without changing what it does: the pre-auth hold is placed,
// then the booking row is written, and the 3-D Secure redirect, double-hold,
// stranded-hold and discount-code safeguards are exactly as they were.

const MIN_PASSWORD_LENGTH = 8;

const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null;

const inputClass =
  "h-12 rounded-xl border border-border bg-white px-3.5 text-[15px] text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20";

const SUPPORT_EMAIL = "support@bookmytech.co.uk";

// Narrow the prepareCheckout result to its success shapes once we've handled !ok.
type ReadyCheckout = Extract<PrepareCheckoutResult, { ok: true }>;

// --- Surviving a 3-D Secure redirect ---------------------------------------
//
// `redirect: "if_required"` does not mean "no redirect". When the issuer won't
// run its challenge in Stripe's iframe, Stripe navigates the whole page away and
// later returns the customer to `return_url`, to a FRESHLY MOUNTED checkout.
// Every answer they gave (time, address, name, email) and the `checkout` result
// itself are component state, and are gone. The hold, meanwhile, is live on
// their card.
//
// So the draft is parked before confirming and replayed on the way back.
// sessionStorage, not the URL: it holds the customer's address. Same tab, dies
// with it: the right lifetime for a half-finished checkout.
//
// Keyed by PaymentIntent id so a customer who abandons one attempt and starts
// another can't have the first attempt's answers replayed against the second
// attempt's hold.

const DRAFT_PREFIX = "bmt.checkout-draft.";

interface CheckoutDraft {
  common: ConfirmCommon;
  /** What the hold was reduced by: createBooking redeems against it. */
  creditAppliedPence: number;
  /**
   * The prepared checkout itself, so a customer whose window closed while
   * they were at their bank can pick another time and finish on the hold they
   * already confirmed. Absent on drafts parked by older builds.
   */
  checkout?: ReadyCheckout;
}

/** Shown when a discount code ran out between the hold and the booking. */
const PROMO_GONE_NOTICE =
  "That discount code was used up while you were checking out, so we couldn't apply it. Your card wasn't charged and we've released the hold. Please book again.";

/** Shown when the customer has to pick another time. */
const SLOT_PASSED_NOTICE =
  "That arrival window has passed while you were checking out. Pick another time below. Your card is already authorised, so you won't need to enter it again.";

/** `pi_3abc..._secret_xyz` → `pi_3abc...` */
function intentIdFrom(clientSecret: string): string {
  return clientSecret.split("_secret_")[0];
}

function saveDraft(intentId: string, draft: CheckoutDraft): void {
  try {
    sessionStorage.setItem(DRAFT_PREFIX + intentId, JSON.stringify(draft));
  } catch {
    // Private mode, or storage full. The common path never redirects and so
    // never reads this back: failing to save must not block the payment.
  }
}

function readDraft(intentId: string): CheckoutDraft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_PREFIX + intentId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CheckoutDraft;
    // Drafts parked by pre-Task-24 builds carry one `repairNodeId`. Upgrade
    // them, so a customer who was at their bank while this deployed still
    // completes their booking instead of being told their hold is stranded.
    const legacy = parsed?.common as
      | (ConfirmCommon & { repairNodeId?: string; repairName?: string })
      | undefined;
    if (
      legacy &&
      !Array.isArray(legacy.repairNodeIds) &&
      typeof legacy.repairNodeId === "string" &&
      legacy.repairNodeId
    ) {
      legacy.repairNodeIds = [legacy.repairNodeId];
      legacy.repairLines = [
        {
          nodeId: legacy.repairNodeId,
          description: legacy.repairName ?? "Vehicle repair",
          chargedHours: 0,
        },
      ];
    }
    // A draft missing any of these can't produce a bookable row. A follow-on
    // quote (Task 34) carries no repair ids: the quote is the price.
    if (
      !parsed?.common?.selectedSlot ||
      !parsed.common.addressLine1 ||
      !Array.isArray(parsed.common.repairNodeIds) ||
      (parsed.common.repairNodeIds.length === 0 && !parsed.common.quoteId)
    ) {
      return null;
    }
    if (!Array.isArray(parsed.common.repairLines)) parsed.common.repairLines = [];
    // Drafts parked before Task 28 carry no candidate days: a single day.
    if (!Array.isArray(parsed.common.candidateDays)) parsed.common.candidateDays = [];
    return parsed;
  } catch {
    return null;
  }
}

function clearDraft(intentId: string): void {
  try {
    sessionStorage.removeItem(DRAFT_PREFIX + intentId);
  } catch {
    // Nothing to do: it dies with the tab regardless.
  }
}

type ResumeState =
  | { phase: "idle" }
  /** Back from the challenge, finishing the booking. Do not close the page. */
  | { phase: "completing" }
  /** The hold is live and we can't turn it into a booking. Ops has been told. */
  | { phase: "stranded"; detail?: string };

/** Statuses that mean the customer's money IS committed. */
const MONEY_HELD = new Set(["requires_capture", "succeeded"]);

/** Statuses that mean nothing was taken: safe to put them back on the form. */
const NOTHING_HELD = new Set([
  "requires_payment_method",
  "requires_confirmation",
  "requires_action",
  "canceled",
]);

/**
 * Query for the return URL. It must land on a page that RENDERS: /book/slot
 * bounces to /book without `reg` and `repairs` (or `quote`). The time is
 * carried so a reload after the return still has it. The address is
 * deliberately absent: that's what the draft is for.
 */
function returnParams(c: ConfirmCommon): Record<string, string> {
  const params: Record<string, string> = c.quoteId
    ? { quote: c.quoteId }
    : { reg: c.reg, repairs: c.repairNodeIds.join(",") };
  if (!c.quoteId) {
    if (c.make) params.make = c.make;
    if (c.model) params.model = c.model;
    if (c.preferredMechanicId) params.pref = c.preferredMechanicId;
  }
  if (c.selectedSlot) params.slot = c.selectedSlot;
  if (c.selectedWindow) params.window = c.selectedWindow;
  if (c.candidateDays.length >= 2) params.days = c.candidateDays.join(",");
  return params;
}

/** One line inside the price that isn't labour: a part, or engine oil (Task 43). */
export interface PriceExtraLine {
  key: string;
  label: string;
  pence: number;
}

interface ConfirmCheckoutProps {
  base: BookingBaseParams;
  /** `contextKeyFor(base)`: which saved address belongs to this booking. */
  contextKey: string;
  /** The time off the URL, chosen on the Time step. Null only on a 3-D Secure return. */
  initialTime: BookingTimeParams | null;
  /** Links back to the earlier steps for "Change". */
  timeHref: string;
  addressHref: string;
  /** The price step, or null for a follow-on quote (nothing to change there). */
  priceHref: string | null;
  reg: string;
  make: string;
  model?: string;
  /** Catalogue item ids, in the customer's order. Empty for a follow-on quote. */
  repairNodeIds: string[];
  /** The same jobs with their names and charged hours, for the summary (Task 24). */
  repairLines: RepairLineLite[];
  /** Parts and engine oil inside the price (Task 43), listed in the summary. */
  priceExtras?: PriceExtraLine[];
  pricePence: number;
  preferredMechanicId?: string;
  /** A follow-on quote (Task 34): the server prices from it instead of the catalogue. */
  quoteId?: string;
  /** Signed-in customer's spendable account credit (0 for guests). */
  availableCreditPence?: number;
  /** Whether the visitor is signed in AS A CUSTOMER: hides the account block. */
  signedIn?: boolean;
  /** Set when the session belongs to an admin or mechanic (see the page). */
  wrongRole?: string;
  /** Signed-in customer's details, used in place of the account block. */
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  /**
   * `payment_intent_client_secret` off the URL, present only when Stripe has
   * just returned the customer from a 3-D Secure challenge. Threaded down from
   * the page rather than read from `window` so the first render agrees with the
   * server's: this decides whether the checkout renders the form at all.
   */
  returnedIntentSecret?: string;
}

export function ConfirmCheckout({
  contextKey,
  initialTime,
  timeHref,
  addressHref,
  priceHref,
  reg,
  make,
  model,
  repairNodeIds,
  repairLines,
  priceExtras,
  pricePence,
  preferredMechanicId,
  quoteId,
  availableCreditPence = 0,
  signedIn = false,
  wrongRole,
  customerName = "",
  customerEmail = "",
  customerPhone = "",
  returnedIntentSecret,
}: ConfirmCheckoutProps) {
  const router = useRouter();

  // Discount code (Task 35): what they've typed, and what the server accepted.
  const [promoInput, setPromoInput] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<string | null>(null);
  const [promoOpen, setPromoOpen] = useState(false);

  // "Now", re-read every minute so a window that closes while the customer
  // sits on the page is re-picked rather than sent to the server. UK time.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // The time chosen on the Time step. State, not just a prop, because a window
  // can close mid-checkout and be re-picked here without losing the hold.
  const [time, setTime] = useState<TimeValue>(() => timeValueFrom(initialTime));
  const selectedSlot = time.slot;
  const selectedWindow = time.window;
  const selectedSlotOpen = isTimeOpen(time, now);

  // The address from the Address step (sessionStorage). `undefined` until the
  // browser has been read; `null` when there is none for this booking.
  const savedAddress = useAddressDraft(contextKey);
  const address = savedAddress ?? null;

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
  // customer continues: that, not the URL estimate, is authoritative.
  const [checkout, setCheckout] = useState<ReadyCheckout | null>(null);
  const [stripeError, setStripeError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // A hold the customer has ALREADY confirmed on their card. Set the moment
  // confirmPayment succeeds and kept if the booking write then fails: Stripe
  // refuses a second confirm on an authorised intent, and a reload would
  // prepare a fresh intent and place a SECOND hold. With this remembered, a
  // retry (or a re-picked time after the window closed) goes straight to the
  // booking write against the hold they already have.
  const [confirmedIntentId, setConfirmedIntentId] = useState<string | null>(null);
  const [slotNotice, setSlotNotice] = useState<string | null>(null);

  // The window closed under them (a 3-D Secure trip that outlasted the lead
  // time, or a long think). Nothing was written and the hold is untouched:
  // drop the time so the picker appears on this page, keep everything else.
  function handleSlotPassed() {
    setTime(EMPTY_TIME);
    setSlotNotice(SLOT_PASSED_NOTICE);
  }

  // The discount code ran out between the hold and the booking (Task 35).
  // Nothing was written, but the hold is live for the discounted amount and
  // can't be reused for the full one: ops releases it (reportOrphanedHold
  // ran at the call site) and the customer starts the payment again without
  // the code.
  function handlePromoUnavailable() {
    setAppliedPromo(null);
    setPromoInput("");
    setCheckout(null);
    setConfirmedIntentId(null);
    setSlotNotice(PROMO_GONE_NOTICE);
  }

  // Where we are in the return-from-redirect path (see the draft helpers above).
  // Seeded from the prop, not from an effect: a customer coming back from their
  // bank must never be shown the empty form, not even for a frame.
  const [resume, setResume] = useState<ResumeState>(
    returnedIntentSecret ? { phase: "completing" } : { phase: "idle" },
  );
  const resumeStarted = useRef(false);

  // No saved address for this booking (a direct link, or storage blocked):
  // send the customer back a step. Not on a 3-D Secure return, which restores
  // the address from its own draft.
  useEffect(() => {
    if (savedAddress === null && !returnedIntentSecret && !checkout) {
      router.replace(addressHref);
    }
  }, [savedAddress, returnedIntentSecret, checkout, router, addressHref]);

  const hasAccount = signedIn || accountReady;
  const accountFilled =
    name.trim().length > 1 &&
    email.trim().includes("@") &&
    password.length >= MIN_PASSWORD_LENGTH;

  const addressReady = !!address && address.addressLine1.trim().length > 3 && address.postcode.trim().length >= 5;

  const canProceed = !wrongRole && selectedSlotOpen && addressReady && (hasAccount || accountFilled);

  // Put a parked draft back, for when the customer failed the challenge and
  // has to try again (nothing was taken), or when their window closed.
  function restoreDraft(c: ConfirmCommon, opts: { keepSlot?: boolean } = {}) {
    if (opts.keepSlot !== false) {
      setTime({
        slot: c.selectedSlot || null,
        window: c.selectedWindow || null,
        days: c.candidateDays.length >= 2 ? [...c.candidateDays].sort() : [],
        flexible: c.candidateDays.length >= 2,
      });
    } else {
      setTime(EMPTY_TIME);
    }
    writeAddressDraft({
      context: contextKey,
      addressLine1: c.addressLine1,
      postcode: c.postcode,
      parkingType: PARKING_OPTIONS.some((o) => o.value === c.parkingType)
        ? (c.parkingType as ParkingType)
        : "driveway",
      instructions: c.instructions,
    });
    // The account block is hidden once they're signed in (which they are by
    // now: the account is created before the pre-auth), but a guest whose
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
    // Runs once: React StrictMode mounts effects twice in dev, and writing the
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

      // NOT `succeeded`: a confirmed manual-capture hold sits at
      // `requires_capture`, and nothing is captured until the job is done.
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
          // good and stays theirs: put them back with everything else
          // restored, and finish on this intent without confirming again.
          // (Needs the checkout parked in the draft; a draft from an older
          // build without it is treated as stranded.)
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

  // Clear the staff session in the browser and re-render the page as a guest:
  // a server sign-out would redirect away and lose the funnel.
  function handleSignOut() {
    startSignOutTransition(async () => {
      await createClient().auth.signOut();
      router.refresh();
    });
  }

  function handleProceedToPayment() {
    if (!canProceed || !address) return;
    track(FUNNEL_EVENTS.slotPicked, {
      repairNodeId: repairNodeIds[0],
      repairNodeIds,
      repairCount: repairNodeIds.length,
      slot: selectedSlot,
      candidateDayCount: time.flexible ? time.days.length : 0,
    });
    setStripeError(null);
    setAccountError(null);
    startTransition(async () => {
      // Account first: nothing is authorised until this succeeds.
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

      const result = await prepareCheckout({
        postcode: address.postcode,
        vehicleReg: reg,
        repairNodeId: repairNodeIds[0],
        repairNodeIds,
        quoteId,
        promoCode: promoInput.trim() || undefined,
      });
      if (!result.ok) {
        setStripeError(result.error);
        return;
      }
      setAppliedPromo(result.promoCode);
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

  const common: ConfirmCommon = {
    selectedSlot: selectedSlot ?? "",
    selectedWindow: selectedWindow ?? "",
    candidateDays: time.flexible ? time.days : [],
    addressLine1: address?.addressLine1 ?? "",
    postcode: address?.postcode ?? "",
    parkingType: address?.parkingType ?? "driveway",
    instructions: address?.instructions ?? "",
    reg,
    make,
    model,
    repairNodeIds,
    repairLines,
    priceExtras,
    preferredMechanicId,
    quoteId,
    promoCode: appliedPromo ?? undefined,
    // Identity is settled before this step: the checkout no longer asks.
    customerName: signedIn ? customerName : name.trim(),
    customerEmail: signedIn ? customerEmail : email.trim(),
    customerPhone: signedIn ? customerPhone : phone.trim(),
  };

  // Back from a 3-D Secure challenge: finishing the booking they've paid for.
  if (resume.phase === "completing") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-[20px] border border-border bg-white p-8 text-center shadow-card">
        <Loader2 size={28} className="animate-spin text-brand-blue" />
        <p className="text-base font-semibold text-text-primary">Confirming your booking…</p>
        <p className="text-sm text-text-secondary">
          Your bank has approved the payment. Please don&apos;t close this page. We&apos;re
          finishing your booking now.
        </p>
      </div>
    );
  }

  // The hold is live and we couldn't write the booking. Say so plainly: they
  // have a pending amount on their card and no job in the system.
  if (resume.phase === "stranded") {
    return (
      <div className="flex flex-col gap-3 rounded-[20px] border border-amber-200 bg-amber-50 p-6">
        <div className="flex items-start gap-2.5">
          <ShieldAlert size={20} className="mt-0.5 shrink-0 text-amber-700" />
          <div>
            <p className="text-base font-semibold text-amber-900">
              We&apos;ve held the funds but couldn&apos;t finish your booking
            </p>
            <p className="mt-1 text-sm text-amber-800">
              Your bank approved the payment, but something went wrong saving your job.
              Please don&apos;t book again. Get in touch and we&apos;ll sort it out and
              release the hold if you&apos;d rather start over. Nothing has actually been
              charged, and the hold releases itself within 7 days.
            </p>
            {resume.detail && (
              <p className="mt-2 text-[13px] text-amber-800">Details: {resume.detail}</p>
            )}
            <p className="mt-3 text-sm text-amber-900">
              Email{" "}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold underline">
                {SUPPORT_EMAIL}
              </a>
              . We already know about this one and are looking at it.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (checkout && selectedSlot) {
    // Fully credit-covered: no card needed.
    if (checkout.mode === "free") {
      return (
        <FreeCheckoutForm
          {...common}
          checkout={checkout}
          onSlotPassed={handleSlotPassed}
          onPromoUnavailable={handlePromoUnavailable}
        />
      );
    }
    // Pre-auth: place the manual-capture hold via Stripe Elements. A customer
    // with a saved card (Task 53) gets a CustomerSession, so the card form lists
    // those cards. Absent on older parked drafts and for everyone else.
    return (
      <Elements
        stripe={stripePromise}
        options={{
          clientSecret: checkout.clientSecret,
          appearance: { theme: "stripe" },
          ...(checkout.customerSessionClientSecret
            ? { customerSessionClientSecret: checkout.customerSessionClientSecret }
            : {}),
        }}
      >
        <CheckoutForm
          {...common}
          checkout={checkout}
          confirmedIntentId={confirmedIntentId}
          onConfirmed={setConfirmedIntentId}
          onSlotPassed={handleSlotPassed}
          onPromoUnavailable={handlePromoUnavailable}
        />
      </Elements>
    );
  }

  const whenLabel =
    selectedSlot && selectedSlotOpen
      ? formatBookingWhen({
          scheduled_at: selectedSlot,
          slot_window: selectedWindow,
          candidate_days: time.flexible ? time.days : [],
        })
      : null;

  return (
    <div className="flex flex-col gap-6">
      {slotNotice && <Alert tone="warning">{slotNotice}</Alert>}

      {/* The booking so far, with a way back to each step. */}
      <section aria-labelledby="summary-heading">
        <h2 id="summary-heading" className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.12em] text-text-muted">
          Your booking
        </h2>
        <dl className="divide-y divide-border-subtle overflow-hidden rounded-[20px] border border-border bg-white shadow-card">
          <SummaryRow label="Job" changeHref={priceHref}>
            <JobSummary lines={repairLines} />
          </SummaryRow>
          <SummaryRow label="Vehicle">{vehicleLabel(reg, make, model)}</SummaryRow>
          <SummaryRow label="When" changeHref={selectedSlotOpen ? timeHref : null}>
            {/* Word joiners keep "8am–10am" from breaking at the dash on phones. */}
            {whenLabel ? (
              whenLabel.replace(/–/g, "⁠–⁠")
            ) : (
              <span className="text-amber-700">Pick a new time below</span>
            )}
          </SummaryRow>
          <SummaryRow label="Where" changeHref={addressHref}>
            {address ? (
              <>
                {address.addressLine1}, {address.postcode}
                <span className="block text-[13px] font-normal text-text-muted">
                  Parking: {parkingLabel(address.parkingType)}
                </span>
              </>
            ) : savedAddress === undefined ? (
              <span className="text-text-muted">Loading…</span>
            ) : (
              <Link href={addressHref} className="text-brand-blue hover:underline">
                Add your address
              </Link>
            )}
          </SummaryRow>
        </dl>
      </section>

      {/* A window that closed before payment: re-pick it here, keeping any hold. */}
      {!selectedSlotOpen && (
        <div className="rounded-[20px] border border-amber-200 bg-white p-5 shadow-card sm:p-6">
          <p className="mb-4 font-display text-lg font-extrabold text-text-primary">Pick a new time</p>
          <TimePicker value={time} onChange={setTime} now={now} postcode={address?.postcode} />
        </div>
      )}

      {/* Account: created before payment so the booking lands on a dashboard */}
      {wrongRole ? (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-2.5">
            <ShieldAlert size={18} className="mt-0.5 shrink-0 text-amber-700" />
            <div>
              <p className="text-sm font-semibold text-amber-900">
                You&apos;re signed in as {wrongRole === "mechanic" ? "a mechanic" : "an admin"}
              </p>
              <p className="mt-0.5 text-[13px] text-amber-800">
                Staff accounts can&apos;t book: the job wouldn&apos;t show on a customer
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
        <p className="rounded-xl bg-white px-4 py-3 text-sm text-text-secondary ring-1 ring-inset ring-border">
          Booking as{" "}
          <span className="font-semibold text-text-primary">{customerEmail}</span>
        </p>
      ) : (
        <div className="flex flex-col gap-3 rounded-[20px] border border-border bg-white p-5 shadow-card sm:p-6">
          <div>
            <p className="font-display text-lg font-extrabold text-text-primary">
              {accountMode === "signin" ? "Sign in to continue" : "Your details"}
            </p>
            <p className="mt-0.5 text-[13px] text-text-muted">
              {accountMode === "signin"
                ? "You've booked with us before. Enter your password."
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
              placeholder="Mobile number (optional, for text updates)"
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
            <Alert tone="info">
              We&apos;ve emailed you a link to set a new password. Open it, choose a password,
              then come back and finish your booking.
            </Alert>
          )}

          {accountError && <Alert tone="error">{accountError}</Alert>}
        </div>
      )}

      {accountReady && !signedIn && <Alert tone="success">Your account is ready.</Alert>}

      {availableCreditPence > 0 && (
        <Alert tone="success">
          You have {formatPrice(availableCreditPence)} in credit. It&apos;ll be applied at the next step.
        </Alert>
      )}

      {/* Discount code (Task 35). Applying re-prepares the checkout, so the
          server is the only thing that ever decides what a code is worth. */}
      {appliedPromo ? (
        <Alert tone="success">Code {appliedPromo} applied. The saving shows at the next step.</Alert>
      ) : promoOpen ? (
        <div className="flex gap-2">
          <input
            value={promoInput}
            onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
            placeholder="Discount code"
            aria-label="Discount code"
            autoCapitalize="characters"
            className={cn(inputClass, "flex-1 font-mono uppercase")}
          />
          <Button
            variant="secondary"
            disabled={!canProceed || pending || !promoInput.trim()}
            onClick={handleProceedToPayment}
          >
            Apply
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setPromoOpen(true)}
          className="self-start text-sm font-semibold text-brand-blue hover:underline"
        >
          Have a discount code?
        </button>
      )}

      {stripeError && <Alert tone="error">{stripeError}</Alert>}

      <div className="sticky bottom-4 z-10 rounded-2xl border border-border bg-white p-4 shadow-float">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm text-text-secondary">Estimated total</span>
          <span className="font-display text-2xl font-extrabold text-text-primary">{formatPrice(pricePence)}</span>
        </div>
        <Button
          variant="primary"
          size="lg"
          fullWidth
          disabled={!canProceed || pending}
          onClick={handleProceedToPayment}
          iconLeft={pending ? Loader2 : Lock}
          className="font-bold"
        >
          {pending ? "Setting up…" : "Continue to payment"}
        </Button>
        <p className="mt-2 text-center text-[12px] text-text-muted">
          Your card is pre-authorised, not charged, until the job is complete.
        </p>
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  changeHref,
  children,
}: {
  label: string;
  changeHref?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-4 px-4 py-3.5 sm:px-5">
      <dt className="w-16 shrink-0 pt-0.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-text-muted">
        {label}
      </dt>
      <dd className="min-w-0 flex-1 text-[15px] font-semibold text-text-primary">{children}</dd>
      {changeHref && (
        <Link
          href={changeHref}
          className="shrink-0 pt-0.5 text-[13px] font-semibold text-brand-blue hover:underline"
        >
          Change
        </Link>
      )}
    </div>
  );
}

function JobSummary({ lines }: { lines: RepairLineLite[] }) {
  if (lines.length <= 1) return <>{lines[0]?.description ?? "Vehicle repair"}</>;
  const groups = groupRepairLines(lines);
  return (
    <ul className="flex flex-col gap-0.5">
      {groups.map((group) => (
        <li key={group.key}>
          {group.label ?? group.lines[0].description}
          {group.label && (
            <span className="font-normal text-text-muted">
              {" "}
              ({group.lines.map((l) => l.description).join(", ")})
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

// --- Shared confirm-step props ---------------------------------------------

interface ConfirmCommon {
  selectedSlot: string;
  selectedWindow: string;
  /** Several all-day dates offered (Task 28): empty for a single-day booking. */
  candidateDays: string[];
  addressLine1: string;
  postcode: string;
  parkingType: string;
  instructions: string;
  reg: string;
  make: string;
  model?: string;
  repairNodeIds: string[];
  repairLines: RepairLineLite[];
  /** Parts and engine oil inside the price (Task 43). Absent on drafts parked before it. */
  priceExtras?: PriceExtraLine[];
  preferredMechanicId?: string;
  /** A follow-on quote (Task 34). */
  quoteId?: string;
  /** A discount code the customer applied (Task 35): re-validated server-side. */
  promoCode?: string;
  /** Resolved before this step: the customer always has an account by now. */
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
    repairNodeId: c.repairNodeIds[0],
    repairNodeIds: c.repairNodeIds,
    scheduledAt: c.selectedSlot,
    slotWindow: c.selectedWindow || undefined,
    candidateDays: c.candidateDays.length >= 2 ? c.candidateDays : undefined,
    customerEmail: c.customerEmail,
    customerName: c.customerName,
    customerPhone: c.customerPhone || undefined,
    addressLine1: c.addressLine1,
    postcode: c.postcode.trim().toUpperCase(),
    parkingType: c.parkingType,
    specialInstructions: c.instructions || undefined,
    preferredMechanicId: c.preferredMechanicId || undefined,
    quoteId: c.quoteId || undefined,
    promoCode: c.promoCode || undefined,
    ...extra,
  };
}

function hoursLabel(h: number): string {
  return `${Number(h.toFixed(2))} h`;
}

// Price breakdown shown on every confirm step. Several jobs list each one
// above the total: the visit is priced as a whole (overlapping work isn't
// charged twice), so the lines carry time, not money. Parts and engine oil
// (Task 43) are listed with their prices.
function PriceSummary({
  totalPence,
  creditAppliedPence,
  chargePence,
  discountPence = 0,
  promoCode,
  lines,
  extras,
}: {
  totalPence: number;
  creditAppliedPence: number;
  chargePence: number;
  /** The promo-code saving (Task 35). */
  discountPence?: number;
  promoCode?: string | null;
  lines?: RepairLineLite[];
  /** Parts and engine oil inside the total (Task 43). */
  extras?: PriceExtraLine[];
}) {
  const multi = (lines?.length ?? 0) > 1;
  const hasExtras = (extras?.length ?? 0) > 0;
  return (
    <div className="rounded-[20px] border border-blue-100 bg-blue-50/60 p-5 text-sm">
      {multi &&
        groupRepairLines(lines!).map((group) => (
          <div key={group.key} className="mb-1">
            {group.label && <p className="font-medium text-text-secondary">{group.label}</p>}
            {group.lines.map((line) => (
              <div
                key={line.nodeId}
                className={cn(
                  "flex items-start justify-between gap-3 text-text-muted",
                  group.label && "pl-3",
                )}
              >
                <span className="min-w-0">{line.description}</span>
                <span className="shrink-0 text-xs">
                  {line.chargedHours === 0 ? "no extra time" : hoursLabel(line.chargedHours)}
                </span>
              </div>
            ))}
          </div>
        ))}
      {hasExtras && (
        <div className={cn("flex flex-col gap-0.5", multi && "mt-1")}>
          {extras!.map((line) => (
            <div key={line.key} className="flex items-start justify-between gap-3 text-text-muted">
              <span className="min-w-0">{line.label}</span>
              <span className="shrink-0 text-xs">{formatPrice(line.pence)}</span>
            </div>
          ))}
        </div>
      )}
      <div
        className={cn(
          "flex items-center justify-between text-text-secondary",
          (multi || hasExtras) && "mt-1 border-t border-blue-100 pt-2",
        )}
      >
        <span>{multi ? "Jobs total" : "Repair total"}</span>
        <span>{formatPrice(totalPence)}</span>
      </div>
      {discountPence > 0 && (
        <div className="mt-1 flex items-center justify-between font-medium text-success">
          <span>Discount{promoCode ? ` (${promoCode})` : ""}</span>
          <span>−{formatPrice(discountPence)}</span>
        </div>
      )}
      {creditAppliedPence > 0 && (
        <div className="mt-1 flex items-center justify-between font-medium text-success">
          <span>Account credit</span>
          <span>−{formatPrice(creditAppliedPence)}</span>
        </div>
      )}
      <div className="mt-3 flex items-baseline justify-between border-t border-blue-100 pt-3 text-text-primary">
        <span className="text-sm font-bold">To pay</span>
        <span className="font-display text-3xl font-extrabold tracking-[-0.02em] text-brand-blue-dark">
          {formatPrice(chargePence)}
        </span>
      </div>
    </div>
  );
}

// Job + account recap at the top of the payment step.
function BookingRecap({ c }: { c: ConfirmCommon }) {
  return (
    <div className="rounded-[20px] border border-border bg-white p-5 text-sm shadow-card">
      <p className="font-semibold text-text-primary">
        <JobSummary lines={c.repairLines} />
      </p>
      <p className="mt-1 text-text-secondary">
        {vehicleLabel(c.reg, c.make, c.model)} ·{" "}
        {formatBookingWhen({
          scheduled_at: c.selectedSlot,
          slot_window: c.selectedWindow,
          candidate_days: c.candidateDays,
        })}
      </p>
      <p className="text-text-secondary">
        {c.addressLine1}, {c.postcode}
      </p>
      <p className="mt-2 border-t border-border-subtle pt-2 text-text-muted">
        Booking as <span className="font-medium text-text-secondary">{c.customerEmail}</span>
      </p>
    </div>
  );
}

function PaymentSmallPrint() {
  return (
    <p className="text-center text-[12px] leading-[1.5] text-text-muted">
      No money is taken now. Your card is pre-authorised only, and charged when the job is
      complete. Cancellation fees can apply, so see our{" "}
      <Link
        href="/cancellation-policy"
        target="_blank"
        className="font-semibold text-brand-blue hover:underline"
      >
        cancellation policy
      </Link>
      . By booking you agree to our{" "}
      <Link href="/terms" target="_blank" className="font-semibold text-brand-blue hover:underline">
        Terms &amp; Conditions
      </Link>
      .
    </p>
  );
}

// --- Stripe checkout form: pre-auth hold (always taken at booking) ----------

function CheckoutForm({
  checkout,
  confirmedIntentId,
  onConfirmed,
  onSlotPassed,
  onPromoUnavailable,
  ...c
}: ConfirmCommon & {
  checkout: Extract<ReadyCheckout, { mode: "preauth" }>;
  /** The intent already authorised on the card, if this checkout's is. */
  confirmedIntentId: string | null;
  onConfirmed: (intentId: string) => void;
  onSlotPassed: () => void;
  onPromoUnavailable: () => void;
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
      // page navigating away: this component won't be here to save anything
      // later. The checkout goes with it so the return path can put the
      // customer back on the picker if their window has closed meanwhile.
      saveDraft(piId, { common: c, creditAppliedPence: checkout.creditAppliedPence, checkout });

      // Place the manual-capture hold now (captured on completion). The hold is
      // always taken: credit only reduces its amount.
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
      // Past this point we did NOT redirect: this component still holds every
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
      if (result.code === "promo_unavailable") {
        void reportOrphanedHold(piId, `discount code no longer available: ${result.error}`);
        onPromoUnavailable();
        return;
      }
      // The hold is already live here, so this is the same orphaned hold the
      // redirect path can produce: tell ops either way. The customer keeps
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
        discountPence={checkout.discountPence}
        promoCode={checkout.promoCode}
        chargePence={checkout.chargePence}
        lines={c.repairLines}
        extras={c.priceExtras}
      />

      {alreadyConfirmed ? (
        <Alert tone="success">
          Your card is already authorised for {formatPrice(checkout.chargePence)}. Nothing more to
          enter. Confirm below to finish your booking.
        </Alert>
      ) : (
        <div className="rounded-[20px] border border-border bg-white p-5 shadow-card">
          <p className="mb-3 font-display text-lg font-extrabold text-text-primary">Payment details</p>
          <PaymentElement />
        </div>
      )}

      {error && <Alert tone="error">{error}</Alert>}

      <Button
        type="submit"
        variant="primary"
        size="lg"
        fullWidth
        disabled={(!alreadyConfirmed && !stripe) || submitting}
        iconLeft={submitting ? Loader2 : Lock}
        className="font-bold"
      >
        {submitting
          ? "Processing…"
          : alreadyConfirmed
            ? "Confirm booking"
            : `Pre-authorise ${formatPrice(checkout.chargePence)}`}
      </Button>
      <PaymentSmallPrint />
    </form>
  );
}

// --- Free checkout (account credit covers the whole total) ------------------

function FreeCheckoutForm({
  checkout,
  onSlotPassed,
  onPromoUnavailable,
  ...c
}: ConfirmCommon & {
  checkout: Extract<ReadyCheckout, { mode: "free" }>;
  onSlotPassed: () => void;
  onPromoUnavailable: () => void;
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
      // No card involved: just back to the picker for another time.
      if (result.code === "slot_passed") {
        onSlotPassed();
        return;
      }
      if (result.code === "promo_unavailable") {
        onPromoUnavailable();
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
        discountPence={checkout.discountPence}
        promoCode={checkout.promoCode}
        chargePence={0}
        lines={c.repairLines}
        extras={c.priceExtras}
      />

      <Alert tone="success">
        Your account credit covers this booking in full. There&apos;s nothing to pay.
      </Alert>

      {error && <Alert tone="error">{error}</Alert>}

      <Button
        type="submit"
        variant="primary"
        size="lg"
        fullWidth
        disabled={submitting}
        iconLeft={submitting ? Loader2 : Lock}
        className="font-bold"
      >
        {submitting ? "Processing…" : "Confirm booking"}
      </Button>
    </form>
  );
}
