import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Car,
  Wrench,
  Gauge,
  MapPin,
  CalendarClock,
  User,
  Mail,
  CreditCard,
  ListChecks,
  Settings2,
  Split,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Overline } from "@/components/ui/overline";
import { formatPrice, formatJobNumber } from "@/lib/utils";
import { formatBookingWhen, formatCandidateDays, isFlexibleBooking } from "@/lib/slots";
import { calcEarnings } from "@/lib/earnings";
import { repairLinesFor, type BookingRepairRow } from "@/lib/bookings/repair-lines";
import { loadBookingChecklists, productIdsInLines } from "@/lib/checklists/load";
import { resultLabel } from "@/lib/checklists/checklists";
import { loadFaultsForBooking, loadQuotesForBooking, quoteMoney } from "@/lib/quotes/load";
import { QUOTE_KIND_LABEL, QUOTE_STATUS_LABEL } from "@/lib/quotes/status";
import { loadRevisionsForBooking } from "@/lib/revisions/load";
import { REVISION_STATUS_LABEL } from "@/lib/revisions/status";
import { diffRevision, differenceLabel } from "@/lib/revisions/diff";
import { Timeline, type TimelineEvent } from "./_components/timeline";
import { BookingActions } from "./_components/booking-actions";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

const STATUS_LABEL: Record<string, string> = {
  sourcing_mechanic: "Sourcing mechanic",
  confirmed: "Confirmed",
  en_route: "En route",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
  disputed: "Disputed",
};

function statusTone(status: string): "active" | "success" | "pending" | "error" | "neutral" {
  if (["confirmed", "en_route", "in_progress"].includes(status)) return "active";
  if (status === "completed") return "success";
  if (status === "sourcing_mechanic") return "pending";
  if (status === "disputed") return "error";
  return "neutral";
}

const PARKING_LABEL: Record<string, string> = {
  driveway: "Driveway",
  street: "On-street",
  car_park: "Car park",
  other: "Other",
};

// Stripe manual-capture PaymentIntent status → human label + pill tone.
function paymentMeta(
  status: string | null,
): { label: string; tone: "active" | "success" | "pending" | "error" | "neutral" } {
  switch (status) {
    case "requires_capture":
      return { label: "Pre-authorised (held)", tone: "active" };
    case "succeeded":
      return { label: "Captured", tone: "success" };
    case "canceled":
      return { label: "Released", tone: "neutral" };
    case "processing":
      return { label: "Processing", tone: "pending" };
    case "requires_payment_method":
    case "requires_confirmation":
    case "requires_action":
      return { label: "Awaiting payment", tone: "pending" };
    default:
      return { label: status ?? "Unknown", tone: "neutral" };
  }
}

async function retrievePaymentStatus(piId: string | null): Promise<string | null> {
  if (!piId) return null;
  try {
    const { stripe } = await import("@/lib/stripe/server");
    const pi = await stripe.paymentIntents.retrieve(piId);
    return pi.status;
  } catch {
    return null;
  }
}

export default async function BookingDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: booking } = await supabase
    .from("bookings")
    .select(
      `id, job_number, status, area, postcode, total_pence, base_price_pence, parts_price_pence,
       commission_rate, platform_fee_pence, mechanic_payout_pence, credit_applied_pence,
       customer_name, customer_email,
       vehicle_reg, vehicle_make, vehicle_model, mechanic_id,
       repair_description,
       scheduled_at, slot_window, candidate_days, created_at, address_line_1, address_line_2, parking_type,
       special_instructions, stripe_payment_intent_id, mileage`,
    )
    .eq("id", id)
    .single();

  if (!booking) notFound();

  // Every job of a multi-job booking, and how its combined time was derived
  // (Task 24). Separate queries so the page still renders before migration
  // 0055 exists — errors just mean "one job" / "not combined".
  const [{ data: lineRows }, { data: combineRow }] = await Promise.all([
    supabase
      .from("booking_repairs")
      .select("*")
      .eq("booking_id", id)
      .order("position"),
    supabase.from("bookings").select("combine_source").eq("id", id).maybeSingle(),
  ]);
  const repairLines = repairLinesFor(booking, (lineRows ?? null) as BookingRepairRow[] | null);
  // The service / inspection checklists on this booking (Task 32), with the
  // mechanic's answers so far. Admin RLS reads everything.
  const checklists = await loadBookingChecklists(supabase, id, productIdsInLines(repairLines));
  // Faults and quotes (Task 33); revised jobs (Task 37).
  const [faults, quotes, revisions] = await Promise.all([
    loadFaultsForBooking(supabase, id),
    loadQuotesForBooking(supabase, id),
    loadRevisionsForBooking(supabase, id),
  ]);
  const quoteTotals = quoteMoney(quotes);
  const combineSource: string | null = combineRow?.combine_source ?? null;

  const [{ data: events }, { data: mechRows }, paymentStatus] =
    await Promise.all([
      supabase
        .from("booking_events")
        .select("id, event_type, actor_role, reason, payload, created_at")
        .eq("booking_id", id)
        .order("created_at", { ascending: true }),
      supabase
        .from("mechanics")
        .select("id, status, profile:profiles!inner(full_name)")
        .order("created_at", { ascending: false }),
      retrievePaymentStatus(booking.stripe_payment_intent_id),
    ]);

  const mechanics = (mechRows ?? []).map((m) => {
    const profile = Array.isArray(m.profile) ? m.profile[0] : m.profile;
    return {
      id: m.id,
      name: `${profile?.full_name ?? "Unnamed"}${m.status === "online" ? " · online" : ""}`,
    };
  });
  const currentMechanicName =
    mechanics.find((m) => m.id === booking.mechanic_id)?.name ?? null;

  const timelineEvents: TimelineEvent[] = (events ?? []).map((e) => ({
    id: e.id,
    eventType: e.event_type,
    actorRole: e.actor_role,
    reason: e.reason,
    createdAt: e.created_at,
  }));

  const pay = paymentMeta(paymentStatus);

  // Refund state. Refundable = what the customer actually paid minus anything
  // already refunded (summed from the timeline). Refunds only apply to a captured
  // charge; each refund is recovered from the mechanic (see refundBooking).
  const chargedPence = Math.max(
    0,
    (booking.total_pence ?? 0) - (booking.credit_applied_pence ?? 0),
  );
  const alreadyRefundedPence = (events ?? [])
    .filter((e) => e.event_type === "payment_refunded")
    .reduce(
      (sum, e) => sum + ((e.payload as { amount_pence?: number } | null)?.amount_pence ?? 0),
      0,
    );
  const refundablePence = Math.max(0, chargedPence - alreadyRefundedPence);
  const canRefund = paymentStatus === "succeeded" && refundablePence > 0;

  // Commission/payout split. Prefer the values snapshotted on the booking at
  // creation; fall back to recomputing for legacy rows that predate them.
  const hasSnapshot =
    booking.platform_fee_pence != null && booking.mechanic_payout_pence != null;
  const rate = booking.commission_rate ?? 0.15;
  const fallback = calcEarnings(booking.total_pence ?? 0, rate, booking.parts_price_pence ?? 0);
  const split = {
    customerPence: booking.total_pence ?? 0,
    partsPence: booking.parts_price_pence ?? 0,
    platformFeePence: hasSnapshot ? booking.platform_fee_pence! : fallback.platformFeePence,
    mechanicPence: hasSnapshot ? booking.mechanic_payout_pence! : fallback.mechanicPence,
    ratePct: Math.round(rate * 1000) / 10,
    snapshot: hasSnapshot,
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href="/admin/jobs">
        <Button variant="ghost" size="sm" iconLeft={ArrowLeft}>
          Back to jobs
        </Button>
      </Link>

      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Overline>Operations</Overline>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="font-mono text-2xl font-bold tracking-tight text-text-primary">
              #{formatJobNumber(booking.job_number)}
            </h1>
            <Pill tone={statusTone(booking.status)}>
              {STATUS_LABEL[booking.status] ?? booking.status}
            </Pill>
          </div>
          <p className="mt-1.5 text-sm text-text-muted">
            Placed {new Date(booking.created_at).toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" })}
          </p>
        </div>
        <div className="text-right">
          <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-text-muted">
            Value
          </div>
          <div className="text-2xl font-bold text-text-primary">
            {formatPrice(booking.total_pence ?? 0)}
          </div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="space-y-4 p-6">
            <CardTitle icon={User}>Customer</CardTitle>
            <Row icon={User} label="Name" value={booking.customer_name ?? "—"} />
            <Row icon={Mail} label="Email" value={booking.customer_email ?? "—"} />
          </Card>

          <Card className="space-y-4 p-6">
            <CardTitle icon={Car}>Vehicle &amp; repair</CardTitle>
            <Row
              icon={Car}
              label="Vehicle"
              value={[
                booking.vehicle_reg,
                [booking.vehicle_make, booking.vehicle_model].filter(Boolean).join(" "),
              ]
                .filter(Boolean)
                .join(" · ") || "—"}
            />
            <Row
              icon={Wrench}
              label={repairLines.length > 1 ? `Repairs (${repairLines.length})` : "Repair"}
              value={
                repairLines.length > 1 ? (
                  <ul className="flex flex-col gap-1">
                    {repairLines.map((line) => (
                      <li key={line.nodeId ?? line.position} className="flex flex-wrap items-baseline gap-x-2">
                        <span>{line.description}</span>
                        {line.itemLabel && (
                          <span className="text-xs font-normal text-brand-blue">{line.itemLabel}</span>
                        )}
                        <span className="text-xs font-normal text-text-muted">
                          {line.product
                            ? "Fixed price"
                            : line.rawHours != null && line.chargedHours != null
                              ? line.chargedHours === 0
                                ? `${line.rawHours} h book time · no extra time`
                                : line.chargedHours < line.rawHours
                                  ? `${line.rawHours} h → ${line.chargedHours} h charged`
                                  : `${line.chargedHours} h`
                              : ""}
                          {line.linePence != null && ` · ${formatPrice(line.linePence)}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  booking.repair_description ?? "Vehicle repair"
                )
              }
            />
            {repairLines.length > 1 && (
              <Row
                icon={Wrench}
                label="How the time was worked out"
                value={
                  combineSource === "haynespro"
                    ? "HaynesPro combined the jobs (overlapping work removed)"
                    : "Each job's book time added together"
                }
              />
            )}
            <Row icon={Wrench} label="Mechanic" value={currentMechanicName ?? "Unassigned"} />
            <Row
              icon={CalendarClock}
              label="Scheduled"
              value={booking.scheduled_at ? formatBookingWhen(booking) : "—"}
            />
            {isFlexibleBooking(booking) && (
              <Row
                icon={CalendarClock}
                label="Days offered"
                value={`${formatCandidateDays([...(booking.candidate_days as string[])].sort())} — the mechanic picks one and a 2-hour window`}
              />
            )}
            <Row
              icon={Gauge}
              label="Mileage"
              value={
                booking.mileage != null
                  ? `${Number(booking.mileage).toLocaleString("en-GB")} miles (recorded by the mechanic)`
                  : "Not recorded"
              }
            />
          </Card>

          {/* Revised jobs (Task 37) */}
          {revisions.length > 0 && (
            <Card className="space-y-4 p-6">
              <CardTitle icon={Wrench}>Revised job</CardTitle>
              {revisions.map((r) => {
                const diff = diffRevision(r.before, r.after);
                return (
                  <div key={r.id} className="rounded-xl border border-border px-3.5 py-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-text-primary">{r.after.repairDescription}</p>
                        <p className="text-xs text-text-muted">
                          {REVISION_STATUS_LABEL[r.status]} · was {formatPrice(r.before.totalPence)} → {formatPrice(r.after.totalPence)} ({differenceLabel(r.differencePence)})
                          {r.holdQuoteId && " · difference held on a second intent"}
                        </p>
                      </div>
                      <span className="shrink-0 font-bold tabular-nums text-text-primary">{formatPrice(r.after.totalPence)}</span>
                    </div>
                    <p className="mt-1.5 text-xs text-text-secondary">“{r.reason}”</p>
                    <ul className="mt-1.5 space-y-0.5 text-xs text-text-secondary">
                      {diff.lines.removed.map((l) => (
                        <li key={`r-${l.nodeId}`} className="text-text-muted line-through">{l.description}</li>
                      ))}
                      {diff.parts.removed.map((p, i) => (
                        <li key={`rp-${i}`} className="text-text-muted line-through">{p.name} (part)</li>
                      ))}
                      {diff.lines.added.map((l) => (
                        <li key={`a-${l.nodeId}`}>+ {l.description} · {l.kind === "product" ? "fixed price" : `${l.chargedHours} h`} · {formatPrice(l.linePence)}</li>
                      ))}
                      {diff.parts.added.map((p, i) => (
                        <li key={`ap-${i}`}>+ {p.name}{p.quantity > 1 ? ` × ${p.quantity}` : ""} (part) · {formatPrice(p.linePence)}</li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </Card>
          )}

          {/* Faults and quotes (Task 33) */}
          {(faults.length > 0 || quotes.length > 0) && (
            <Card className="space-y-4 p-6">
              <CardTitle icon={Wrench}>Faults &amp; quotes</CardTitle>
              {faults.length > 0 && (
                <ul className="divide-y divide-border-subtle rounded-xl border border-border">
                  {faults.map((f) => (
                    <li key={f.id} className="px-3 py-2 text-sm">
                      <span className={f.severity === "urgent" ? "font-semibold text-red-700" : "text-amber-700"}>
                        {f.severity === "urgent" ? "Urgent" : "Advisory"}
                      </span>
                      <span className="text-text-primary"> · {f.description}</span>
                      {f.quoteId && <span className="text-xs text-text-muted"> · quoted</span>}
                    </li>
                  ))}
                </ul>
              )}
              {quotes.map((q) => (
                <div key={q.id} className="rounded-xl border border-border px-3.5 py-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-text-primary">{q.title ?? QUOTE_KIND_LABEL[q.kind]}</p>
                      <p className="text-xs text-text-muted">
                        {QUOTE_KIND_LABEL[q.kind]} · {QUOTE_STATUS_LABEL[q.status]}
                        {q.stripePaymentIntentId && ` · ${q.stripePaymentIntentId}`}
                        {q.capturedAt && " · captured"}
                      </p>
                    </div>
                    <span className="font-bold tabular-nums text-text-primary">{formatPrice(q.totalPence)}</span>
                  </div>
                  <ul className="mt-1.5 space-y-0.5 text-xs text-text-secondary">
                    {q.lines.map((l) => (
                      <li key={l.id}>
                        {l.description}
                        {l.kind === "labour" ? ` · ${l.hours} h` : l.quantity > 1 ? ` × ${l.quantity}` : ""} · {formatPrice(l.linePence)}
                      </li>
                    ))}
                  </ul>
                  {q.note && <p className="mt-1.5 text-xs text-text-muted">“{q.note}”</p>}
                </div>
              ))}
            </Card>
          )}

          {/* Checklist / inspection report (Task 32) */}
          {checklists.map((list) => (
            <Card key={list.checklist.id} className="space-y-4 p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <CardTitle icon={Wrench}>{list.name}</CardTitle>
                <p className="text-xs font-semibold text-text-muted">
                  {list.progress.answered} of {list.progress.total} answered
                  {list.checklist.kind === "inspection" && (
                    <>
                      {" · "}
                      <span className="text-amber-700">{list.progress.advisory} advisory</span>
                      {" · "}
                      <span className="text-red-700">{list.progress.fail} fail</span>
                    </>
                  )}
                </p>
              </div>
              {list.sections.map((section) => {
                const byItem = new Map(list.results.map((r) => [r.item_id, r]));
                return (
                  <div key={section.section}>
                    {list.sections.length > 1 && (
                      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-text-muted">
                        {section.section}
                      </p>
                    )}
                    <ul className="divide-y divide-border-subtle rounded-xl border border-border">
                      {section.items.map((item) => {
                        const r = byItem.get(item.id);
                        const tone =
                          r?.result === "fail"
                            ? "bg-red-50 text-red-700"
                            : r?.result === "advisory"
                              ? "bg-amber-50 text-amber-700"
                              : r?.result === "pass" || r?.result === "checked"
                                ? "bg-green-50 text-success"
                                : "bg-surface text-text-secondary";
                        return (
                          <li key={item.id} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                            <div className="min-w-0">
                              <p className="text-text-primary">{item.label}</p>
                              {r?.comment && <p className="mt-0.5 text-xs text-text-muted">{r.comment}</p>}
                            </div>
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${tone}`}>
                              {r ? resultLabel(r.result) : "—"}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </Card>
          ))}

          <Card className="space-y-4 p-6">
            <CardTitle icon={MapPin}>Location</CardTitle>
            <Row
              icon={MapPin}
              label="Address"
              value={[booking.address_line_1, booking.address_line_2, booking.postcode]
                .filter(Boolean)
                .join(", ") || "—"}
            />
            <Row
              icon={MapPin}
              label="Parking"
              value={booking.parking_type ? PARKING_LABEL[booking.parking_type] ?? booking.parking_type : "—"}
            />
            {booking.special_instructions && (
              <Row icon={ListChecks} label="Instructions" value={booking.special_instructions} />
            )}
          </Card>

          <Card className="space-y-4 p-6">
            <CardTitle icon={ListChecks}>Timeline</CardTitle>
            <Timeline events={timelineEvents} />
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="space-y-3 p-6">
            <CardTitle icon={CreditCard}>Payment</CardTitle>
            {booking.stripe_payment_intent_id ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-text-secondary">Status</span>
                  <Pill tone={pay.tone}>{pay.label}</Pill>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-text-secondary">Amount</span>
                  <span className="text-sm font-semibold text-text-primary">
                    {formatPrice(booking.total_pence ?? 0)}
                  </span>
                </div>
                {alreadyRefundedPence > 0 && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-text-secondary">Refunded</span>
                    <span className="text-sm font-semibold text-red-600">
                      −{formatPrice(alreadyRefundedPence)}
                    </span>
                  </div>
                )}
                <p className="break-all text-xs text-text-muted">
                  {booking.stripe_payment_intent_id}
                </p>
              </>
            ) : (
              <p className="text-sm text-text-muted">No payment intent on this booking.</p>
            )}
          </Card>

          <Card className="space-y-3 p-6">
            <CardTitle icon={Split}>Split</CardTitle>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-text-secondary">Customer pays</span>
              <span className="text-sm font-semibold text-text-primary">
                {formatPrice(split.customerPence)}
              </span>
            </div>
            {split.partsPence > 0 && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-text-secondary">of which parts</span>
                <span className="text-sm text-text-muted">{formatPrice(split.partsPence)}</span>
              </div>
            )}
            {quoteTotals.approvedNowPence > 0 && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-text-secondary">of which approved extra work</span>
                <span className="text-sm text-text-muted">{formatPrice(quoteTotals.approvedNowPence)}</span>
              </div>
            )}
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-text-secondary">
                Platform commission ({split.ratePct}%)
              </span>
              <span className="text-sm font-semibold text-success">
                {formatPrice(split.platformFeePence)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
              <span className="text-sm text-text-secondary">Mechanic payout</span>
              <span className="text-sm font-semibold text-text-primary">
                {formatPrice(split.mechanicPence)}
              </span>
            </div>
            <p className="text-xs text-text-muted">
              Commission is taken on the total; the mechanic&apos;s payout covers the
              parts they front.{" "}
              {split.snapshot
                ? "Locked at booking time."
                : "Estimated — predates the pricing snapshot."}{" "}
              Paid out automatically on completion.
            </p>
          </Card>

          <Card className="space-y-4 p-6">
            <CardTitle icon={Settings2}>Actions</CardTitle>
            <BookingActions
              bookingId={booking.id}
              currentMechanicId={booking.mechanic_id}
              isClosed={booking.status === "cancelled"}
              mechanics={mechanics}
              canRefund={canRefund}
              refundablePence={refundablePence}
              hasMechanic={booking.mechanic_id != null}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}

function CardTitle({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-text-muted">
      <Icon size={14} />
      {children}
    </h2>
  );
}

function Row({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon size={16} className="mt-1 shrink-0 text-text-muted" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-text-muted">
          {label}
        </p>
        <div className="break-words text-sm font-semibold text-text-primary">{value}</div>
      </div>
    </div>
  );
}
