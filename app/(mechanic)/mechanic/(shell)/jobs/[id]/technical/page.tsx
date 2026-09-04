import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, BookOpen, ClipboardList } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cn } from "@/lib/utils";
import { Overline } from "@/components/ui/overline";
import { DataPanel, ManualsPanel } from "@/components/haynespro/technical-panels";
import { isHaynesProConfigured } from "@/lib/haynespro/client";
import { resolveVehicle } from "@/lib/haynespro/vehicle";

// The manufacturer's repair manuals and technical data for a job's vehicle,
// shown INSIDE the mechanic dashboard (Task 27). Task 16 Stage F sent
// mechanics out to HaynesPro's WorkshopData site via SSO; the owner doesn't
// want anyone sent to HaynesPro, and the admin model page already rendered
// the same data in-app, so this reuses those panels for the booking's car.
//
// Access: the booking must be the mechanic's own — read under their RLS.

export const dynamic = "force-dynamic";

const TABS = [
  { key: "manuals", label: "Repair manuals", icon: BookOpen },
  { key: "data", label: "Technical data", icon: ClipboardList },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default async function MechanicJobTechnicalPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; story?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/mechanic/login");

  // RLS scopes this to the mechanic's own bookings.
  const { data: booking } = await supabase
    .from("bookings")
    .select("id, mechanic_id, vehicle_reg, vehicle_make, vehicle_model, repair_description")
    .eq("id", id)
    .maybeSingle();
  if (!booking || booking.mechanic_id !== user.id) notFound();

  const tab: TabKey = (TABS.find((t) => t.key === query.tab)?.key ?? "manuals") as TabKey;
  const base = `/mechanic/jobs/${booking.id}/technical`;
  const tabHref = (key: TabKey) => `${base}?tab=${key}`;
  const vehicleLabel = [booking.vehicle_make, booking.vehicle_model].filter(Boolean).join(" ") || "this vehicle";

  // The booking's car type, from the same reg → HaynesPro resolution the
  // funnel priced it with (cached per reg).
  const vehicle =
    isHaynesProConfigured() && booking.vehicle_reg
      ? await resolveVehicle(booking.vehicle_reg, createAdminClient())
      : null;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        href={`/mechanic/jobs/${booking.id}`}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft size={15} />
        Back to job
      </Link>

      <header>
        <Overline>Technical data</Overline>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-text-primary">
          {vehicle?.description ?? vehicleLabel}
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          {booking.vehicle_reg}
          {booking.repair_description ? ` · ${booking.repair_description}` : ""}
        </p>
      </header>

      {!vehicle || vehicle.carTypeId == null ? (
        <div className="rounded-button border border-border bg-surface-card px-4 py-8 text-center text-sm text-text-muted">
          We couldn&apos;t match this vehicle to the manufacturer data, so there are no manuals
          to show for it.
        </div>
      ) : (
        <>
          <nav className="flex flex-wrap gap-2 border-b border-border pb-px">
            {TABS.map(({ key, label, icon: Icon }) => (
              <Link
                key={key}
                href={tabHref(key)}
                className={cn(
                  "flex items-center gap-2 rounded-t-lg border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors",
                  tab === key
                    ? "border-brand-blue text-brand-blue"
                    : "border-transparent text-text-secondary hover:text-text-primary",
                )}
              >
                <Icon size={15} />
                {label}
              </Link>
            ))}
          </nav>

          {tab === "manuals" ? (
            <ManualsPanel
              carTypeId={vehicle.carTypeId}
              storyId={query.story}
              hrefs={{
                list: tabHref("manuals"),
                story: (storyId) => `${tabHref("manuals")}&story=${storyId}`,
              }}
            />
          ) : (
            <DataPanel carTypeId={vehicle.carTypeId} />
          )}
        </>
      )}
    </div>
  );
}
