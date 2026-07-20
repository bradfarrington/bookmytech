import { redirect } from "next/navigation";
import { CalendarRange } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { geocodePostcode, type LatLng } from "@/lib/geo/postcodes";
import { Overline } from "@/components/ui/overline";
import { SPECIALISMS } from "@/lib/specialisms";
import {
  AvailabilityEditor,
  type DayHours,
  type SpecialismTile,
} from "./_components/availability-editor";

export const dynamic = "force-dynamic";

// Mon-first display order, JS day_of_week values.
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

interface AvailRow {
  day_of_week: number;
  is_active: boolean;
  start_time: string | null;
  end_time: string | null;
}

// PG `time` arrives "HH:MM:SS" — trim to the "HH:MM" the input wants.
function hhmm(t: string | null, fallback: string): string {
  if (!t) return fallback;
  return t.slice(0, 5);
}

export default async function MechanicAvailabilityPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/mechanic/login");

  const { data: mechanic } = await supabase
    .from("mechanics")
    .select("service_radius_miles, specialisms, base_postcode")
    .eq("id", user.id)
    .single();

  const { data: availRows } = await supabase
    .from("mechanic_availability")
    .select("day_of_week, is_active, start_time, end_time")
    .eq("mechanic_id", user.id);

  const baseCoords: LatLng | null = await geocodePostcode(mechanic?.base_postcode);

  // Build exactly 7 day rows in Mon-first order.
  const rowByDay = new Map<number, AvailRow>();
  for (const r of (availRows ?? []) as AvailRow[]) rowByDay.set(r.day_of_week, r);

  const initialHours: DayHours[] = DAY_ORDER.map((day) => {
    const r = rowByDay.get(day);
    const isWeekday = day >= 1 && day <= 5;
    return {
      dayOfWeek: day,
      // Default: weekdays on, weekends off — only used until the mechanic saves.
      isActive: r ? r.is_active : isWeekday,
      startTime: hhmm(r?.start_time ?? null, "08:00"),
      endTime: hhmm(r?.end_time ?? null, "18:00"),
    };
  });

  const specialismTiles: SpecialismTile[] = SPECIALISMS;

  return (
    <div className="space-y-6">
      <header>
        <Overline>Mechanic</Overline>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold tracking-tight text-text-primary">
          <CalendarRange size={22} className="text-brand-blue" />
          Availability
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          Set your working hours, how far you&apos;ll travel, and your specialisms.
        </p>
      </header>

      <AvailabilityEditor
        basePostcode={mechanic?.base_postcode ?? null}
        baseCoords={baseCoords}
        initialRadius={mechanic?.service_radius_miles ?? 10}
        initialHours={initialHours}
        initialSpecialisms={Array.isArray(mechanic?.specialisms) ? mechanic.specialisms : []}
        specialisms={specialismTiles}
      />
    </div>
  );
}
