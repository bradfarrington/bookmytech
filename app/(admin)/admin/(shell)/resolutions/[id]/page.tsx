import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { StatusPill } from "@/components/resolutions/status-pill";
import { CaseThread } from "@/components/resolutions/case-thread";
import { AdminCaseActions } from "@/components/resolutions/admin-actions";
import { CustomerComms, type TemplateOption } from "@/components/resolutions/customer-comms";
import { loadCase, loadMessages } from "@/lib/resolutions/load";
import { EMAIL_TEMPLATE_DEFS } from "@/emails/registry";
import { SMS_TEMPLATE_DEFS } from "@/lib/sms/templates";

export const dynamic = "force-dynamic";

const emailTemplates: TemplateOption[] = EMAIL_TEMPLATE_DEFS.filter(
  (t) => t.category === "customer",
).map((t) => ({ value: t.key, label: t.label }));

const smsTemplates: TemplateOption[] = SMS_TEMPLATE_DEFS.map((t) => ({
  value: t.key,
  label: t.label,
}));

export default async function AdminCasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const kase = await loadCase(supabase, id);
  if (!kase) notFound();
  const messages = await loadMessages(supabase, id);

  const { data: booking } = await supabase
    .from("bookings")
    .select(
      "id, status, customer_name, customer_email, customer_phone, vehicle_reg, repair_description",
    )
    .eq("id", kase.bookingId)
    .maybeSingle();

  const { data: mechanic } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", kase.mechanicId)
    .maybeSingle();

  const svc = booking?.repair_description ?? "Vehicle repair";
  const bookingStatus = booking?.status as string | undefined;
  const canRedistribute =
    bookingStatus != null && bookingStatus !== "completed" && bookingStatus !== "cancelled";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/admin/resolutions"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft size={15} />
        Back to Resolution Center
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">{kase.reasonLabel}</h1>
          <p className="text-sm text-text-muted">
            Raised by {kase.openedByRole === "admin" ? "an admin" : "the mechanic"} ·{" "}
            {new Date(kase.createdAt).toLocaleString("en-GB", {
              day: "numeric",
              month: "short",
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>
        </div>
        <StatusPill status={kase.status} />
      </div>

      {/* Job + parties */}
      <div className="grid gap-3 rounded-2xl border border-border bg-surface-card p-5 sm:grid-cols-2">
        <Detail label="Job">
          <Link href={`/admin/jobs/${kase.bookingId}`} className="text-brand-blue hover:underline">
            #{kase.shortRef} · {svc}
          </Link>
        </Detail>
        <Detail label="Mechanic">{mechanic?.full_name ?? "—"}</Detail>
        <Detail label="Customer">{booking?.customer_name ?? "—"}</Detail>
        <Detail label="Vehicle">{booking?.vehicle_reg ?? "—"}</Detail>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
          What happened
        </p>
        <p className="mt-1 whitespace-pre-wrap text-sm text-text-primary">{kase.description}</p>
      </div>

      <AdminCaseActions
        caseId={id}
        status={kase.status}
        redistributed={kase.redistributed}
        canRedistribute={canRedistribute}
      />

      <div>
        <h2 className="mb-3 text-sm font-bold text-text-primary">Notify the customer</h2>
        <CustomerComms
          caseId={id}
          emailTemplates={emailTemplates}
          smsTemplates={smsTemplates}
          hasEmail={!!booking?.customer_email}
          hasPhone={!!booking?.customer_phone}
        />
      </div>

      <div className="rounded-2xl border border-border bg-surface-card p-5">
        <CaseThread caseId={id} messages={messages} viewerRole="admin" />
      </div>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-text-primary">{children}</p>
    </div>
  );
}
