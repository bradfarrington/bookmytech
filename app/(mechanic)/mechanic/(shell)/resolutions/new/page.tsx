import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { CaseForm, type CaseJobOption, type CaseReasonOption } from "@/components/resolutions/case-form";
import { formatJobNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

// One-to-one Supabase joins arrive typed as arrays; normalise to a single row.
function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export default async function MechanicNewCasePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/mechanic/login");

  // Any job assigned to this mechanic (RLS also scopes bookings to them).
  const { data: bookings } = await supabase
    .from("bookings")
    .select("id, job_number, scheduled_at, service:services(name)")
    .eq("mechanic_id", user.id)
    .order("scheduled_at", { ascending: false });

  const jobs: CaseJobOption[] = (bookings ?? []).map((b) => {
    const svc = one(b.service as never as { name?: string })?.name ?? "Job";
    const when = b.scheduled_at
      ? new Date(b.scheduled_at).toLocaleDateString("en-GB", {
          weekday: "short",
          day: "numeric",
          month: "short",
        })
      : "";
    return {
      value: b.id,
      label: `#${formatJobNumber(b.job_number)} · ${svc}${when ? ` · ${when}` : ""}`,
    };
  });

  const { data: reasonRows } = await supabase
    .from("resolution_reasons")
    .select("id, label")
    .eq("active", true)
    .order("sort_order", { ascending: true });

  const reasons: CaseReasonOption[] = (reasonRows ?? []).map((r) => ({
    value: r.id,
    label: r.label,
  }));

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <Link
        href="/mechanic/resolutions"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft size={15} />
        Back to Resolution Center
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Raise a case</h1>
        <p className="text-text-secondary">
          Pick the job, choose a reason, and tell us what&apos;s going on.
        </p>
      </div>
      <CaseForm jobs={jobs} reasons={reasons} redirectBase="/mechanic/resolutions" />
    </div>
  );
}
