import { notFound, redirect } from "next/navigation";
import { Wrench } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatJobNumber } from "@/lib/utils";
import { repairLinesFor, type BookingRepairRow } from "@/lib/bookings/repair-lines";
import { loadBookingChecklists, productIdsInLines } from "@/lib/checklists/load";
import { resultLabel } from "@/lib/checklists/checklists";
import {
  ButtonLink,
  Caption,
  DetailRow,
  ListCard,
  ListRow,
  Notice,
  Overline,
  PageHeader,
  Screen,
  Section,
  Stack,
  StatusPill,
  type PillTone,
} from "@/components/dashboard/ui";
import { PrintButton } from "./_components/print-button";

export const dynamic = "force-dynamic";

// The customer's service / inspection report (Task 32): every checklist item
// the mechanic answered, with their notes, plus the photos they took. On an
// inspection this IS the product the customer paid for. Signed-in only
// (/dashboard/* is gated in proxy.ts); ownership proved the way the dashboard
// does it, then read through the service-role client so the job photos
// (booking_media has no customer policy) can be shown too.
//
// Task 48: restyled to mockup 04 "Service report". Same data; still printable
// (the screen header and the "Book a repair" prompt hide in print).

const RESULT_TONE: Record<string, PillTone> = {
  pass: "success",
  checked: "success",
  advisory: "pending",
  fail: "error",
  not_checked: "neutral",
  na: "neutral",
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
    : "Date not set";
  const finished = booking.status === "completed";
  const hasInspection = checklists.some((c) => c.checklist.kind === "inspection");

  return (
    <Screen className="print:max-w-none print:px-0 print:pb-0">
      <div className="print:hidden">
        <PageHeader title="Service report" backHref={`/dashboard/bookings/${booking.id}`} action={<PrintButton />} />
      </div>

      <Stack>
        <div>
          <Overline>{finished ? "Your report" : "Report in progress"}</Overline>
          <h2 className="mt-1 font-display text-2xl font-extrabold leading-[30px] tracking-[-0.6px] text-text-primary">
            {checklists.map((c) => c.name).join(" + ")}
          </h2>
          <Caption className="mt-1">
            Ref {formatJobNumber(booking.job_number)} · {dateLabel}
          </Caption>
        </div>

        <ListCard className="print:shadow-none">
          <DetailRow
            label="Vehicle"
            value={
              <>
                {vehicle} · <span className="font-mono uppercase">{booking.vehicle_reg}</span>
              </>
            }
          />
          <DetailRow
            label="Mileage"
            value={booking.mileage != null ? `${Number(booking.mileage).toLocaleString("en-GB")} miles` : "Not recorded"}
          />
          <DetailRow label="Mechanic" value={mechanic?.full_name ?? "Your mechanic"} />
        </ListCard>

        {checklists.map((list) => {
          const inspection = list.checklist.kind === "inspection";
          const byItem = new Map(list.results.map((r) => [r.item_id, r]));
          return (
            <section key={list.checklist.id} className="flex flex-col gap-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h3 className="font-display text-[17px] font-bold leading-[22px] tracking-[-0.3px] text-text-primary">
                  {list.name}
                </h3>
                <Caption>
                  {list.progress.answered} of {list.progress.total} items
                </Caption>
              </div>

              {inspection && (
                <div className="flex flex-wrap gap-2">
                  <StatusPill tone="success">{list.progress.pass} pass</StatusPill>
                  <StatusPill tone="pending">
                    {list.progress.advisory} {list.progress.advisory === 1 ? "advisory" : "advisories"}
                  </StatusPill>
                  <StatusPill tone="error">{list.progress.fail} fail</StatusPill>
                  <StatusPill tone="neutral">{list.progress.notChecked} not checked</StatusPill>
                </div>
              )}

              {list.sections.map((section) => {
                const rows = (
                  <ListCard className="print:shadow-none">
                    {section.items.map((item) => {
                      const r = byItem.get(item.id);
                      return (
                        <ListRow
                          key={item.id}
                          className="print:break-inside-avoid"
                          title={item.label}
                          titleClassName="font-semibold"
                          caption={r?.comment ? <span className="whitespace-pre-wrap">{r.comment}</span> : undefined}
                          trailing={
                            <StatusPill tone={r ? (RESULT_TONE[r.result] ?? "neutral") : "neutral"}>
                              {r ? resultLabel(r.result) : "Not yet answered"}
                            </StatusPill>
                          }
                        />
                      );
                    })}
                  </ListCard>
                );
                return list.sections.length > 1 ? (
                  <Section key={section.section} title={section.section}>
                    {rows}
                  </Section>
                ) : (
                  <div key={section.section}>{rows}</div>
                );
              })}
            </section>
          );
        })}

        {hasInspection && (
          <Caption className="text-center">
            An advisory is something that will need attention. A fail is defective, unsafe or needs repair.
          </Caption>
        )}

        {photos.length > 0 && (
          <Section title="Photos from your mechanic">
            <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {photos.map((p) => (
                <li key={p.id} className="overflow-hidden rounded-xl border border-border bg-surface-card print:break-inside-avoid">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt="Job photo" className="aspect-square w-full object-cover" />
                </li>
              ))}
            </ul>
          </Section>
        )}

        {finished && checklists.some((c) => c.progress.advisory > 0 || c.progress.fail > 0) && (
          <Notice
            icon={Wrench}
            title="Something needs attention?"
            className="print:hidden"
            action={
              <ButtonLink href={`/book/repairs?reg=${encodeURIComponent(booking.vehicle_reg)}`} size="sm">
                Book a repair
              </ButtonLink>
            }
          >
            Book the repair for {vehicle} and we&apos;ll price it from the manufacturer&apos;s book time.
          </Notice>
        )}
      </Stack>
    </Screen>
  );
}
