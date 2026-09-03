"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Check, Loader2, MessageSquare, Send, Zap } from "lucide-react";
import { cn, formatPrice } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { Switch } from "@/components/ui/switch";
import {
  createCheckout,
  saveLowCreditEmail,
  saveSmsSender,
  sendCustomSms,
  sendTestSms,
  setSmsEnabled,
} from "@/app/actions/sms";

export interface SmsSettings {
  smsEnabled: boolean;
  balance: number;
  senderName: string;
  lowCreditEmail: string;
}

export interface PackageRow {
  credits: number;
  pricePence: number;
  popular?: boolean;
}

export interface PurchaseRow {
  id: string;
  credits_purchased: number;
  amount_paid_pence: number;
  status: string;
  created_at: string;
}

const FIELD_LABEL = "flex flex-col gap-1.5 text-sm font-semibold text-text-primary";
const FIELD_INPUT =
  "h-11 rounded-button border border-border bg-surface-card px-3.5 text-sm text-text-primary outline-none transition focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/15";
const CARD = "rounded-2xl border border-border bg-surface-card p-5";

const LOW_CREDIT_THRESHOLD = 10;

export function SmsPanel({
  settings,
  packages,
  purchases,
}: {
  settings: SmsSettings;
  packages: PackageRow[];
  purchases: PurchaseRow[];
}) {
  const router = useRouter();
  const params = useSearchParams();

  // Flash the GoCardless redirect outcome, then strip the query param.
  useEffect(() => {
    const purchase = params.get("purchase");
    if (purchase === "success") {
      toast.success("Payment received — credits will appear here shortly.");
    } else if (purchase === "cancelled") {
      toast("Purchase cancelled.");
    }
    if (purchase) router.replace("/admin/sms");
  }, [params, router]);

  return (
    <div className="space-y-8">
      <BalanceAndToggle balance={settings.balance} smsEnabled={settings.smsEnabled} />

      <section className="space-y-3">
        <SectionHeading title="Buy credits" subtitle="Top up via secure bank payment. 10p per credit." />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {packages.map((p) => (
            <PackageCard key={p.credits} pkg={p} />
          ))}
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <SenderSection senderName={settings.senderName} />
        <AlertEmailSection email={settings.lowCreditEmail} />
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <TestSendSection enabled={settings.smsEnabled} balance={settings.balance} />
        <ComposeSection enabled={settings.smsEnabled} balance={settings.balance} />
      </div>

      <PurchaseHistory purchases={purchases} />
    </div>
  );
}

function SectionHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h2 className="text-lg font-bold tracking-tight text-text-primary">{title}</h2>
      <p className="text-sm text-text-muted">{subtitle}</p>
    </div>
  );
}

function BalanceAndToggle({ balance, smsEnabled }: { balance: number; smsEnabled: boolean }) {
  const [enabled, setEnabled] = useState(smsEnabled);
  const [pending, start] = useTransition();
  const low = balance <= LOW_CREDIT_THRESHOLD;

  function toggle() {
    const next = !enabled;
    setEnabled(next); // optimistic
    start(async () => {
      const res = await setSmsEnabled(next);
      if (!res.ok) {
        setEnabled(!next);
        toast.error(res.error);
      } else {
        toast.success(next ? "SMS enabled." : "SMS disabled.");
      }
    });
  }

  return (
    <div className={cn(CARD, "flex flex-wrap items-center justify-between gap-6")}>
      <div className="flex items-center gap-4">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-brand-blue/10">
          <Icon icon={MessageSquare} size={22} className="text-brand-blue" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Credit balance
          </p>
          <p
            className={cn(
              "text-3xl font-bold tracking-tight",
              balance === 0 ? "text-danger" : low ? "text-warning" : "text-text-primary",
            )}
          >
            {balance.toLocaleString("en-GB")}
          </p>
          {balance === 0 ? (
            <p className="text-xs font-medium text-danger">Out of credits — SMS won&apos;t send.</p>
          ) : low ? (
            <p className="text-xs font-medium text-warning">Running low — top up soon.</p>
          ) : null}
        </div>
      </div>

      <Switch
        checked={enabled}
        onChange={() => toggle()}
        disabled={pending}
        label="Enable SMS notifications"
      />
    </div>
  );
}

function PackageCard({ pkg }: { pkg: PackageRow }) {
  const [pending, start] = useTransition();

  function buy() {
    start(async () => {
      const res = await createCheckout(pkg.credits);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      window.location.href = res.checkoutUrl;
    });
  }

  return (
    <div
      className={cn(
        "relative flex flex-col gap-3 rounded-2xl border bg-surface-card p-5 transition",
        pkg.popular ? "border-brand-blue ring-1 ring-brand-blue/30" : "border-border",
      )}
    >
      {pkg.popular && (
        <span className="absolute -top-2.5 left-5 rounded-full bg-brand-blue px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
          Popular
        </span>
      )}
      <div>
        <p className="text-2xl font-bold tracking-tight text-text-primary">
          {pkg.credits.toLocaleString("en-GB")}
        </p>
        <p className="text-xs font-medium text-text-muted">credits</p>
      </div>
      <p className="text-sm font-semibold text-text-secondary">{formatPrice(pkg.pricePence)}</p>
      <button
        type="button"
        onClick={buy}
        disabled={pending}
        className={cn(
          "mt-1 inline-flex h-10 items-center justify-center gap-2 rounded-button text-sm font-semibold transition",
          pkg.popular
            ? "bg-brand-blue text-white hover:bg-brand-blue-dark"
            : "border border-border text-text-primary hover:bg-surface",
          pending && "opacity-60",
        )}
      >
        {pending ? <Icon icon={Loader2} size={15} className="animate-spin" /> : <Icon icon={Zap} size={15} />}
        Buy
      </button>
    </div>
  );
}

function SenderSection({ senderName }: { senderName: string }) {
  const [name, setName] = useState(senderName);
  const [pending, start] = useTransition();

  function save() {
    start(async () => {
      const res = await saveSmsSender({ senderName: name });
      if (res.ok) toast.success("Sender saved.");
      else toast.error(res.error);
    });
  }

  return (
    <section className={cn(CARD, "space-y-4")}>
      <SectionHeading title="Sender" subtitle="What recipients see as the sender." />
      <label className={FIELD_LABEL}>
        Sender name
        <input
          className={FIELD_INPUT}
          value={name}
          maxLength={11}
          placeholder="BookMyTech"
          onChange={(e) => setName(e.target.value)}
        />
        <span className="text-xs font-normal text-text-muted">
          1–11 letters/numbers, no spaces.
        </span>
      </label>
      <p className="rounded-button bg-surface px-3 py-2 text-xs text-text-muted">
        The sending phone number is managed centrally by Book My Tech and
        can&apos;t be changed here.
      </p>
      <SaveButton pending={pending} onClick={save} />
    </section>
  );
}

function AlertEmailSection({ email }: { email: string }) {
  const [value, setValue] = useState(email);
  const [pending, start] = useTransition();

  function save() {
    start(async () => {
      const res = await saveLowCreditEmail(value);
      if (res.ok) toast.success("Alert email saved.");
      else toast.error(res.error);
    });
  }

  return (
    <section className={cn(CARD, "space-y-4")}>
      <SectionHeading
        title="Low-credit alert"
        subtitle={`Emailed once when the balance drops to ${LOW_CREDIT_THRESHOLD} or below.`}
      />
      <label className={FIELD_LABEL}>
        Alert email
        <input
          className={FIELD_INPUT}
          type="email"
          value={value}
          placeholder="owner@bookmytech.co.uk"
          onChange={(e) => setValue(e.target.value)}
        />
      </label>
      <SaveButton pending={pending} onClick={save} />
    </section>
  );
}

function TestSendSection({ enabled, balance }: { enabled: boolean; balance: number }) {
  const [phone, setPhone] = useState("");
  const [pending, start] = useTransition();
  const blocked = !enabled || balance < 1;

  function send() {
    start(async () => {
      const res = await sendTestSms(phone);
      if (res.ok) {
        toast.success("Test SMS sent — 1 credit used.");
        setPhone("");
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <section className={cn(CARD, "space-y-4")}>
      <SectionHeading title="Send a test" subtitle="Sends one real SMS and uses one credit." />
      {blocked && (
        <p className="rounded-button bg-warning/10 px-3 py-2 text-xs font-medium text-warning">
          {!enabled ? "Enable SMS above to send a test." : "No credits — buy some first."}
        </p>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <label className={cn(FIELD_LABEL, "flex-1")}>
          Phone number
          <input
            className={FIELD_INPUT}
            value={phone}
            placeholder="07700 900000"
            onChange={(e) => setPhone(e.target.value)}
          />
        </label>
        <button
          type="button"
          onClick={send}
          disabled={pending || blocked || !phone.trim()}
          className="inline-flex h-11 items-center gap-2 rounded-button bg-brand-blue px-4 text-sm font-semibold text-white transition hover:bg-brand-blue-dark disabled:opacity-50"
        >
          {pending ? <Icon icon={Loader2} size={15} className="animate-spin" /> : <Icon icon={Send} size={15} />}
          Send test
        </button>
      </div>
    </section>
  );
}

function ComposeSection({ enabled, balance }: { enabled: boolean; balance: number }) {
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const blocked = !enabled || balance < 1;

  function send() {
    start(async () => {
      const res = await sendCustomSms({ to: phone, body: message });
      if (res.ok) {
        toast.success("Message sent — 1 credit used.");
        setPhone("");
        setMessage("");
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <section className={cn(CARD, "space-y-4")}>
      <SectionHeading
        title="Send a message"
        subtitle="One-off SMS to any number. Uses one credit."
      />
      {blocked && (
        <p className="rounded-button bg-warning/10 px-3 py-2 text-xs font-medium text-warning">
          {!enabled ? "Enable SMS above to send." : "No credits — buy some first."}
        </p>
      )}
      <label className={FIELD_LABEL}>
        Phone number
        <input
          className={FIELD_INPUT}
          value={phone}
          placeholder="07700 900000"
          onChange={(e) => setPhone(e.target.value)}
        />
      </label>
      <label className={FIELD_LABEL}>
        Message
        <textarea
          className={cn(FIELD_INPUT, "h-24 resize-y py-2.5 leading-relaxed")}
          value={message}
          maxLength={1000}
          placeholder="Type your message…"
          onChange={(e) => setMessage(e.target.value)}
        />
        <span className="text-xs font-normal text-text-muted">{message.length}/1000</span>
      </label>
      <button
        type="button"
        onClick={send}
        disabled={pending || blocked || !phone.trim() || !message.trim()}
        className="inline-flex h-11 items-center gap-2 rounded-button bg-brand-blue px-4 text-sm font-semibold text-white transition hover:bg-brand-blue-dark disabled:opacity-50"
      >
        {pending ? <Icon icon={Loader2} size={15} className="animate-spin" /> : <Icon icon={Send} size={15} />}
        Send message
      </button>
    </section>
  );
}

function PurchaseHistory({ purchases }: { purchases: PurchaseRow[] }) {
  return (
    <section className="space-y-3">
      <SectionHeading title="Purchase history" subtitle="Confirmed top-ups." />
      <div className="overflow-hidden rounded-2xl border border-border bg-surface-card">
        {purchases.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-text-muted">No purchases yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle text-left text-xs font-semibold uppercase tracking-wide text-text-muted">
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Credits</th>
                <th className="px-5 py-3">Paid</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {purchases.map((p) => (
                <tr key={p.id} className="border-b border-border-subtle last:border-b-0">
                  <td className="px-5 py-3 text-text-secondary">
                    {new Date(p.created_at).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-5 py-3 font-medium text-text-primary">
                    +{p.credits_purchased.toLocaleString("en-GB")}
                  </td>
                  <td className="px-5 py-3 text-text-secondary">{formatPrice(p.amount_paid_pence)}</td>
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
                      <Icon icon={Check} size={12} /> {p.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function SaveButton({ pending, onClick }: { pending: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="inline-flex h-10 items-center gap-2 rounded-button bg-brand-blue px-4 text-sm font-semibold text-white transition hover:bg-brand-blue-dark disabled:opacity-60"
    >
      {pending && <Icon icon={Loader2} size={15} className="animate-spin" />}
      Save
    </button>
  );
}
