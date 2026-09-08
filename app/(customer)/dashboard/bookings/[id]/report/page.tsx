import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Car, Gauge, User, Wrench } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatJobNumber } from "@/lib/utils";
import { repairLinesFor, type BookingRepairRow } from "@/lib/bookings/repair-lines";
import { loadBookingChecklists, productIdsInLines } from "@/lib/checklists/load";
import { resultLabel } from "@/lib/checklists/checklists";
import { Button } from "@/components/ui/button";
import { PrintButton } from "./_components/print-button";

export const dynamic = "force-dynamic";

// The customer's service / inspection report (Task 32): every checklist item
// the mechanic answered, with their notes, plus the photos they took. On an
// inspection this IS the product the customer paid for. Signed-in only
// (/dashboard/* is gated in proxy.ts); ownership proved the way the dashboard
// does it, then read through the service-role client so the job photos
// (booking_media has no customer policy) can be shown too.

const RESULT_TONE: Record<string, string> = {
  pass: "bg-green-50 text-success",
  checked: "bg-green-50 text-success",
  advisory: "bg-amber-50 text-amber-700",
  fail: "bg-red-50 text-red-700",
  not_checked: "bg-surface text-text-secondary",
  na: "bg-surface text-text-secondary",
};

export default async function BookingReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/dashboard/bookings/${id}/report`);

  const admin = createAdminClient();
  const { data: booking } = await admin
    .from("bookings")
    .select(
      "id, job_number, status, customer_id, customer_email, vehicle_reg, vehicle_make, vehicle_model, mileage, completed_at, scheduled_at, mechanic_id, repair_node_id, repair_description",
    )
    .eq("id", id)
    .maybeSingle();
  if (!booking) notFound();
  const owns =
    booking.customer_id === user.id ||
    (booking.customer_id == null && booking.customer_email != null && booking.customer_email === user.email);
  if (!owns) notFound();

  const { data: lineRows } = await admin.from("booking_repairs").select("*").eq("booking_id", id).order("position");
  const lines = repairLinesFor(booking, (lineRows ?? null) as BookingRepairRow[] | null);
  const checklists = await loadBookingChecklists(admin, id, productIdsInLines(lines));
  if (checklists.length === 0) notFound();

  const [{ data: mechanic }, { data: media }] = await Promise.all([
    booking.mechanic_id
      ? admin.from("profiles").select("full_name").eq("id", booking.mechanic_id).maybeSingle()
      : Promise.resolve({ data: null as { full_name: string | null } | null }),
    admin.from("booking_media").select("id, kind, storage_path").eq("booking_id", id).order("created_at"),
  ]);
  const photos = (media ?? [])
    .filter((m) => m.kind === "photo")
    .map((m) => ({ id: m.id, url: admin.storage.from("job-media").getPublicUrl(m.storage_path).data.publicUrl }));

  const vehicle = [booking.vehicle_make, booking.vehicle_model].filter(Boolean).join(" ") || "Vehicle";
  const when = booking.completed_at ?? booking.scheduled_at;
  const dateLabel = when
    ? new Date(when).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" })
    : "—";
  const finished = booking.status === "completed";

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 print:px-0">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link href="/dashboard">
          <Button variant="ghost" size="sm" iconLeft={ArrowLeft}>
            Back to dashboard
          </Button>
        </Link>
        <PrintButton />
      </div>

      <header className="rounded-2xl bg-brand-gradient p-6 text-white shadow-hero print:bg-none print:p-0 print:text-text-primary print:shadow-none">
        <p className="text-sm font-semibold uppercase tracking-widest text-blue-200 print:text-text-muted">
          {finished ? "Your report" : "Report in progress"}
        </p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">
          {checklists.map((c) => c.name).join(" + ")}
        </h1>
        <p className="mt-1 text-sm text-blue-100 print:text-text-secondary">
          Ref {formatJobNumber(booking.job_number)} · {dateLabel}
        </p>
        <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
          <div className="flex items-start gap-2">
            <Car size={16} className="mt-0.5 shrink-0 text-blue-200 print:text-text-muted" />
            <div>
              <dt className="text-xs uppercase tracking-wide text-blue-200 print:text-text-muted">Vehicle</dt>
              <dd className="font-semibold">
                {vehicle} · <span className="font-mono uppercase">{booking.vehicle_reg}</span>
              </dd>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Gauge size={16} className="mt-0.5 shrink-0 text-blue-200 print:text-text-muted" />
            <div>
              <dt className="text-xs uppercase tracking-wide text-blue-200 print:text-text-muted">Mileage</dt>
              <dd className="font-semibold">
                {booking.mileage != null ? `${Number(booking.mileage).toLocaleString("en-GB")} miles` : "Not recorded"}
              </dd>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <User size={16} className="mt-0.5 shrink-0 text-blue-200 print:text-text-muted" />
            <div>
              <dt className="text-xs uppercase tracking-wide text-blue-200 print:text-text-muted">Mechanic</dt>
              <dd className="font-semibold">{mechanic?.full_name ?? "Your mechanic"}</dd>
            </div>
          </div>
        </dl>
      </header>

      {checklists.map((list) => {
        const inspection = list.checklist.kind === "inspection";
        const byItem = new Map(list.results.map((r) => [r.item_id, r]));
        return (
          <section key={list.checklist.id} className="space-y-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-bold text-text-primary">{list.name}</h2>
              <p className="text-sm text-text-muted">
                {list.progress.answered} of {list.progress.total} items
              </p>
            </div>

            {inspection && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  ["Pass", list.progress.pass, "text-success"],
                  ["Advisory", list.progress.advisory, "text-amber-700"],
                  ["Fail", list.progress.fail, "text-red-700"],
                  ["Not checked", list.progress.notChecked, "text-text-secondary"],
                ].map(([label, count, tone]) => (
                  <div key={label as string} className="rounded-xl border border-border bg-surface-card px-3 py-2.5 text-center">
                    <p className={`text-2xl font-extrabold tabular-nums ${tone}`}>{count as number}</p>
                    <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{label as string}</p>
                  </div>
                ))}
              </div>
            )}

            {list.sections.map((section) => (
              <div key={section.section} className="overflow-hidden rounded-2xl border border-border bg-surface-card">
                {list.sections.length > 1 && (
                  <h3 className="border-b border-border bg-surface px-4 py-2.5 text-sm font-bold text-text-primary">
                    {section.section}
                  </h3>
                )}
                <ul className="divide-y divide-border-subtle">
                  {section.items.map((item) => {
                    const r = byItem.get(item.id);
                    return (
                      <li key={item.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                        <div className="min-w-0">
                          <p className="text-sm text-text-primary">{item.label}</p>
                          {r?.comment && (
                            <p className="mt-1 rounded-lg bg-surface px-3 py-2 text-sm text-text-secondary">{r.comment}</p>
                          )}
                        </div>
                        <span
                          className={`inline-flex shrink-0 self-start rounded-full px-2.5 py-1 text-xs font-semibold ${
                            r ? RESULT_TONE[r.result] ?? "bg-surface text-text-secondary" : "bg-surface text-text-muted"
                          }`}
                        >
                          {r ? resultLabel(r.result) : "Not yet answered"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </section>
        );
      })}

      {photos.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-text-primary">Photos from your mechanic</h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photos.map((p) => (
              <li key={p.id} className="overflow-hidden rounded-xl border border-border bg-surface">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt="Job photo" className="aspect-square w-full object-cover" />
              </li>
            ))}
          </ul>
        </section>
      )}

      {finished && (checklists.some((c) => c.progress.advisory > 0 || c.progress.fail > 0)) && (
        <div className="rounded-2xl border border-brand-blue/30 bg-blue-50 p-5 print:hidden">
          <p className="flex items-center gap-2 text-sm font-bold text-text-primary">
            <Wrench size={16} className="text-brand-blue" />
            Something needs attention?
          </p>
          <p className="mt-1 text-sm text-text-secondary">
            Book the repair for {vehicle} and we&apos;ll price it from the manufacturer&apos;s book time.
          </p>
          <Link href={`/book/repairs?reg=${encodeURIComponent(booking.vehicle_reg)}`} className="mt-3 inline-block">
            <Button size="sm">Book a repair</Button>
          </Link>
        </div>
      )}
    </div>
  );
}
