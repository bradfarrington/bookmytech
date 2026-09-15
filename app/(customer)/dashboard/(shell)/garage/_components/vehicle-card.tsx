import { Car, CarFront, TriangleAlert, Wrench } from "lucide-react";
import { ButtonLink, Caption, Notice, Panel, Tile } from "@/components/dashboard/ui";
import type { GarageVehicle } from "@/lib/garage/garage";
import { motAlert } from "@/lib/garage/status";
import { cn } from "@/lib/utils";
import {
  bookVehicleHref,
  motAlertTitle,
  motStat,
  taxStat,
  timeAgo,
  vehicleCaption,
  vehicleTitle,
  type StatTone,
} from "../_lib/display";
import { Plate } from "./plate";
import { VehicleMenu } from "./vehicle-menu";

// One vehicle on the Garage screen (mockup 05 "Your garage"): the vehicle, its
// MOT / Tax / Last job stats, the MOT warning, Book and History, and the ⋮.

const STAT_TONES: Record<StatTone, string> = {
  good: "text-green-700",
  warn: "text-amber-700",
  bad: "text-red-700",
  plain: "text-text-primary",
  unset: "text-text-muted",
};

function Stat({
  label,
  value,
  tone,
  align = "start",
}: {
  label: string;
  value: string;
  tone: StatTone;
  align?: "start" | "center" | "end";
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1",
        align === "center" && "items-center text-center",
        align === "end" && "items-end text-right",
      )}
    >
      <Caption>{label}</Caption>
      <div className={cn("text-[13px] font-bold leading-[19px]", STAT_TONES[tone])}>{value}</div>
    </div>
  );
}

/** The vehicle's tile, title, plate and caption: the top of its card, and of its History screen. */
export function VehicleSummary({
  vehicle,
  now,
  trailing,
}: {
  vehicle: GarageVehicle;
  now: Date;
  trailing?: React.ReactNode;
}) {
  const warn = motAlert(vehicle.motExpiryDate, now) !== null;
  const caption = vehicleCaption(vehicle);
  return (
    <div className="flex items-start gap-3">
      <Tile icon={warn ? CarFront : Car} tone={warn ? "warn" : "brand"} size="xl" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold leading-5 text-text-primary">{vehicleTitle(vehicle)}</div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <Plate registration={vehicle.displayRegistration} />
          {caption && <Caption>{caption}</Caption>}
        </div>
      </div>
      {trailing}
    </div>
  );
}

export function VehicleCard({
  vehicle,
  lastJobAt,
  nicknameMax,
  now,
}: {
  vehicle: GarageVehicle;
  lastJobAt: string | null;
  nicknameMax: number;
  now: Date;
}) {
  const alertTitle = motAlertTitle(motAlert(vehicle.motExpiryDate, now));
  const mot = motStat(vehicle.motExpiryDate, now);
  const tax = taxStat(vehicle.taxStatus);
  const lastJob = timeAgo(lastJobAt, now);

  return (
    <Panel>
      <VehicleSummary
        vehicle={vehicle}
        now={now}
        trailing={
          <VehicleMenu
            id={vehicle.id}
            name={vehicleTitle(vehicle)}
            nickname={vehicle.nickname}
            registration={vehicle.displayRegistration}
            nicknameMax={nicknameMax}
          />
        }
      />

      <div className="my-3 h-px bg-border-subtle" />

      <div className="grid grid-cols-3 gap-2">
        <Stat label="MOT" value={mot.value} tone={mot.tone} />
        <Stat label="Tax" value={tax.value} tone={tax.tone} align="center" />
        <Stat label="Last job" value={lastJob ?? "Not set"} tone={lastJob ? "plain" : "unset"} align="end" />
      </div>

      {alertTitle && <Notice tone="warn" icon={TriangleAlert} title={alertTitle} className="mt-3 shadow-none" />}

      <div className="mt-3 flex gap-2">
        <ButtonLink href={bookVehicleHref(vehicle.registration)} size="sm" icon={Wrench} className="flex-1">
          Book
        </ButtonLink>
        <ButtonLink href={`/dashboard/garage/${vehicle.id}`} size="sm" variant="secondary" className="flex-1">
          History
        </ButtonLink>
      </div>
    </Panel>
  );
}
