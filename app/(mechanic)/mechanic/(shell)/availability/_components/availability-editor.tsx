"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Clock, Ruler, Wrench, Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AreaMap } from "@/app/(mechanic)/mechanic/(shell)/jobs/_components/area-map";
import type { LatLng } from "@/lib/geo/postcodes";
import {
  updateAvailability,
  updateServiceRadius,
  updateSpecialisms,
  type AvailabilityRowInput,
} from "@/app/actions/mechanic-profile";

export interface DayHours {
  dayOfWeek: number; // 0..6
  isActive: boolean;
  startTime: string; // "HH:MM"
  endTime: string;
}

export interface SpecialismTile {
  slug: string;
  name: string;
}

export interface AvailabilityEditorProps {
  basePostcode: string | null;
  baseCoords: LatLng | null;
  initialRadius: number;
  initialHours: DayHours[]; // exactly 7, Mon-first order
  initialSpecialisms: string[];
  specialisms: SpecialismTile[];
}

const DAY_LABEL: Record<number, string> = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
  0: "Sunday",
};

export function AvailabilityEditor(props: AvailabilityEditorProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <WorkingHours initialHours={props.initialHours} />
        <Specialisms
          tiles={props.specialisms}
          initialSelected={props.initialSpecialisms}
        />
      </div>
      <div>
        <ServiceRadius
          basePostcode={props.basePostcode}
          baseCoords={props.baseCoords}
          initialRadius={props.initialRadius}
        />
      </div>
    </div>
  );
}

// --- Working hours ----------------------------------------------------------
function WorkingHours({ initialHours }: { initialHours: DayHours[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [hours, setHours] = useState<DayHours[]>(initialHours);

  function patch(dayOfWeek: number, next: Partial<DayHours>) {
    setHours((prev) =>
      prev.map((h) => (h.dayOfWeek === dayOfWeek ? { ...h, ...next } : h)),
    );
  }

  function save() {
    const payload: AvailabilityRowInput[] = hours.map((h) => ({
      dayOfWeek: h.dayOfWeek,
      isActive: h.isActive,
      startTime: h.isActive ? h.startTime : null,
      endTime: h.isActive ? h.endTime : null,
    }));
    startTransition(async () => {
      const res = await updateAvailability(payload);
      if (res.ok) {
        toast.success("Working hours saved.");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Card padded={false}>
      <SectionHeader icon={Clock} title="Working hours">
        When you&apos;re generally available for jobs.
      </SectionHeader>
      <div className="divide-y divide-border-subtle">
        {hours.map((h) => (
          <div key={h.dayOfWeek} className="flex items-center gap-4 px-5 py-3">
            <button
              type="button"
              role="switch"
              aria-checked={h.isActive}
              aria-label={`${DAY_LABEL[h.dayOfWeek]} available`}
              onClick={() => patch(h.dayOfWeek, { isActive: !h.isActive })}
              className={cn(
                "relative h-6 w-10 shrink-0 rounded-full transition-colors",
                h.isActive ? "bg-brand-blue" : "bg-border",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 size-5 rounded-full bg-white shadow transition-all",
                  h.isActive ? "left-[18px]" : "left-0.5",
                )}
              />
            </button>
            <span
              className={cn(
                "w-24 shrink-0 text-sm font-semibold",
                h.isActive ? "text-text-primary" : "text-text-muted",
              )}
            >
              {DAY_LABEL[h.dayOfWeek]}
            </span>
            {h.isActive ? (
              <div className="flex items-center gap-2 text-sm">
                <TimeInput
                  value={h.startTime}
                  onChange={(v) => patch(h.dayOfWeek, { startTime: v })}
                />
                <span className="text-text-muted">to</span>
                <TimeInput
                  value={h.endTime}
                  onChange={(v) => patch(h.dayOfWeek, { endTime: v })}
                />
              </div>
            ) : (
              <span className="text-sm text-text-muted">Unavailable</span>
            )}
          </div>
        ))}
      </div>
      <div className="flex justify-end border-t border-border px-5 py-3">
        <Button size="sm" onClick={save} disabled={pending} iconLeft={Check}>
          Save hours
        </Button>
      </div>
    </Card>
  );
}

function TimeInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="time"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-button border border-border bg-surface-card px-2.5 py-1.5 text-sm text-text-primary focus:border-brand-blue focus:outline-none"
    />
  );
}

// --- Service radius + live map preview --------------------------------------
function ServiceRadius({
  basePostcode,
  baseCoords,
  initialRadius,
}: {
  basePostcode: string | null;
  baseCoords: LatLng | null;
  initialRadius: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [radius, setRadius] = useState(initialRadius);
  const dirty = radius !== initialRadius;

  function save() {
    startTransition(async () => {
      const res = await updateServiceRadius(radius);
      if (res.ok) {
        toast.success(`Service radius set to ${radius} miles.`);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="space-y-3">
      <AreaMap
        basePostcode={basePostcode}
        baseCoords={baseCoords}
        radiusMiles={radius}
        pins={[]}
        jobsInArea={0}
      />
      <Card className="space-y-3 p-5">
        <div className="flex items-center gap-2">
          <Ruler size={16} className="text-brand-blue" />
          <h2 className="text-sm font-bold tracking-tight text-text-primary">
            Service radius
          </h2>
          <span className="ml-auto text-sm font-bold text-brand-blue">
            {radius} mi
          </span>
        </div>
        <input
          type="range"
          min={2}
          max={20}
          step={1}
          value={radius}
          onChange={(e) => setRadius(Number(e.target.value))}
          className="w-full accent-brand-blue"
          aria-label="Service radius in miles"
        />
        <div className="flex justify-between text-[11px] text-text-muted">
          <span>2 mi</span>
          <span>20 mi</span>
        </div>
        <Button size="sm" fullWidth onClick={save} disabled={pending || !dirty}>
          {dirty ? "Save radius" : "Saved"}
        </Button>
        {!basePostcode && (
          <p className="text-xs text-text-muted">
            Add a base postcode in your profile to preview your area on the map.
          </p>
        )}
      </Card>
    </div>
  );
}

// --- Specialisms grid -------------------------------------------------------
function Specialisms({
  tiles,
  initialSelected,
}: {
  tiles: SpecialismTile[];
  initialSelected: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelected));

  function toggle(slug: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  function save() {
    startTransition(async () => {
      const res = await updateSpecialisms(Array.from(selected));
      if (res.ok) {
        toast.success("Specialisms updated.");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Card padded={false}>
      <SectionHeader icon={Wrench} title="Specialisms">
        The work you&apos;re strongest at — shown on your profile. You&apos;re
        offered every job in your travel range either way.
      </SectionHeader>
      <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-3">
        {tiles.map((t) => {
          const on = selected.has(t.slug);
          return (
            <button
              key={t.slug}
              type="button"
              onClick={() => toggle(t.slug)}
              aria-pressed={on}
              className={cn(
                "flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors",
                on
                  ? "border-brand-blue bg-blue-50"
                  : "border-border bg-surface-card hover:bg-surface",
              )}
            >
              <span className="flex w-full items-center justify-between gap-2">
                <span
                  className={cn(
                    "text-sm font-semibold",
                    on ? "text-brand-blue-dark" : "text-text-primary",
                  )}
                >
                  {t.name}
                </span>
                {on && <Check size={14} className="shrink-0 text-brand-blue" />}
              </span>
            </button>
          );
        })}
        {tiles.length === 0 && (
          <p className="col-span-full text-sm text-text-muted">
            No specialisms defined.
          </p>
        )}
      </div>
      <div className="flex justify-end border-t border-border px-5 py-3">
        <Button size="sm" onClick={save} disabled={pending} iconLeft={Check}>
          Save specialisms
        </Button>
      </div>
    </Card>
  );
}

// --- shared -----------------------------------------------------------------
function SectionHeader({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Clock;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-border px-5 py-4">
      <div className="flex items-center gap-2">
        <Icon size={16} className="text-brand-blue" />
        <h2 className="text-[15px] font-bold text-text-primary">{title}</h2>
      </div>
      <p className="mt-0.5 text-xs text-text-muted">{children}</p>
    </div>
  );
}
