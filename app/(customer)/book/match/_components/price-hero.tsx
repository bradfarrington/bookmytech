import Link from "next/link";
import { ShieldCheck, Star, Wrench } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { groupRepairLines } from "@/lib/bookings/repair-lines";

export interface PriceHeroLine {
  nodeId: string;
  description: string;
  /** The job's own book time. */
  rawHours: number;
  /** Its share of the visit after overlap removal — 0 = covered by another job. */
  chargedHours: number;
  /** The chosen item this job belongs to; a combined repair groups its jobs under `itemLabel`. */
  itemId: string;
  itemLabel: string | null;
  /** Drops the whole item (a combined repair goes as one). */
  removeHref: string;
}

interface PriceHeroProps {
  serviceName: string;
  pricePence: number;
  description?: string | null;
  /** Billed hours when priced from the HaynesPro time for this exact vehicle. */
  estimatedHours?: number | null;
  vehicleName?: string | null;
  /** The jobs when there are several (Task 24). Omitted for one job. */
  lines?: PriceHeroLine[];
  /** Book time for the whole visit. */
  combinedRawHours?: number;
  /** "sum" = each job's book time added (the default); "haynespro" = overlap removed. */
  combineSource?: "haynespro" | "sum" | null;
}

function hours(n: number): string {
  return `${Number(n.toFixed(2))} h`;
}

function timeLabel(line: PriceHeroLine): string {
  if (line.chargedHours === 0) return "No extra time — covered by the other work";
  if (line.chargedHours < line.rawHours) return `${hours(line.chargedHours)} · reduced, overlaps with other work`;
  return hours(line.rawHours);
}

export function PriceHero({
  serviceName,
  pricePence,
  description,
  estimatedHours,
  vehicleName,
  lines,
  combinedRawHours,
  combineSource,
}: PriceHeroProps) {
  const multiJobs = (lines?.length ?? 0) > 1;
  const groups = multiJobs ? groupRepairLines(lines!) : [];
  const multiItems = groups.length > 1;
  const minimumApplied =
    multiJobs && estimatedHours != null && combinedRawHours != null && estimatedHours > combinedRawHours;

  return (
    <div className="flex flex-col gap-4">
      {/* Price hero card */}
      <div className="rounded-2xl bg-brand-gradient p-6 text-white shadow-hero">
        <p className="text-sm font-semibold uppercase tracking-widest text-blue-200">
          Fixed price
        </p>
        <p className="mt-1 text-5xl font-extrabold tracking-tight">
          {formatPrice(pricePence)}
        </p>
        <p className="mt-2 text-lg font-semibold text-blue-100">
          {multiItems ? `${groups.length} jobs in one visit` : serviceName}
        </p>

        {multiJobs && (
          <ul className="mt-3 divide-y divide-white/15 rounded-xl bg-white/10">
            {groups.map((group) => (
              <li key={group.key} className="flex items-start justify-between gap-3 px-3 py-2.5 text-sm">
                <div className="min-w-0">
                  {group.label ? (
                    <>
                      {multiItems && <p className="font-medium text-white">{group.label}</p>}
                      <ul className={multiItems ? "mt-1 flex flex-col gap-0.5" : "flex flex-col gap-1"}>
                        {group.lines.map((line) => (
                          <li key={line.nodeId} className={multiItems ? "text-xs text-blue-100" : ""}>
                            <span className={multiItems ? "" : "font-medium text-white"}>{line.description}</span>
                            <span className="text-blue-200"> · {timeLabel(line)}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <>
                      <p className="font-medium text-white">{group.lines[0].description}</p>
                      <p className="mt-0.5 text-xs text-blue-200">{timeLabel(group.lines[0])}</p>
                    </>
                  )}
                </div>
                {multiItems && (
                  <Link
                    href={group.lines[0].removeHref}
                    className="shrink-0 text-xs font-semibold text-blue-200 underline underline-offset-2 hover:text-white"
                  >
                    Remove
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}

        {description && (
          <p className="mt-2 text-sm text-blue-200 leading-relaxed">{description}</p>
        )}

        {multiJobs && combinedRawHours != null && (
          <p className="mt-2 text-sm font-semibold text-blue-100">
            {combineSource === "haynespro" ? "Combined" : "Total"} book time on your{" "}
            {vehicleName || "vehicle"}: {hours(combinedRawHours)}
            {minimumApplied && " · billed as our 1-hour minimum"}
          </p>
        )}
        {!multiJobs && estimatedHours != null && estimatedHours > 0 && (
          <p className="mt-2 text-sm font-semibold text-blue-100">
            Estimated time on your {vehicleName || "vehicle"}: {estimatedHours}{" "}
            {estimatedHours === 1 ? "hour" : "hours"}
          </p>
        )}

        <ul className="mt-4 flex flex-col gap-1.5 text-sm text-blue-100">
          <li className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-blue-300" />
            Labour included
          </li>
          <li className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-blue-300" />
            No call-out fee
          </li>
          <li className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-blue-300" />
            12-month guarantee
          </li>
        </ul>

        <p className="mt-4 rounded-xl bg-white/15 px-4 py-3 text-[13px] leading-relaxed text-blue-100">
          Your card is pre-authorised now. No money leaves your account until the job
          is complete and you&apos;ve signed off.
        </p>
      </div>

      {/* Trust row */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { icon: ShieldCheck, label: "Vetted professional" },
          { icon: Star, label: "12-month guarantee" },
          { icon: Wrench, label: "No fix, no fee" },
        ].map(({ icon: Icon, label }) => (
          <div
            key={label}
            className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-surface-card px-2 py-3 text-center"
          >
            <Icon size={18} className="text-brand-blue" />
            <span className="text-[11px] font-semibold leading-tight text-text-secondary">
              {label}
            </span>
          </div>
        ))}
      </div>

      {/* How it works after booking */}
      <div className="rounded-xl border border-border-subtle bg-surface p-4 text-sm text-text-secondary leading-relaxed">
        <p className="font-semibold text-text-primary">What happens next?</p>
        <p className="mt-1">
          Once confirmed, we&apos;ll match you with the best available mechanic in
          your area. You&apos;ll receive a confirmation email as soon as one accepts —
          usually within minutes.
        </p>
      </div>
    </div>
  );
}
