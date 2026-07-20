import {
  Armchair,
  BatteryCharging,
  Cable,
  Car,
  CircleDot,
  ClipboardCheck,
  CloudRain,
  Cog,
  Disc,
  DoorOpen,
  Droplets,
  Fan,
  Flame,
  Footprints,
  Fuel,
  Gauge,
  KeyRound,
  Lightbulb,
  LifeBuoy,
  MoveVertical,
  Paintbrush,
  Puzzle,
  Radar,
  Radio,
  Settings,
  Settings2,
  Shield,
  ShieldCheck,
  Snowflake,
  Sparkles,
  Thermometer,
  Truck,
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
  [/air conditioning|climate|hvac/i, Snowflake],
  [/air inlet|intake|turbo|supercharg/i, Wind],
  [/compressed air|pneumatic/i, Wind],
  [/starting|charging|battery|alternator|starter/i, BatteryCharging],
  [/driver.assistance|adas/i, Radar],
  [/security/i, Shield],
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
  [/pedal/i, Footprints],
  [/wheel|tyre|tire/i, CircleDot],
  [/instrument|gauge|dashboard/i, Gauge],
  [/light|lamp/i, Lightbulb],
  [/wip|wash/i, CloudRain], // "Wash/wipe system", wipers, washers
  [/lock|key|anti-theft|alarm|immobilis/i, KeyRound],
  [/seat|interior|trim|upholster/i, Armchair],
  [/door|tailgate|bonnet|boot|hood/i, DoorOpen],
  [/restraint|airbag|seat belt|safety/i, ShieldCheck],
  [/audio|radio|navigation|infotainment|telephone|speaker/i, Radio],
  [/heating|ventilation|blower/i, Fan],
  [/wiring|harness|cable/i, Cable],
  [/inspection|servicing/i, ClipboardCheck],
  [/tow|breakdown/i, Truck],
  [/paint/i, Paintbrush],
  [/accessor|retrofit/i, Puzzle],
  [/preservation|\bcare\b|valet/i, Sparkles],
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
