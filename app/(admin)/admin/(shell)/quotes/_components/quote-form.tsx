"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { CustomQuoteRow } from "@/lib/custom-quotes/model";
import { saveCustomQuoteAction, withdrawCustomQuoteAction } from "@/app/actions/admin-custom-quotes";
import { lookupVehicleAction } from "@/app/actions/lookup-vehicle";

/** "FORD" → "Ford", "3 SERIES" → "3 Series"; short words stay as DVLA sends them ("BMW", "KIA"). */
function dvlaName(text: string | undefined): string {
  return (text ?? "")
    .trim()
    .split(/\s+/)
    .map((word) => (word.length > 3 ? word.charAt(0) + word.slice(1).toLowerCase() : word))
    .join(" ");
}

const FIELD_LABEL = "flex flex-col gap-1.5 text-sm font-semibold text-text-primary";
const FIELD_INPUT =
  "h-11 rounded-button border border-border bg-surface-card px-3.5 text-sm font-normal text-text-primary placeholder:text-text-disabled focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20 disabled:opacity-50";

function poundsToPence(v: string): number | null {
  const n = Number.parseFloat(v.replace(/[£,\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/**
 * Price a custom quote (Task 75). A request arrives with the customer and
 * vehicle filled in; a new quote starts blank. "Send" emails (and texts) the
 * customer a link; a sent quote can be corrected and sent again until it's
 * booked, declined or withdrawn.
 */
export function QuoteForm({ quote }: { quote?: CustomQuoteRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [v, setV] = useState({
    customerName: quote?.customer_name ?? "",
    customerEmail: quote?.customer_email ?? "",
    customerPhone: quote?.customer_phone ?? "",
    reg: quote?.vehicle_reg ?? "",
    make: quote?.vehicle_make ?? "",
    model: quote?.vehicle_model ?? "",
    postcode: quote?.postcode ?? "",
    title: quote?.title ?? "",
    details: quote?.details ?? "",
    total: quote?.total_pence != null ? (quote.total_pence / 100).toFixed(2) : "",
    visitHours: String(Number(quote?.visit_hours ?? 1)),
  });
  // DVLA lookup on the registration (2026-11-18): fills Make and Model, never
  // over something the admin typed. `filled` is what the last lookup put in.
  const [lookup, setLookup] = useState<{ state: "idle" | "looking" | "found" | "failed"; text: string }>({ state: "idle", text: "" });
  const [filled, setFilled] = useState<{ reg: string; make: string; model: string } | null>(null);
  function lookUpReg() {
    const reg = v.reg.replace(/\s+/g, "");
    if (reg.length < 2 || filled?.reg === reg) return;
    setLookup({ state: "looking", text: "Looking up the registration with DVLA…" });
    lookupVehicleAction(reg)
      .then((result) => {
        if (!result.ok) {
          setLookup({ state: "failed", text: result.message });
          return;
        }
        const make = dvlaName(result.details.make);
        const model = dvlaName(result.details.model);
        setV((prev) => ({
          ...prev,
          make: !prev.make || prev.make === filled?.make ? make : prev.make,
          model: !prev.model || prev.model === filled?.model ? model : prev.model,
        }));
        setFilled({ reg, make, model });
        const extra = [result.details.yearOfManufacture, dvlaName(result.details.fuelType), dvlaName(result.details.colour)].filter(Boolean);
        setLookup({ state: "found", text: [`${make} ${model}`.trim(), ...extra].join(" · ") });
      })
      .catch(() => setLookup({ state: "failed", text: "DVLA didn't answer. Type the make and model in." }));
  }
  const set = (key: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setV((prev) => ({ ...prev, [key]: e.target.value }));
  const sent = quote?.status === "sent";

  function save(send: boolean) {
    setError(null);
    if (send && !confirm(`Email this quote to ${v.customerEmail || "the customer"}?`)) return;
    startTransition(async () => {
      const result = await saveCustomQuoteAction(
        quote?.id ?? null,
        {
          customerName: v.customerName,
          customerEmail: v.customerEmail,
          customerPhone: v.customerPhone,
          reg: v.reg,
          make: v.make,
          model: v.model,
          postcode: v.postcode,
          title: v.title,
          details: v.details,
          totalPence: v.total.trim() ? poundsToPence(v.total) : null,
          visitHours: v.visitHours,
        },
        send,
      );
      if (!result.ok) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success(send ? "Quote sent to the customer." : "Quote saved.");
      if (!quote) router.push(`/admin/quotes/${result.id}`);
      router.refresh();
    });
  }

  function withdraw() {
    if (!quote || !confirm("Withdraw this quote? The customer won't be able to book it.")) return;
    startTransition(async () => {
      const result = await withdrawCustomQuoteAction(quote.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Quote withdrawn.");
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save(true);
      }}
      className="space-y-6"
    >
      <Card className="space-y-5 p-6">
        <h2 className="text-sm font-bold uppercase tracking-wide text-text-muted">Customer</h2>
        <div className="grid gap-5 sm:grid-cols-3">
          <label className={FIELD_LABEL}>
            <span>Name</span>
            <input value={v.customerName} onChange={set("customerName")} disabled={pending} required className={FIELD_INPUT} />
          </label>
          <label className={FIELD_LABEL}>
            <span>Email</span>
            <input type="email" value={v.customerEmail} onChange={set("customerEmail")} disabled={pending} required className={FIELD_INPUT} />
          </label>
          <label className={FIELD_LABEL}>
            <span>Mobile (optional)</span>
            <input type="tel" value={v.customerPhone} onChange={set("customerPhone")} disabled={pending} className={FIELD_INPUT} />
          </label>
        </div>
        <p className="text-xs text-text-muted">
          The customer books with the account for this email address (they can create one when they book). A
          mobile number also gets the quote by text.
        </p>
      </Card>

      <Card className="space-y-5 p-6">
        <h2 className="text-sm font-bold uppercase tracking-wide text-text-muted">Vehicle</h2>
        <div className="grid gap-5 sm:grid-cols-4">
          <label className={FIELD_LABEL}>
            <span className="flex items-center justify-between gap-2">
              Registration
              <button
                type="button"
                onClick={lookUpReg}
                disabled={pending || lookup.state === "looking" || v.reg.trim().length < 2}
                className="text-xs font-semibold text-brand-blue hover:underline disabled:text-text-muted disabled:no-underline"
              >
                Look up
              </button>
            </span>
            <input
              value={v.reg}
              onChange={(e) => setV((p) => ({ ...p, reg: e.target.value.toUpperCase() }))}
              onBlur={lookUpReg}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  lookUpReg();
                }
              }}
              disabled={pending}
              required
              className={`${FIELD_INPUT} font-bold uppercase`}
            />
          </label>
          <label className={FIELD_LABEL}>
            <span>Make</span>
            <input value={v.make} onChange={set("make")} disabled={pending} placeholder="e.g. Ford" className={FIELD_INPUT} />
          </label>
          <label className={FIELD_LABEL}>
            <span>Model (optional)</span>
            <input value={v.model} onChange={set("model")} disabled={pending} placeholder="e.g. Focus" className={FIELD_INPUT} />
          </label>
          <label className={FIELD_LABEL}>
            <span>Postcode (optional)</span>
            <input
              value={v.postcode}
              onChange={(e) => setV((p) => ({ ...p, postcode: e.target.value.toUpperCase() }))}
              disabled={pending}
              className={FIELD_INPUT}
            />
          </label>
        </div>
        {lookup.state !== "idle" && (
          <p
            role="status"
            className={`text-xs ${lookup.state === "failed" ? "text-amber-700" : lookup.state === "found" ? "font-semibold text-success" : "text-text-muted"}`}
          >
            {lookup.state === "found" ? `DVLA: ${lookup.text}` : lookup.text}
          </p>
        )}
      </Card>

      <Card className="space-y-5 p-6">
        <h2 className="text-sm font-bold uppercase tracking-wide text-text-muted">The quote</h2>
        <label className={FIELD_LABEL}>
          <span>What&apos;s the work?</span>
          <input
            value={v.title}
            onChange={set("title")}
            disabled={pending}
            maxLength={120}
            placeholder="e.g. Replace the rear wiper motor"
            className={FIELD_INPUT}
          />
          <span className="text-xs font-normal text-text-muted">
            The customer, the mechanic and the booking all show this as the job&apos;s name.
          </span>
        </label>
        <label className={FIELD_LABEL}>
          <span>Details (optional)</span>
          <textarea
            value={v.details}
            onChange={set("details")}
            disabled={pending}
            rows={4}
            maxLength={2000}
            placeholder="What's included, anything the mechanic should know."
            className={`${FIELD_INPUT} h-auto resize-y py-2.5`}
          />
          <span className="text-xs font-normal text-text-muted">Shown to the customer, and to the mechanic with the job.</span>
        </label>
        <div className="grid gap-5 sm:grid-cols-2">
          <label className={FIELD_LABEL}>
            <span>Total price</span>
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-text-muted">£</span>
              <input
                inputMode="decimal"
                value={v.total}
                onChange={set("total")}
                disabled={pending}
                placeholder="145.00"
                className={`${FIELD_INPUT} w-full pl-8`}
              />
            </div>
            <span className="text-xs font-normal text-text-muted">
              One total, parts and labour included, like every other price. Our commission comes off it as usual;
              the mechanic supplies any parts from their share.
            </span>
          </label>
          <label className={FIELD_LABEL}>
            <span>Visit length (hours)</span>
            <input inputMode="decimal" value={v.visitHours} onChange={set("visitHours")} disabled={pending} className={FIELD_INPUT} />
            <span className="text-xs font-normal text-text-muted">How long the mechanic&apos;s calendar is blocked for.</span>
          </label>
        </div>

        {error && (
          <p role="alert" className="rounded-button border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {quote && (
            <Button type="button" variant="ghost" disabled={pending} onClick={withdraw}>
              Withdraw
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/admin/quotes">
            <Button type="button" variant="ghost" disabled={pending}>
              Cancel
            </Button>
          </Link>
          {!sent && (
            <Button type="button" variant="secondary" disabled={pending} onClick={() => save(false)}>
              Save draft
            </Button>
          )}
          <Button type="submit" variant="primary" iconLeft={Send} disabled={pending}>
            {pending ? "Saving…" : sent ? "Send updated quote" : "Send to customer"}
          </Button>
        </div>
      </div>
    </form>
  );
}
