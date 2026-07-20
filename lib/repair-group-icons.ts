import {
  Armchair,
  BatteryCharging,
  Cable,
  Car,
  CircleDot,
  CloudRain,
  Cog,
  Disc,
  DoorOpen,
  Droplets,
  Fan,
  Flame,
  Fuel,
  Gauge,
  KeyRound,
  Lightbulb,
  LifeBuoy,
  MoveVertical,
  Radio,
  Settings,
  Settings2,
  ShieldCheck,
  Snowflake,
  Thermometer,
  Wind,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";

// Icon for a HaynesPro repair-tree group, matched on keywords in the group's
// description ("Engine assembly", "Cooling system", …). Group names are
// HaynesPro's own and vary per vehicle, so this is a best-effort keyword map —
// first match wins (most specific keywords first), Wrench is the fallback.

const KEYWORD_ICONS: ReadonlyArray<[RegExp, LucideIcon]> = [
  [/air conditioning|climate/i, Snowflake],
  [/air inlet|intake|turbo|supercharg/i, Wind],
  [/starting|charging|battery|alternator|starter/i, BatteryCharging],
  [/electric/i, Zap], // "Engine electrical systems", "Electrical systems"
  [/lubricat|\boil\b/i, Droplets],
  [/cooling|radiator|coolant/i, Thermometer],
  [/fuel/i, Fuel],
  [/exhaust|emission/i, Flame],
  [/transmission|clutch|\bcvt\b|gearbox/i, Settings],
  [/drivetrain|axle|driveshaft|differential|propshaft/i, Settings2],
  [/steering/i, LifeBuoy],
  [/suspension/i, MoveVertical],
  [/brake/i, Disc],
  [/wheel|tyre|tire/i, CircleDot],
  [/instrument|gauge|dashboard/i, Gauge],
  [/light|lamp/i, Lightbulb],
  [/wiper|washer/i, CloudRain],
  [/lock|key|anti-theft|alarm|immobilis/i, KeyRound],
  [/seat|interior|trim|upholster/i, Armchair],
  [/door|tailgate|bonnet|boot|hood/i, DoorOpen],
  [/restraint|airbag|seat belt|safety/i, ShieldCheck],
  [/audio|radio|navigation|infotainment|telephone|speaker/i, Radio],
  [/heating|ventilation|blower/i, Fan],
  [/wiring|harness|cable/i, Cable],
  [/body|panel|bumper|wing|grille|glass|window|mirror/i, Car],
  [/engine/i, Cog], // generic — after every engine-* specific match above
];

export function repairGroupIcon(description: string | null | undefined): LucideIcon {
  const text = (description ?? "").trim();
  if (text) {
    for (const [pattern, icon] of KEYWORD_ICONS) {
      if (pattern.test(text)) return icon;
    }
  }
  return Wrench;
}
