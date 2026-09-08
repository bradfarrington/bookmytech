"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Gift, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { grantCustomerCredit, listActivePromoCodes, sendPromoCodeOffer } from "@/app/actions/discounts";

// Two one-off gestures on a customer (Task 35): put credit straight on their
// account (no code to type — it applies itself at their next checkout), or
// send them one of the discount codes. Codes are for campaigns; credit is for
// "sorry about that" and "thanks for the repeat custom" to one person.

const INPUT =
  "h-10 rounded-button border border-border bg-surface-card px-3 text-sm text-text-primary placeholder:text-text-muted focus:border-brand-blue focus:outline-none";

function poundsToPence(v: string): number {
  const n = Number.parseFloat(v.replace(/[£,\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function CreditActions({ customerId }: { customerId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [codes, setCodes] = useState<Array<{ id: string; code: string; offer: string }>>([]);
  const [codeId, setCodeId] = useState("");

  useEffect(() => {
    let cancelled = false;
    listActivePromoCodes().then((res) => {
      if (cancelled || !res.ok) return;
      setCodes(res.codes);
      setCodeId(res.codes[0]?.id ?? "");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card className="space-y-5 p-6">
      <div>
        <h2 className="text-sm font-bold uppercase tracking-wide text-text-muted">Give them something</h2>
        <p className="mt-1 text-sm text-text-muted">
          Credit lands on their account and applies itself at their next checkout. A code has to be typed,
          and is the one to use for a campaign.
        </p>
      </div>

      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            const res = await grantCustomerCredit({ customerId, amountPence: poundsToPence(amount), note });
            if (!res.ok) {
              toast.error(res.error);
              return;
            }
            toast.success("Credit added to their account.");
            setAmount("");
            setNote("");
            router.refresh();
          });
        }}
      >
        <p className="text-sm font-semibold text-text-primary">Grant credit</p>
        <div className="grid gap-2 sm:grid-cols-[120px_1fr_auto]">
          <label className="flex items-center gap-2 text-xs text-text-muted">
            £
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="10.00"
              aria-label="Credit amount in pounds"
              className={`${INPUT} w-full`}
            />
          </label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why — shown on their credit history"
            aria-label="Reason"
            maxLength={200}
            className={INPUT}
          />
          <Button type="submit" size="sm" iconLeft={Gift} disabled={pending || !amount.trim()}>
            Add credit
          </Button>
        </div>
      </form>

      <form
        className="space-y-2 border-t border-border pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            const res = await sendPromoCodeOffer({ codeId, customerIds: [customerId] });
            if (!res.ok) {
              toast.error(res.error);
              return;
            }
            toast.success(res.sent > 0 ? "Code sent." : "Nothing sent — they have no email address.");
            router.refresh();
          });
        }}
      >
        <p className="text-sm font-semibold text-text-primary">Send a discount code</p>
        {codes.length === 0 ? (
          <p className="text-xs text-text-muted">No live codes — create one under Discounts first.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <Select
              value={codeId}
              onChange={setCodeId}
              options={codes.map((c) => ({ value: c.id, label: `${c.code} — ${c.offer}` }))}
              aria-label="Discount code"
            />
            <Button type="submit" size="sm" variant="secondary" iconLeft={Send} disabled={pending || !codeId}>
              Send
            </Button>
          </div>
        )}
      </form>
    </Card>
  );
}
