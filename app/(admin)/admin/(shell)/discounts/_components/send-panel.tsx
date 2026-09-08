"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Search, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { searchCustomersForOffer, sendPromoCodeOffer, type OfferRecipient } from "@/app/actions/discounts";

// Send a code to a handful of customers (Task 35). One email each through the
// ordinary transactional sender — there is no bulk pipeline, and this is the
// "10% off your next booking, thanks for the repeat custom" Gareth asked for,
// not a marketing blast. Optionally a text as well, when SMS is on and there
// are credits for it.

const MAX_RECIPIENTS = 200;

export function SendPanel({
  codeId,
  code,
  offer,
  isActive,
}: {
  codeId: string;
  code: string;
  offer: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<OfferRecipient[]>([]);
  const [searching, setSearching] = useState(false);
  const [chosen, setChosen] = useState<OfferRecipient[]>([]);
  const [alsoSms, setAlsoSms] = useState(false);
  // Debounced search, latest-wins. The empty query seeds the list with the
  // most recent customers, so the panel is useful before anyone types.
  useEffect(() => {
    let cancelled = false;
    const id = setTimeout(async () => {
      setSearching(true);
      const res = await searchCustomersForOffer(query);
      if (cancelled) return;
      setSearching(false);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setResults(res.customers);
    }, query ? 300 : 0);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [query]);

  function toggle(customer: OfferRecipient) {
    setChosen((cs) =>
      cs.some((c) => c.id === customer.id) ? cs.filter((c) => c.id !== customer.id) : [...cs, customer],
    );
  }

  function send() {
    startTransition(async () => {
      const res = await sendPromoCodeOffer({ codeId, customerIds: chosen.map((c) => c.id), sms: alsoSms });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(
        res.failed > 0
          ? `Sent to ${res.sent}; ${res.failed} failed — see the list below.`
          : `${code} sent to ${res.sent} customer${res.sent === 1 ? "" : "s"}.`,
      );
      setChosen([]);
      router.refresh();
    });
  }

  return (
    <Card className="space-y-4 p-6">
      <div>
        <h2 className="text-sm font-bold uppercase tracking-wide text-text-muted">Send to customers</h2>
        <p className="mt-1 text-sm text-text-muted">
          They get an email with the code and what it&apos;s worth ({offer}). Pick up to {MAX_RECIPIENTS}.
        </p>
      </div>

      {!isActive && (
        <p className="rounded-button border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          This code is switched off — turn it on below before sending it.
        </p>
      )}

      <label className="relative block">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, email or phone"
          aria-label="Search customers"
          className="h-10 w-full rounded-button border border-border bg-surface-card pl-9 pr-9 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20"
        />
        {searching && (
          <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-text-muted" />
        )}
      </label>

      {chosen.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {chosen.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => toggle(c)}
              className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-brand-blue"
            >
              {c.name}
              <X size={11} />
            </button>
          ))}
        </div>
      )}

      <ul className="max-h-64 divide-y divide-border-subtle overflow-y-auto rounded-xl border border-border">
        {results.length === 0 && !searching && (
          <li className="px-3 py-6 text-center text-sm text-text-muted">No customers match that.</li>
        )}
        {results.map((c) => {
          const picked = chosen.some((x) => x.id === c.id);
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => toggle(c)}
                className={cn(
                  "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-surface",
                  picked && "bg-blue-50/60",
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-text-primary">{c.name}</span>
                  <span className="block truncate text-xs text-text-muted">{c.email ?? "No email"}</span>
                </span>
                <span className={cn("shrink-0 text-xs font-semibold", picked ? "text-brand-blue" : "text-text-muted")}>
                  {picked ? "Chosen" : c.email ? "Add" : "No email"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <label className="flex items-center gap-3 text-sm text-text-secondary">
        <input
          type="checkbox"
          checked={alsoSms}
          onChange={(e) => setAlsoSms(e.target.checked)}
          className="size-4 rounded border-border accent-brand-blue"
        />
        Text it as well (uses SMS credits; skipped if they&apos;re off or short)
      </label>

      <Button
        iconLeft={Send}
        disabled={pending || chosen.length === 0 || !isActive}
        onClick={send}
      >
        {pending ? "Sending…" : `Send to ${chosen.length} customer${chosen.length === 1 ? "" : "s"}`}
      </Button>
    </Card>
  );
}
