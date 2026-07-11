import { createClient } from "@/lib/supabase/server";
import { Overline } from "@/components/ui/overline";
import { BookingsTable, type BookingRow } from "./_components/bookings-table";

export const dynamic = "force-dynamic";

function vehicleLabel(reg: string | null, make: string | null, model: string | null): string {
  const parts = [make, model].filter(Boolean).join(" ");
  if (reg && parts) return `${reg} · ${parts}`;
  return reg || parts || "—";
}

export default async function AdminJobsPage() {
  const supabase = await createClient();

  const { data: bookingsRaw } = await supabase
    .from("bookings")
    .select(
      "id, job_number, status, area, total_pence, customer_name, vehicle_reg, vehicle_make, vehicle_model, mechanic_id, service_id, repair_description, scheduled_at, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(1000);

  const bookings = bookingsRaw ?? [];

  const serviceIds = [...new Set(bookings.map((b) => b.service_id).filter(Boolean))];
  const mechanicIds = [...new Set(bookings.map((b) => b.mechanic_id).filter(Boolean))];

  const [{ data: allServices }, { data: mechProfiles }] = await Promise.all([
    supabase.from("services").select("id, name").order("display_order"),
    mechanicIds.length
      ? supabase.from("profiles").select("id, full_name").in("id", mechanicIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
  ]);

  const serviceName = new Map((allServices ?? []).map((s) => [s.id, s.name]));
  const mechanicName = new Map((mechProfiles ?? []).map((p) => [p.id, p.full_name]));

  const rows: BookingRow[] = bookings.map((b) => ({
    id: b.id,
    jobNumber: b.job_number,
    service: b.repair_description ?? serviceName.get(b.service_id) ?? "Unknown service",
    serviceId: b.service_id,
    customer: b.customer_name ?? "—",
    vehicle: vehicleLabel(b.vehicle_reg, b.vehicle_make, b.vehicle_model),
    area: b.area,
    mechanic: b.mechanic_id ? mechanicName.get(b.mechanic_id) ?? "Assigned" : null,
    status: b.status,
    totalPence: b.total_pence ?? 0,
    scheduledAt: b.scheduled_at,
  }));

  // Filter options — only services that actually appear, plus distinct areas.
  const usedServices = (allServices ?? []).filter((s) => serviceIds.includes(s.id));
  const areas = [
    ...new Set(bookings.map((b) => b.area).filter((a): a is string => Boolean(a))),
  ].sort();

  return (
    <div className="space-y-6">
      <header>
        <Overline>Operations</Overline>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-text-primary">
          All jobs
        </h1>
        <p className="mt-1.5 text-sm text-text-muted">
          Every booking placed through Book My Tech. Click a row for full detail,
          timeline, and actions.
        </p>
      </header>

      <BookingsTable bookings={rows} services={usedServices} areas={areas} />
    </div>
  );
}
