import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { formatJobNumber } from "@/lib/utils";
import { applyJobFilters, parseJobTab, sanitiseJobSearch } from "@/lib/admin/job-filters";

// CSV export of bookings. A GET route handler (not client-side generation) so
// customer PII is only ever assembled server-side under the admin's session.
// Mirrors the list filters via query params: ?tab=&area=&q=.
//
// It used to fetch `.limit(5000)` and filter in JS — booking 5001 was silently
// absent from the file, with nothing to tell you. Now it applies the same SQL
// filters as the list (shared via lib/admin/job-filters.ts) and streams the
// result a page at a time, so the export is the complete matching set at any
// size and never holds it all in memory.

export const dynamic = "force-dynamic";

const BATCH_SIZE = 500;

// RFC-4180-ish: quote fields, double embedded quotes.
function csvCell(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

const HEADER = [
  "Ref",
  "Created",
  "Scheduled",
  "Status",
  "Repair",
  "Customer",
  "Email",
  "Vehicle reg",
  "Vehicle",
  "Postcode",
  "Area",
  "Mechanic",
  "Value (GBP)",
];

export async function GET(request: NextRequest) {
  const supabase = await createClient();

  // Defence in depth — proxy already gates /admin/*, but re-check here.
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
  const tab = parseJobTab(searchParams.get("tab"));
  const areaParam = searchParams.get("area");
  const area = areaParam && areaParam !== "all" ? areaParam : null;
  const search = sanitiseJobSearch(searchParams.get("q"));

  // Mechanic names are looked up per batch and cached — the roster is small, and
  // this keeps the memory profile flat however many bookings are exported.
  const mechanicName = new Map<string, string>();
  async function resolveMechanics(ids: string[]) {
    const missing = ids.filter((id) => !mechanicName.has(id));
    if (!missing.length) return;
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", missing);
    for (const id of missing) mechanicName.set(id, "Assigned");
    for (const p of data ?? []) {
      if (p.full_name) mechanicName.set(p.id, p.full_name);
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode(HEADER.map(csvCell).join(",") + "\r\n"));

        for (let offset = 0; ; offset += BATCH_SIZE) {
          const query = supabase
            .from("bookings")
            .select(
              "id, job_number, status, area, total_pence, customer_name, customer_email, vehicle_reg, vehicle_make, vehicle_model, postcode, mechanic_id, repair_description, scheduled_at, created_at",
            );

          const { data, error } = await applyJobFilters(query, { tab, area, search })
            .order("created_at", { ascending: false })
            // Stable tiebreak — without it a batch boundary can repeat or skip
            // rows that share a created_at.
            .order("id", { ascending: true })
            .range(offset, offset + BATCH_SIZE - 1);

          if (error) throw new Error(error.message);
          const batch = data ?? [];
          if (batch.length === 0) break;

          await resolveMechanics(
            [...new Set(batch.map((b) => b.mechanic_id).filter(Boolean))] as string[],
          );

          const lines = batch.map((b) =>
            [
              formatJobNumber(b.job_number),
              b.created_at,
              b.scheduled_at ?? "",
              b.status,
              b.repair_description ?? "",
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
          controller.enqueue(encoder.encode(lines.join("\r\n") + "\r\n"));

          if (batch.length < BATCH_SIZE) break;
        }

        controller.close();
      } catch (err) {
        // The response has already started, so we can't switch to a 500 — put a
        // visible marker in the file rather than truncating it silently.
        console.error("Jobs CSV export failed", err);
        controller.enqueue(
          encoder.encode(
            `"EXPORT INCOMPLETE — an error occurred, this file is missing rows."\r\n`,
          ),
        );
        controller.close();
      }
    },
  });

  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="bookmytech-jobs-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
