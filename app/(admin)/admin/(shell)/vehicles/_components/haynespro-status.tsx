import { AlertTriangle, CheckCircle2, WifiOff } from "lucide-react";
import type { HaynesProHealth } from "@/lib/haynespro/health";

// Operational status of the HaynesPro integration, shown at the top of the
// admin Vehicles area.
//
// This exists because of a real outage: the demo licence expired on 2026-08-09
// and the funnel degraded silently — every customer was told "we couldn't match
// your registration", nobody at BMT was told anything, and the whole repair
// catalogue was down for sixteen days before someone testing a booking noticed.
// The catalogue IS the booking flow since Task 17 removed packaged services, so
// "HaynesPro is refusing our credentials" means "nobody can book".

function relative(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "at an unknown time";
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function HaynesProStatus({
  configured,
  health,
}: {
  configured: boolean;
  health: HaynesProHealth | null;
}) {
  if (!configured) {
    return (
      <div className="flex items-start gap-3 rounded-button border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <AlertTriangle size={18} className="mt-0.5 shrink-0" />
        <div>
          <p className="font-semibold">HaynesPro isn&apos;t configured.</p>
          <p className="mt-0.5 text-amber-800">
            Add the <code>HAYNESPRO_*</code> values to the environment. Until
            then no customer can price or book a repair, on the website or in
            the app.
          </p>
        </div>
      </div>
    );
  }

  if (health?.state === "auth_failed") {
    return (
      <div className="flex items-start gap-3 rounded-button border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
        <AlertTriangle size={18} className="mt-0.5 shrink-0" />
        <div>
          <p className="font-semibold">
            HaynesPro is refusing our credentials — booking is down.
          </p>
          <p className="mt-0.5 text-red-800">{health.detail}</p>
          <p className="mt-1.5 text-red-800">
            Seen {relative(health.at)}
            {health.statusCode != null && <> · status code {health.statusCode}</>}.
            The repair catalogue is the whole booking flow, so until this is
            fixed every customer is told we can&apos;t price their vehicle.
          </p>
        </div>
      </div>
    );
  }

  if (health?.state === "unreachable") {
    return (
      <div className="flex items-start gap-3 rounded-button border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <WifiOff size={18} className="mt-0.5 shrink-0" />
        <div>
          <p className="font-semibold">We couldn&apos;t reach HaynesPro.</p>
          <p className="mt-0.5 text-amber-800">
            {health.detail} Seen {relative(health.at)}. This is usually a blip
            and clears itself — if it persists, booking is affected.
          </p>
        </div>
      </div>
    );
  }

  if (health?.state === "ok") {
    return (
      <div className="flex items-center gap-2.5 rounded-button border border-border bg-surface-card px-4 py-2.5 text-sm text-text-secondary">
        <CheckCircle2 size={16} className="shrink-0 text-success" />
        <span>
          HaynesPro connected — last authenticated {relative(health.at)}.
        </span>
      </div>
    );
  }

  // Configured, but nothing recorded yet: no auth attempt has happened on this
  // environment since health tracking shipped. Say exactly that rather than
  // implying either health.
  return (
    <div className="flex items-center gap-2.5 rounded-button border border-border bg-surface-card px-4 py-2.5 text-sm text-text-muted">
      <CheckCircle2 size={16} className="shrink-0 text-text-disabled" />
      <span>
        HaynesPro is configured. No authentication attempt recorded yet — status
        will show here after the next lookup.
      </span>
    </div>
  );
}
