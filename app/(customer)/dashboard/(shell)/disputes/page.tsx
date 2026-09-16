import { redirect } from "next/navigation";
import { Scale } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ownsBooking } from "@/lib/bookings/ownership";
import {
  DISPUTE_STATUS_LABELS,
  REASON_LABELS,
  type DisputeStatus,
} from "@/lib/disputes/constants";
import { formatJobNumber, formatPrice } from "@/lib/utils";
import {
  ButtonLink,
  EmptyState,
  ListCard,
  ListRow,
  PageHeader,
  Screen,
  Section,
  Stack,
  StatusPill,
  type PillTone,
} from "@/components/dashboard/ui";

// Every dispute this customer has raised, open and closed.
//
// The dashboard surfaces OPEN disputes only, because those are the ones waiting
// on somebody. This is the full history, and the reason it exists at all: until
// now a resolved case was unreachable once its job scrolled out of Past jobs —
// there was no page listing them and no link to one.
//
// Task 48: inside the dashboard shell (which renders the header), restyled with
// the dashboard building blocks.

export const dynamic = "force-dynamic";

const OPEN_STATUSES = ["opened", "responded", "escalated"];

// The same palette as DISPUTE_STATUS_TONES (amber / blue / red / green / grey), as pill tones.
const STATUS_TONE: Record<DisputeStatus, PillTone> = {
  opened: "pending",
  responded: "active",
  escalated: "error",
  resolved: "success",
  withdrawn: "neutral",
};

export default async function CustomerDisputesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();

  // Service-role, scoped to this user's own bookings — same pattern as the
  // dashboard, which needs joins the customer's own RLS grant can't see.
  const { data: rows } = await admin
    .from("disputes")
    .select(
      `id, status, reason_category, created_at, resolved_at, refund_requested_pence,
       resolution_refund_pence,
       booking:bookings!inner(job_number, repair_description, customer_id, customer_email)`,
    )
    .order("created_at", { ascending: false });

  const caller = { userId: user.id, email: user.email ?? null };

  const mine: DisputeRowView[] = [];
  for (const d of rows ?? []) {
    // PostgREST returns the embedded booking as either an object or a
    // single-element array depending on how it infers the relationship, so
    // normalise it once here instead of at every use.
    const b = (Array.isArray(d.booking) ? d.booking[0] : d.booking) as
      | { job_number: number | null; repair_description: string | null; customer_id: string | null; customer_email: string | null }
      | undefined;
    if (!b) continue;

    // Ownership is filtered here rather than in the query: an `or` across an
    // embedded table isn't expressible as one PostgREST filter. The rule is the
    // shared `ownsBooking`, not a local copy of it — this one used to compare
    // the email case-insensitively, which made it very slightly LOOSER than the
    // "Customers can view own bookings" policy it is meant to mirror.
    if (!ownsBooking(b, caller)) continue;

    mine.push({
      id: d.id,
      status: d.status as DisputeStatus,
      reasonCategory: d.reason_category,
      createdAt: d.created_at,
      refundedPence: d.resolution_refund_pence ?? null,
      jobNumber: b.job_number,
      repairDescription: b.repair_description ?? "Vehicle repair",
    });
  }

  const open = mine.filter((d) => OPEN_STATUSES.includes(d.status));
  const closed = mine.filter((d) => !OPEN_STATUSES.includes(d.status));

  return (
    <Screen>
      <PageHeader title="Your disputes" backHref="/dashboard" />
      <Stack>
        <p className="text-sm leading-5 text-text-secondary">
          Cases you&apos;ve raised about a job, and how each one was settled.
        </p>

        {mine.length === 0 ? (
          <EmptyState
            icon={Scale}
            title="No disputes"
            body="If something isn't right with a job, you can raise a dispute from that booking for 48 hours after it's completed."
            action={
              <ButtonLink href="/dashboard" variant="secondary">
                Back to your bookings
              </ButtonLink>
            }
          />
        ) : (
          <>
            {open.length > 0 && <DisputeGroup heading="Open" rows={open} />}
            {closed.length > 0 && <DisputeGroup heading="Closed" rows={closed} />}
          </>
        )}
      </Stack>
    </Screen>
  );
}

type DisputeRowView = {
  id: string;
  status: DisputeStatus;
  reasonCategory: string;
  createdAt: string;
  refundedPence: number | null;
  jobNumber: number | null;
  repairDescription: string;
};

function DisputeGroup({ heading, rows }: { heading: string; rows: DisputeRowView[] }) {
  return (
    <Section title={heading}>
      <ListCard>
        {rows.map((d) => (
          <ListRow
            key={d.id}
            href={`/dashboard/disputes/${d.id}`}
            chevron
            title={<span className="block truncate">{d.repairDescription}</span>}
            caption={
              <>
                {REASON_LABELS[d.reasonCategory] ?? d.reasonCategory}
                {d.jobNumber != null && <> · Job {formatJobNumber(d.jobNumber)}</>}
                {" · "}
                Raised{" "}
                {new Date(d.createdAt).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  timeZone: "Europe/London",
                })}
                {d.refundedPence != null && d.refundedPence > 0 && (
                  <span className="mt-0.5 block font-semibold text-green-700">{formatPrice(d.refundedPence)} refunded</span>
                )}
              </>
            }
            trailing={<StatusPill tone={STATUS_TONE[d.status] ?? "neutral"}>{DISPUTE_STATUS_LABELS[d.status] ?? d.status}</StatusPill>}
          />
        ))}
      </ListCard>
    </Section>
  );
}
