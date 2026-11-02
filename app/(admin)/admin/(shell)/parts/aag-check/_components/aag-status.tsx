import { AlertTriangle, WifiOff } from "lucide-react";
import type { AagHealth } from "@/lib/aag/health";

// Operational status of the AAG parts integration (Task 40): a supplier
// refusing us must be visible somewhere a person looks, not only in a server
// log. It renders ONLY when something is wrong — unconfigured, refused or
// unreachable. A working connection shows nothing. The status read is this
// environment's own (lib/aag/health.ts), so dev never shows live's failure.

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

function Seen({ health }: { health: AagHealth }) {
  return (
    <>
      Seen {relative(health.at)}
      {health.errorCode && <> · error code {health.errorCode}</>}.
    </>
  );
}

export function AagStatus({
  configured,
  sandbox,
  health,
}: {
  configured: boolean;
  sandbox: boolean;
  health: AagHealth | null;
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
            <Seen health={health} />
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
            {health.detail} <Seen health={health} />
          </p>
        </div>
      </div>
    );
  }

  // Working, or not called yet: nothing to flag.
  return null;
}
