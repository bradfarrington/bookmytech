import { AlertTriangle, CheckCircle2, WifiOff } from "lucide-react";
import { describeAagHealthSource, type AagHealth } from "@/lib/aag/health";

// Operational status of the AAG parts integration (Task 40) — the same
// four-state banner as the HaynesPro one on /admin/vehicles, for the same
// reason: a supplier refusing our credentials must be visible somewhere a
// person looks, not only in a server log.

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

/**
 * "Seen 4 minutes ago on the live site." The status row is shared by every
 * environment, so a failure seen elsewhere says so rather than reading as this
 * one's: the sandbox refuses Vercel but answers a local dev server.
 */
function Seen({ health, here }: { health: AagHealth; here: string }) {
  const where = describeAagHealthSource(health.source);
  const elsewhere = health.source != null && health.source !== here;
  return (
    <>
      Seen {relative(health.at)}
      {where && <> on {where}</>}
      {health.errorCode && <> · error code {health.errorCode}</>}.
      {elsewhere && (
        <> This page is running on {describeAagHealthSource(here)}, so it may not apply here. Run a check below to find out.</>
      )}
    </>
  );
}

export function AagStatus({
  configured,
  sandbox,
  health,
  here,
}: {
  configured: boolean;
  sandbox: boolean;
  health: AagHealth | null;
  /** This environment, as AagHealth.source records it. */
  here: string;
}) {
  const host = sandbox ? "AAG's sandbox" : "AAG live";

  if (!configured) {
    return (
      <div className="flex items-start gap-3 rounded-button border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <AlertTriangle size={18} className="mt-0.5 shrink-0" />
        <div>
          <p className="font-semibold">AAG isn&apos;t configured.</p>
          <p className="mt-0.5 text-amber-800">
            Add <code>AAG_API_KEY</code> and <code>AAG_CUSTOMER_ID</code> (and{" "}
            <code>AAG_VERIFICATION_ID</code> if AAG issued one) to the
            environment. Nothing customer-facing depends on this yet.
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
            {health.errorCode ? `${host} is refusing our credentials.` : `${host} turned us away.`}
          </p>
          <p className="mt-0.5 text-red-800">{health.detail}</p>
          <p className="mt-1.5 text-red-800">
            <Seen health={health} here={here} />
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
          <p className="font-semibold">We couldn&apos;t reach {host}.</p>
          <p className="mt-0.5 text-amber-800">
            {health.detail} <Seen health={health} here={here} />
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
          {host} connected. Last successful call {relative(health.at)}.
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2.5 rounded-button border border-border bg-surface-card px-4 py-2.5 text-sm text-text-muted">
      <CheckCircle2 size={16} className="shrink-0 text-text-disabled" />
      <span>
        {host} is configured. No call recorded yet. Run a check below and the
        status will show here.
      </span>
    </div>
  );
}
