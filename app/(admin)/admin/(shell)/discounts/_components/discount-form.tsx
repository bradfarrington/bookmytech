"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { PromoCodeRow } from "@/lib/promos/validate";
import { createPromoCode, updatePromoCode, type PromoCodeInput } from "@/app/actions/discounts";

const FIELD_LABEL = "flex flex-col gap-1.5 text-sm font-semibold text-text-primary";
const FIELD_INPUT =
  "h-11 rounded-button border border-border bg-surface-card px-3.5 text-sm font-normal text-text-primary placeholder:text-text-disabled focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20 disabled:opacity-50";

function poundsToPence(v: string): number {
  const n = Number.parseFloat(v.replace(/[£,\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** An ISO timestamp as the value a `date` input wants. */
function dateValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

export function DiscountForm({ mode, code }: { mode: "create" | "edit"; code?: PromoCodeRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [codeText, setCodeText] = useState(code?.code ?? "");
  const [kind, setKind] = useState<"percent" | "fixed">(code?.kind ?? "percent");
  const [percentValue, setPercentValue] = useState(code && code.kind === "percent" ? String(code.value) : "10");
  const [fixedValue, setFixedValue] = useState(code && code.kind === "fixed" ? (code.value / 100).toFixed(2) : "");
  const [description, setDescription] = useState(code?.description ?? "");
  const [startsAt, setStartsAt] = useState(dateValue(code?.starts_at ?? null));
  const [expiresAt, setExpiresAt] = useState(dateValue(code?.expires_at ?? null));
  const [maxRedemptions, setMaxRedemptions] = useState(code?.max_redemptions != null ? String(code.max_redemptions) : "");
  const [perCustomer, setPerCustomer] = useState(String(code?.per_customer_limit ?? 1));
  const [minTotal, setMinTotal] = useState(code?.min_total_pence ? (code.min_total_pence / 100).toFixed(2) : "");
  const [isActive, setIsActive] = useState(code?.is_active ?? true);

  function submit() {
    setError(null);
    const input: PromoCodeInput = {
      code: codeText,
      kind,
      value: kind === "percent" ? Number(percentValue) : poundsToPence(fixedValue),
      description,
      startsAt: startsAt || null,
      expiresAt: expiresAt || null,
      maxRedemptions: maxRedemptions ? Number(maxRedemptions) : null,
      perCustomerLimit: Number(perCustomer),
      minTotalPence: minTotal ? poundsToPence(minTotal) : 0,
      isActive,
    };
    startTransition(async () => {
      const result = mode === "create" ? await createPromoCode(input) : await updatePromoCode(code!.id, input);
      if (!result.ok) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success(mode === "create" ? "Code created." : "Code saved.");
      router.push(mode === "create" && "id" in result ? `/admin/discounts/${result.id}` : "/admin/discounts");
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="space-y-6"
    >
      <Card className="space-y-5 p-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <label className={FIELD_LABEL}>
            <span>Code</span>
            <input
              type="text"
              value={codeText}
              onChange={(e) => setCodeText(e.target.value.toUpperCase())}
              required
              disabled={pending}
              placeholder="WELCOME10"
              className={`${FIELD_INPUT} font-mono uppercase`}
            />
            <span className="text-xs font-normal text-text-muted">
              What the customer types. Letters, numbers and hyphens, 3–24 characters.
            </span>
          </label>
          <label className={FIELD_LABEL}>
            <span>Description</span>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={pending}
              placeholder="Repeat-customer thank you"
              className={FIELD_INPUT}
            />
            <span className="text-xs font-normal text-text-muted">For your own reference and the offer email.</span>
          </label>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <label className={FIELD_LABEL}>
            <span>Type</span>
            <Select<"percent" | "fixed">
              value={kind}
              onChange={setKind}
              options={[
                { value: "percent", label: "Percentage off" },
                { value: "fixed", label: "Fixed amount off" },
              ]}
              aria-label="Discount type"
            />
          </label>
          {kind === "percent" ? (
            <label className={FIELD_LABEL}>
              <span>Percentage</span>
              <div className="relative">
                <input
                  type="text"
                  inputMode="numeric"
                  value={percentValue}
                  onChange={(e) => setPercentValue(e.target.value)}
                  required
                  disabled={pending}
                  placeholder="10"
                  className={`${FIELD_INPUT} pr-8`}
                />
                <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-text-muted">%</span>
              </div>
            </label>
          ) : (
            <label className={FIELD_LABEL}>
              <span>Amount off</span>
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-text-muted">£</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={fixedValue}
                  onChange={(e) => setFixedValue(e.target.value)}
                  required
                  disabled={pending}
                  placeholder="10.00"
                  className={`${FIELD_INPUT} pl-8`}
                />
              </div>
            </label>
          )}
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <label className={FIELD_LABEL}>
            <span>Starts</span>
            <input
              type="date"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              disabled={pending}
              className={FIELD_INPUT}
            />
            <span className="text-xs font-normal text-text-muted">Blank starts it now.</span>
          </label>
          <label className={FIELD_LABEL}>
            <span>Expires</span>
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              disabled={pending}
              className={FIELD_INPUT}
            />
            <span className="text-xs font-normal text-text-muted">Blank never expires.</span>
          </label>
        </div>

        <div className="grid gap-5 sm:grid-cols-3">
          <label className={FIELD_LABEL}>
            <span>Total uses</span>
            <input
              type="text"
              inputMode="numeric"
              value={maxRedemptions}
              onChange={(e) => setMaxRedemptions(e.target.value)}
              disabled={pending}
              placeholder="Unlimited"
              className={FIELD_INPUT}
            />
          </label>
          <label className={FIELD_LABEL}>
            <span>Uses per customer</span>
            <input
              type="text"
              inputMode="numeric"
              value={perCustomer}
              onChange={(e) => setPerCustomer(e.target.value)}
              required
              disabled={pending}
              className={FIELD_INPUT}
            />
          </label>
          <label className={FIELD_LABEL}>
            <span>Minimum booking</span>
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-text-muted">£</span>
              <input
                type="text"
                inputMode="decimal"
                value={minTotal}
                onChange={(e) => setMinTotal(e.target.value)}
                disabled={pending}
                placeholder="0.00"
                className={`${FIELD_INPUT} pl-8`}
              />
            </div>
          </label>
        </div>

        <div className="flex flex-col gap-4 rounded-button border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-text-primary">Live</p>
            <p className="text-xs text-text-muted">Switch off to stop it working without deleting its history.</p>
          </div>
          <Switch checked={isActive} onChange={setIsActive} label="Code is live" disabled={pending} />
        </div>

        {error && (
          <p role="alert" className="rounded-button border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
      </Card>

      <div className="flex items-center justify-end gap-3">
        <Link href="/admin/discounts">
          <Button type="button" variant="ghost" disabled={pending}>
            Cancel
          </Button>
        </Link>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Saving…" : mode === "create" ? "Create code" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
