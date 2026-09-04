import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { vehicleLabel } from "@/lib/utils";
import { ProgressStepper } from "@/components/customer/progress-stepper";
import { quoteRepairs } from "@/lib/haynespro/repair-booking";
import { parseRepairIds, repairsQuery } from "@/lib/bookings/repair-ids";
import { SlotPicker } from "./_components/slot-picker";

interface SlotPageProps {
  searchParams: Promise<{
    reg?: string;
    /** The jobs being booked — see lib/bookings/repair-ids.ts (`repair` = legacy single). */
    repairs?: string;
    repair?: string;
    make?: string;
    model?: string;
    postcode?: string;
    pref?: string;
    /** Set by Stripe when it returns a customer from a 3-D Secure challenge —
     *  the picker completes the booking from it. See slot-picker.tsx. */
    payment_intent_client_secret?: string;
  }>;
}

export default async function SlotPage({ searchParams }: SlotPageProps) {
  const params = await searchParams;
  const reg = params.reg ?? "";
  const ids = parseRepairIds(params);

  if (!reg.trim() || ids.length === 0) {
    redirect("/book");
  }

  // Re-quote server-side (never trust the URL) — the same (reg, nodes) inputs
  // price identically at checkout and booking create.
  const quote = await quoteRepairs(reg, ids, createAdminClient());
  if (!quote) {
    redirect(`/book/repairs?reg=${encodeURIComponent(reg)}`);
  }

  const multi = quote.items.length > 1;
  const pricePence = quote.breakdown.totalPence;

  // Signed-in customers skip the account block on the picker; guests fill it in
  // and get an account created before the pre-auth is taken. Surface any account
  // credit too, so the picker can hint it before checkout (the actual amount
  // applied is decided server-side).
  //
  // Only a role='customer' session counts as "booking as this account". An admin
  // or mechanic session is treated as `wrongRole`: proxy would bounce them
  // off /dashboard anyway, so a booking made under their id would be invisible
  // to them. The picker asks them to sign out instead of silently booking as
  // themselves — which is also what you want when testing the funnel from an
  // admin browser.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let availableCreditPence = 0;
  let customerName = "";
  let customerPhone = "";
  let sessionRole: string | null = null;
  if (user) {
    const { availableCreditPence: getCredit } = await import("@/lib/credits/credits");
    const [credit, { data: profile }] = await Promise.all([
      getCredit(createAdminClient(), user.id),
      supabase.from("profiles").select("full_name, phone, role").eq("id", user.id).maybeSingle(),
    ]);
    availableCreditPence = credit;
    customerName = profile?.full_name ?? "";
    customerPhone = profile?.phone ?? "";
    sessionRole = profile?.role ?? "customer";
  }
  const bookingAsCustomer = Boolean(user) && sessionRole === "customer";

  const vehicleParams = [
    params.make ? `make=${encodeURIComponent(params.make)}` : null,
    params.model ? `model=${encodeURIComponent(params.model)}` : null,
    params.postcode ? `postcode=${encodeURIComponent(params.postcode)}` : null,
  ]
    .filter(Boolean)
    .join("&");

  const backHref = `/book/match?reg=${encodeURIComponent(reg)}&${repairsQuery(quote.itemIds)}${vehicleParams ? `&${vehicleParams}` : ""}${params.pref ? `&pref=${encodeURIComponent(params.pref)}` : ""}`;

  return (
    <div className="flex flex-col gap-6">
      <ProgressStepper currentStep={4} />

      <div className="flex items-center gap-3">
        <Link
          href={backHref}
          className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border text-text-secondary hover:bg-surface"
          aria-label="Back"
        >
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Pick a time</h1>
          <p className="text-sm text-text-secondary">
            {multi ? `${quote.items.length} jobs` : quote.description} ·{" "}
            {vehicleLabel(reg, params.make, params.model)}
          </p>
        </div>
      </div>

      <SlotPicker
        reg={reg}
        make={(params.make ?? "").toUpperCase()}
        model={params.model}
        defaultPostcode={(params.postcode ?? "").toUpperCase()}
        repairNodeIds={quote.itemIds}
        repairLines={quote.lines.map(({ nodeId, description, chargedHours, itemId, itemLabel }) => ({
          nodeId,
          description,
          chargedHours,
          itemId,
          itemLabel,
        }))}
        pricePence={pricePence}
        preferredMechanicId={params.pref}
        availableCreditPence={bookingAsCustomer ? availableCreditPence : 0}
        signedIn={bookingAsCustomer}
        wrongRole={Boolean(user) && !bookingAsCustomer ? (sessionRole ?? "admin") : undefined}
        customerName={bookingAsCustomer ? customerName : ""}
        customerEmail={bookingAsCustomer ? (user?.email ?? "") : ""}
        customerPhone={bookingAsCustomer ? customerPhone : ""}
        returnedIntentSecret={params.payment_intent_client_secret}
      />
    </div>
  );
}
