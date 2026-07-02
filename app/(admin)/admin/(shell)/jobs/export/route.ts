import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { formatJobNumber } from "@/lib/utils";

// CSV export of bookings. A GET route handler (not client-side generation) so
// customer PII is only ever assembled server-side under the admin's session.
// Mirrors the list filters via query params: ?tab=&area=&service=&q=.

export const dynamic = "force-dynamic";

const LIVE_STATUSES = new Set(["confirmed", "en_route", "in_progress"]);

function matchesTab(status: string, tab: string | null): boolean {
  switch (tab) {
    case "live":
      return LIVE_STATUSES.has(status);
    case "pending":
      return status === "sourcing_mechanic";
    case "complete":
      return status === "completed";
    case "disputed":
      return status === "disputed";
    default:
      return true; // "all" or absent
  }
}

// RFC-4180-ish: quote fields, double embedded quotes.
function csvCell(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();

  // Defence in depth — middleware already gates /admin/*, but re-check here.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") return new Response("Forbidden", { status: 403 });

  const { searchParams } = new URL(request.url);
  const tab = searchParams.get("tab");
  const area = searchParams.get("area");
  const service = searchParams.get("service");
  const q = (searchParams.get("q") ?? "").trim().toLowerCase();

  const { data: bookingsRaw } = await supabase
    .from("bookings")
    .select(
      "id, job_number, status, area, total_pence, customer_name, customer_email, vehicle_reg, vehicle_make, vehicle_model, postcode, mechanic_id, service_id, scheduled_at, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(5000);

  const bookings = bookingsRaw ?? [];

  const serviceIds = [...new Set(bookings.map((b) => b.service_id).filter(Boolean))];
  const mechanicIds = [...new Set(bookings.map((b) => b.mechanic_id).filter(Boolean))];

  const [{ data: services }, { data: mechProfiles }] = await Promise.all([
    serviceIds.length
      ? supabase.from("services").select("id, name").in("id", serviceIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    mechanicIds.length
      ? supabase.from("profiles").select("id, full_name").in("id", mechanicIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
  ]);

  const serviceName = new Map((services ?? []).map((s) => [s.id, s.name]));
  const mechanicName = new Map((mechProfiles ?? []).map((p) => [p.id, p.full_name]));

  const filtered = bookings.filter((b) => {
    if (!matchesTab(b.status, tab)) return false;
    if (area && b.area !== area) return false;
    if (service && b.service_id !== service) return false;
    if (q) {
      const hay = `${formatJobNumber(b.job_number)} ${b.id} ${b.customer_name ?? ""} ${b.vehicle_reg ?? ""} ${b.vehicle_make ?? ""} ${b.vehicle_model ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const header = [
    "Ref",
    "Created",
    "Scheduled",
    "Status",
    "Service",
    "Customer",
    "Email",
    "Vehicle reg",
    "Vehicle",
    "Postcode",
    "Area",
    "Mechanic",
    "Value (GBP)",
  ];

  const lines = [header.map(csvCell).join(",")];
  for (const b of filtered) {
    lines.push(
      [
        formatJobNumber(b.job_number),
        b.created_at,
        b.scheduled_at ?? "",
        b.status,
        serviceName.get(b.service_id) ?? "",
        b.customer_name ?? "",
        b.customer_email ?? "",
        b.vehicle_reg ?? "",
        [b.vehicle_make, b.vehicle_model].filter(Boolean).join(" "),
        b.postcode ?? "",
        b.area ?? "",
        b.mechanic_id ? mechanicName.get(b.mechanic_id) ?? "Assigned" : "",
        ((b.total_pence ?? 0) / 100).toFixed(2),
      ]
        .map(csvCell)
        .join(","),
    );
  }

  const csv = lines.join("\r\n");
  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="bookmytech-jobs-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
