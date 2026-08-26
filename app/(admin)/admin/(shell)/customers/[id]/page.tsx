import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Mail,
  Phone,
  Calendar,
  ChevronRight,
  Gift,
  Star,
  AlertTriangle,
} from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Stars } from "@/components/ui/stars";
import { Overline } from "@/components/ui/overline";
import { cn, formatPrice, formatJobNumber } from "@/lib/utils";
import { availableCreditPence } from "@/lib/credits/credits";

// A single customer: contact, spend, every job they've booked, every dispute
// they're party to, and their credit ledger. Service-role reads throughout —
// the page is behind the proxy admin gate and needs auth.users + rows no
// single RLS grant covers.
export const dynamic = "force-dynamic";

interface CustomerDetailPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}

type Tab = "overview" | "jobs" | "disputes" | "credit";

const LIVE_STATUSES = new Set(["confirmed", "en_route", "in_progress"]);
const OPEN_DISPUTE_STATUSES = new Set(["opened", "responded", "escalated"]);

function jobStatusTone(status: string): "active" | "success" | "pending" | "error" | "neutral" {
  if (LIVE_STATUSES.has(status)) return "active";
  if (status === "completed") return "success";
  if (status === "sourcing_mechanic") return "pending";
  if (status === "disputed") return "error";
  return "neutral";
}

const JOB_STATUS_LABEL: Record<string, string> = {
  sourcing_mechanic: "Sourcing",
  confirmed: "Confirmed",
  en_route: "En route",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
  disputed: "Disputed",
};

const DISPUTE_STATUS_LABEL: Record<string, string> = {
  opened: "Opened",
  responded: "Responded",
  escalated: "Escalated",
  resolved: "Resolved",
  withdrawn: "Withdrawn",
};

function disputeStatusTone(status: string): "error" | "pending" | "success" | "neutral" {
  if (status === "escalated") return "error";
  if (status === "opened" || status === "responded") return "pending";
  if (status === "resolved") return "success";
  return "neutral";
}

const CREDIT_SOURCE_LABEL: Record<string, string> = {
  referral_welcome: "Referral welcome",
  referral_bonus: "Referral bonus",
  compensation: "Compensation",
  promo: "Promo",
  redemption: "Applied to a booking",
};

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function CustomerDetailPage({
  params,
  searchParams,
}: CustomerDetailPageProps) {
  const { id } = await params;
  const { tab: tabParam } = await searchParams;
  const tab: Tab =
    tabParam === "jobs" || tabParam === "disputes" || tabParam === "credit"
      ? tabParam
      : "overview";

  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("id, full_name, phone, avatar_url, role, referral_code, referred_by")
    .eq("id", id)
    .maybeSingle();

  if (!profile) notFound();

  const { data: userData } = await admin.auth.admin.getUserById(id);
  const email = userData?.user?.email ?? null;
  const joinedAt = userData?.user?.created_at ?? null;
  const lastSignInAt = userData?.user?.last_sign_in_at ?? null;

  // Bookings by id OR email, so jobs placed before this email had an account
  // still show up here (guest checkout is retired, but the history remains).
  const orFilter = email
    ? `customer_id.eq.${id},customer_email.eq.${email}`
    : `customer_id.eq.${id}`;
  const { data: bookingsRaw } = await admin
    .from("bookings")
    .select(
      `id, job_number, status, total_pence, credit_applied_pence, repair_description,
       vehicle_reg, vehicle_make, vehicle_model, postcode, scheduled_at, slot_window,
       created_at, completed_at, mechanic_id`,
    )
    .or(orFilter)
    .order("created_at", { ascending: false });

  const bookings = bookingsRaw ?? [];
  const bookingIds = bookings.map((b) => b.id);
  const bookingById = new Map(bookings.map((b) => [b.id, b]));

  const [{ data: disputesRaw }, { data: creditsRaw }, { data: reviewsRaw }, creditBalance] =
    await Promise.all([
      bookingIds.length
        ? admin
            .from("disputes")
            .select(
              "id, booking_id, status, reason_category, description, refund_requested_pence, opened_by_role, created_at, resolved_at, resolution",
            )
            .in("booking_id", bookingIds)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] as never[] }),
      admin
        .from("customer_credits")
        .select("id, amount_pence, source, description, expires_at, created_at, redeemed_booking_id")
        .eq("customer_id", id)
        .order("created_at", { ascending: false }),
      bookingIds.length
        ? admin
            .from("reviews")
            .select("id, booking_id, rating, tags, comment, created_at")
            .in("booking_id", bookingIds)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] as never[] }),
      availableCreditPence(admin, id),
    ]);

  const disputes = disputesRaw ?? [];
  const credits = creditsRaw ?? [];
  const reviews = reviewsRaw ?? [];

  // Who referred them, if anyone.
  let referrerName: string | null = null;
  if (profile.referred_by) {
    const { data: referrer } = await admin
      .from("profiles")
      .select("full_name")
      .eq("id", profile.referred_by)
      .maybeSingle();
    referrerName = referrer?.full_name ?? "Another customer";
  }

  const completed = bookings.filter((b) => b.status === "completed");
  const totalSpentPence = completed.reduce((sum, b) => sum + (b.total_pence ?? 0), 0);
  const openDisputes = disputes.filter((d) => OPEN_DISPUTE_STATUSES.has(d.status)).length;
  const avgRating =
    reviews.length > 0
      ? reviews.reduce((sum, r) => sum + (r.rating ?? 0), 0) / reviews.length
      : null;
  const vehicles = [
    ...new Map(
      bookings
        .filter((b) => b.vehicle_reg)
        .map((b) => [
          b.vehicle_reg,
          {
            reg: b.vehicle_reg as string,
            label: [b.vehicle_make, b.vehicle_model].filter(Boolean).join(" "),
          },
        ]),
    ).values(),
  ];

  const TABS: ReadonlyArray<{ value: Tab; label: string; count?: number }> = [
    { value: "overview", label: "Overview" },
    { value: "jobs", label: "Jobs", count: bookings.length },
    { value: "disputes", label: "Disputes", count: disputes.length },
    { value: "credit", label: "Credit", count: credits.length },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/admin/customers">
        <Button variant="ghost" size="sm" iconLeft={ArrowLeft}>
          Back to customers
        </Button>
      </Link>

      <header>
        <Overline>Network</Overline>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight text-text-primary">
            {profile.full_name ?? "Unnamed customer"}
          </h1>
          {profile.role !== "customer" && (
            <Pill tone="info" title="This account also has a staff role">
              {profile.role}
            </Pill>
          )}
          {openDisputes > 0 && (
            <Pill tone="error">
              <AlertTriangle size={11} className="mr-1 inline" />
              {openDisputes} open dispute{openDisputes === 1 ? "" : "s"}
            </Pill>
          )}
        </div>
        <p className="mt-1.5 text-sm text-text-muted">
          Joined {formatDate(joinedAt)}
          {lastSignInAt
            ? ` · last signed in ${formatDate(lastSignInAt)}`
            : " · never signed in"}
        </p>
      </header>

      {/* Rollup strip */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Total spent" value={formatPrice(totalSpentPence)} />
        <Stat label="Jobs booked" value={String(bookings.length)} hint={`${completed.length} completed`} />
        <Stat label="Account credit" value={formatPrice(creditBalance)} />
        <Stat
          label="Avg rating given"
          value={avgRating ? avgRating.toFixed(1) : "—"}
          hint={reviews.length ? `${reviews.length} review${reviews.length === 1 ? "" : "s"}` : undefined}
        />
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map((t) => {
          const active = tab === t.value;
          return (
            <Link
              key={t.value}
              href={`/admin/customers/${id}?tab=${t.value}`}
              className={cn(
                "-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors",
                active
                  ? "border-brand-blue text-brand-blue"
                  : "border-transparent text-text-muted hover:text-text-secondary",
              )}
            >
              {t.label}
              {typeof t.count === "number" && (
                <span
                  className={cn(
                    "ml-1.5 rounded-full px-1.5 py-0.5 text-xs font-semibold",
                    active ? "bg-blue-50 text-brand-blue" : "bg-surface text-text-muted",
                  )}
                >
                  {t.count}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {tab === "overview" && (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="space-y-4 p-6">
              <h2 className="text-sm font-bold uppercase tracking-wide text-text-muted">
                Contact
              </h2>
              <Row icon={Mail} label="Email" value={email ?? "—"} />
              <Row icon={Phone} label="Phone" value={profile.phone ?? "—"} />
              <Row
                icon={Calendar}
                label="Last booking"
                value={formatDate(bookings[0]?.created_at ?? null)}
              />
            </Card>

            <Card className="space-y-4 p-6">
              <h2 className="text-sm font-bold uppercase tracking-wide text-text-muted">
                Referrals
              </h2>
              <Row icon={Gift} label="Their referral code" value={profile.referral_code ?? "—"} />
              <Row
                icon={Gift}
                label="Referred by"
                value={referrerName ?? "Not referred"}
              />
            </Card>
          </div>

          <Card className="space-y-3 p-6">
            <h2 className="text-sm font-bold uppercase tracking-wide text-text-muted">
              Vehicles booked
            </h2>
            {vehicles.length === 0 ? (
              <p className="text-sm text-text-muted">No bookings yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {vehicles.map((v) => (
                  <Pill key={v.reg} tone="neutral">
                    <span className="font-bold uppercase tracking-[0.04em]">{v.reg}</span>
                    {v.label ? ` · ${v.label}` : ""}
                  </Pill>
                ))}
              </div>
            )}
          </Card>

          {reviews.length > 0 && (
            <Card className="space-y-3 p-6">
              <h2 className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-text-muted">
                <Star size={14} /> Reviews they&apos;ve left
              </h2>
              <ul className="space-y-3">
                {reviews.map((r) => (
                  <li key={r.id} className="rounded-lg bg-surface px-3 py-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <Stars value={r.rating} size={14} />
                      <span className="shrink-0 text-xs text-text-muted">
                        {formatDate(r.created_at)}
                      </span>
                    </div>
                    {r.comment && (
                      <p className="mt-1.5 text-sm text-text-secondary">{r.comment}</p>
                    )}
                    <Link
                      href={`/admin/jobs/${r.booking_id}`}
                      className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-brand-blue hover:underline"
                    >
                      View job <ChevronRight size={12} />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}

      {tab === "jobs" &&
        (bookings.length === 0 ? (
          <EmptyState
            title="No jobs yet"
            body="Bookings this customer places will appear here."
          />
        ) : (
          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-surface text-[11px] font-semibold uppercase tracking-[0.04em] text-text-muted">
                  <tr>
                    <th className="px-5 py-3">Job</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Scheduled</th>
                    <th className="px-5 py-3">Total</th>
                    <th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {bookings.map((b) => (
                    <tr key={b.id} className="hover:bg-surface/50">
                      <td className="px-5 py-3">
                        <Link
                          href={`/admin/jobs/${b.id}`}
                          className="font-semibold text-text-primary hover:text-brand-blue"
                        >
                          {b.repair_description ?? "Vehicle repair"}
                        </Link>
                        <p className="text-xs text-text-muted">
                          {b.job_number ? `${formatJobNumber(b.job_number)} · ` : ""}
                          {b.vehicle_reg ?? "—"}
                          {b.postcode ? ` · ${b.postcode}` : ""}
                        </p>
                      </td>
                      <td className="px-5 py-3">
                        <Pill tone={jobStatusTone(b.status)}>
                          {JOB_STATUS_LABEL[b.status] ?? b.status.replace(/_/g, " ")}
                        </Pill>
                      </td>
                      <td className="px-5 py-3 text-text-secondary">
                        {formatDateTime(b.scheduled_at)}
                      </td>
                      <td className="px-5 py-3">
                        <span className="font-semibold text-text-primary">
                          {formatPrice(b.total_pence ?? 0)}
                        </span>
                        {(b.credit_applied_pence ?? 0) > 0 && (
                          <p className="text-xs text-success">
                            −{formatPrice(b.credit_applied_pence)} credit
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Link
                          href={`/admin/jobs/${b.id}`}
                          className="inline-flex items-center gap-1 text-sm font-semibold text-brand-blue hover:underline"
                        >
                          View <ChevronRight size={14} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ))}

      {tab === "disputes" &&
        (disputes.length === 0 ? (
          <EmptyState
            title="No disputes"
            body="Disputes raised on this customer's jobs — by them or by the mechanic — will appear here."
          />
        ) : (
          <div className="space-y-4">
            {disputes.map((d) => {
              const booking = bookingById.get(d.booking_id);
              return (
                <Card key={d.id} className="space-y-3 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Pill tone={disputeStatusTone(d.status)}>
                          {DISPUTE_STATUS_LABEL[d.status] ?? d.status}
                        </Pill>
                        <span className="text-sm font-semibold text-text-primary">
                          {d.reason_category?.replace(/_/g, " ") ?? "Dispute"}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-text-muted">
                        Raised by the {d.opened_by_role} on {formatDate(d.created_at)}
                        {booking?.job_number ? ` · ${formatJobNumber(booking.job_number)}` : ""}
                      </p>
                    </div>
                    {typeof d.refund_requested_pence === "number" && (
                      <span className="shrink-0 text-sm font-semibold text-text-primary">
                        {formatPrice(d.refund_requested_pence)} requested
                      </span>
                    )}
                  </div>

                  {d.description && (
                    <p className="text-sm leading-relaxed text-text-secondary">
                      {d.description}
                    </p>
                  )}

                  {d.resolved_at && (
                    <p className="rounded-lg bg-surface px-3 py-2 text-xs text-text-secondary">
                      Resolved {formatDate(d.resolved_at)}
                      {d.resolution ? ` · ${d.resolution.replace(/_/g, " ")}` : ""}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-4">
                    <Link
                      href={`/admin/disputes/${d.id}`}
                      className="inline-flex items-center gap-1 text-sm font-semibold text-brand-blue hover:underline"
                    >
                      Open dispute <ChevronRight size={14} />
                    </Link>
                    <Link
                      href={`/admin/jobs/${d.booking_id}`}
                      className="inline-flex items-center gap-1 text-sm font-semibold text-text-secondary hover:underline"
                    >
                      View job <ChevronRight size={14} />
                    </Link>
                  </div>
                </Card>
              );
            })}
          </div>
        ))}

      {tab === "credit" &&
        (credits.length === 0 ? (
          <EmptyState
            title="No credit activity"
            body="Referral credit, compensation and redemptions against bookings will appear here."
          />
        ) : (
          <Card className="space-y-4 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wide text-text-muted">
                Spendable balance
              </h2>
              <span className="text-lg font-bold text-text-primary">
                {formatPrice(creditBalance)}
              </span>
            </div>
            <ul className="divide-y divide-border-subtle border-t border-border">
              {credits.map((c) => (
                <li key={c.id} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text-primary">
                      {CREDIT_SOURCE_LABEL[c.source] ?? c.source}
                    </p>
                    <p className="text-xs text-text-muted">
                      {formatDate(c.created_at)}
                      {c.description ? ` · ${c.description}` : ""}
                      {c.expires_at ? ` · expires ${formatDate(c.expires_at)}` : ""}
                    </p>
                    {c.redeemed_booking_id && (
                      <Link
                        href={`/admin/jobs/${c.redeemed_booking_id}`}
                        className="text-xs font-semibold text-brand-blue hover:underline"
                      >
                        View job
                      </Link>
                    )}
                  </div>
                  <span
                    className={cn(
                      "shrink-0 font-semibold tabular-nums",
                      (c.amount_pence ?? 0) < 0 ? "text-text-secondary" : "text-success",
                    )}
                  >
                    {(c.amount_pence ?? 0) < 0 ? "−" : "+"}
                    {formatPrice(Math.abs(c.amount_pence ?? 0))}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ))}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-text-muted">
        {label}
      </p>
      <p className="mt-0.5 text-xl font-bold text-text-primary">{value}</p>
      {hint && <p className="text-xs text-text-muted">{hint}</p>}
    </Card>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <Card className="p-10 text-center">
      <p className="text-sm font-semibold text-text-secondary">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-text-muted">{body}</p>
    </Card>
  );
}

function Row({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon size={16} className="mt-1 shrink-0 text-text-muted" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-text-muted">
          {label}
        </p>
        <p className="break-words text-sm font-semibold text-text-primary">{value}</p>
      </div>
    </div>
  );
}
