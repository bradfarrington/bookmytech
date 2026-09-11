import { AlertTriangle, CheckCircle2, PlugZap, WifiOff } from "lucide-react";

import type { LkqHealth } from "@/lib/lkq/health";
import type { AagHealth } from "@/lib/aag/health";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";

// Connection status for both suppliers (Task 42). Server component, pure
// presentation — modelled on aag-status.tsx.
//
// LKQ is TWO APIs that fail independently: the catalogue can be refusing our key
// while pricing is perfectly happy. A single "LKQ: down" would send someone
// looking in the wrong place, so each half reports separately.

function relative(iso: string): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "at an unknown time";
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

interface HalfProps {
  label: string;
  configured: boolean;
  missing: string[];
  health: LkqHealth | AagHealth | null;
}

function stateOf(health: LkqHealth | AagHealth | null): string | null {
  if (!health) return null;
  return (health as LkqHealth).state ?? null;
}

function Half({ label, configured, missing, health }: HalfProps) {
  if (!configured) {
    return (
      <div className="flex items-start gap-2.5">
        <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-amber-600" />
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-text-primary">{label}</span>
            <Pill tone="neutral">Not configured</Pill>
          </div>
          <p className="mt-0.5 text-xs text-text-muted">
            {missing.length > 0 ? `Missing ${missing.join(", ")}.` : "Credentials not set."}
          </p>
        </div>
      </div>
    );
  }

  const state = stateOf(health);

  if (state === "auth_failed") {
    return (
      <div className="flex items-start gap-2.5">
        <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-red-600" />
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-text-primary">{label}</span>
            <Pill tone="error">Refusing us</Pill>
          </div>
          <p className="mt-0.5 text-xs text-text-muted">
            {health?.detail} <span className="text-text-muted/70">({relative(health!.at)})</span>
          </p>
        </div>
      </div>
    );
  }

  if (state === "budget_exhausted") {
    return (
      <div className="flex items-start gap-2.5">
        <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-amber-600" />
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-text-primary">{label}</span>
            <Pill tone="pending">Budget spent</Pill>
          </div>
          <p className="mt-0.5 text-xs text-text-muted">{health?.detail}</p>
        </div>
      </div>
    );
  }

  if (state === "unreachable") {
    return (
      <div className="flex items-start gap-2.5">
        <WifiOff aria-hidden className="mt-0.5 size-4 shrink-0 text-amber-600" />
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-text-primary">{label}</span>
            <Pill tone="pending">Unreachable</Pill>
          </div>
          <p className="mt-0.5 text-xs text-text-muted">
            {health?.detail} <span className="text-text-muted/70">({relative(health!.at)})</span>
          </p>
        </div>
      </div>
    );
  }

  if (state === "ok") {
    return (
      <div className="flex items-start gap-2.5">
        <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-green-600" />
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-text-primary">{label}</span>
            <Pill tone="success">Connected</Pill>
          </div>
          <p className="mt-0.5 text-xs text-text-muted">
            Last successful call {relative(health!.at)}.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2.5">
      <PlugZap aria-hidden className="mt-0.5 size-4 shrink-0 text-text-muted" />
      <div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-text-primary">{label}</span>
          <Pill tone="neutral">Ready</Pill>
        </div>
        <p className="mt-0.5 text-xs text-text-muted">Configured — no call recorded yet.</p>
      </div>
    </div>
  );
}

export interface SupplierStatusStripProps {
  ecpConfigured: boolean;
  adsConfigured: boolean;
  aagConfigured: boolean;
  missing: { ecp: string[]; ads: string[] };
  ecpHealth: LkqHealth | null;
  adsHealth: LkqHealth | null;
  aagHealth: AagHealth | null;
  credits: { used: number; cap: number };
}

export function SupplierStatusStrip({
  ecpConfigured,
  adsConfigured,
  aagConfigured,
  missing,
  ecpHealth,
  adsHealth,
  aagHealth,
  credits,
}: SupplierStatusStripProps) {
  const remaining = Math.max(0, credits.cap - credits.used);

  return (
    <Card className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Half
          label="LKQ pricing"
          configured={ecpConfigured}
          missing={missing.ecp}
          health={ecpHealth}
        />
        <Half
          label="LKQ catalogue"
          configured={adsConfigured}
          missing={missing.ads}
          health={adsHealth}
        />
        <Half
          label="Alliance Automotive"
          configured={aagConfigured}
          missing={["AAG_API_KEY", "AAG_CUSTOMER_ID"]}
          health={aagHealth}
        />
      </div>

      <p className="border-t border-border pt-3 text-xs text-text-muted">
        Catalogue lookups are metered:{" "}
        <strong className="font-semibold text-text-primary">
          {credits.used} of {credits.cap}
        </strong>{" "}
        used this month, {remaining} left. Prices and stock are fetched live on every
        search and cost nothing; only new vehicles and new product groups spend a credit.
      </p>
    </Card>
  );
}
