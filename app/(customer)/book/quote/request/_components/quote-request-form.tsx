"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { requestQuoteAction } from "@/app/actions/custom-quotes";

const INPUT =
  "h-12 w-full rounded-xl border border-border bg-white px-3.5 text-[15px] font-normal text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20 disabled:opacity-60";
const LABEL = "flex flex-col gap-1.5 text-sm font-semibold text-text-primary";

interface Initial {
  reg: string;
  make: string;
  model: string;
  description: string;
  name: string;
  email: string;
  phone: string;
  postcode: string;
}

export function QuoteRequestForm({ initial, emailLocked }: { initial: Initial; emailLocked: boolean }) {
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (key: keyof Initial) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-[20px] border border-border bg-white p-6 text-center shadow-card">
        <CheckCircle2 size={36} className="text-success" />
        <h2 className="text-lg font-bold text-text-primary">Request sent</h2>
        <p className="text-[15px] text-text-secondary">
          We&apos;ll price the job and email your quote to <strong>{sent}</strong>, usually within one working day.
          You can book it straight from that email.
        </p>
        <Link href="/" className="text-sm font-semibold text-brand-blue hover:underline">
          Back to the homepage
        </Link>
      </div>
    );
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await requestQuoteAction(values);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSent(values.email.trim());
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col gap-6"
    >
      <div className="flex flex-col gap-5 rounded-[20px] border border-border bg-white p-5 shadow-card sm:p-6">
        <label className={LABEL}>
          What do you need doing?
          <textarea
            value={values.description}
            onChange={set("description")}
            disabled={pending}
            rows={5}
            maxLength={2000}
            required
            placeholder="e.g. The rear wiper has stopped working. I think it's the motor."
            className="w-full resize-y rounded-xl border border-border bg-white px-3.5 py-3 text-[15px] font-normal text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20"
          />
        </label>

        <div className="grid gap-5 sm:grid-cols-2">
          <label className={LABEL}>
            Registration
            <input
              type="text"
              value={values.reg}
              onChange={(e) => setValues((v) => ({ ...v, reg: e.target.value.toUpperCase() }))}
              disabled={pending}
              required
              maxLength={10}
              autoCapitalize="characters"
              className={cn(INPUT, "font-bold uppercase tracking-[0.04em]")}
            />
          </label>
          <label className={LABEL}>
            <span>
              Postcode <span className="font-normal text-text-muted">(optional)</span>
            </span>
            <input
              type="text"
              value={values.postcode}
              onChange={(e) => setValues((v) => ({ ...v, postcode: e.target.value.toUpperCase() }))}
              disabled={pending}
              maxLength={8}
              autoComplete="postal-code"
              className={INPUT}
            />
          </label>
        </div>

        <label className={LABEL}>
          Your name
          <input
            type="text"
            value={values.name}
            onChange={set("name")}
            disabled={pending}
            required
            autoComplete="name"
            className={INPUT}
          />
        </label>
        <div className="grid gap-5 sm:grid-cols-2">
          <label className={LABEL}>
            Email
            <input
              type="email"
              value={values.email}
              onChange={set("email")}
              disabled={pending || emailLocked}
              required
              autoComplete="email"
              className={INPUT}
            />
          </label>
          <label className={LABEL}>
            <span>
              Mobile <span className="font-normal text-text-muted">(optional)</span>
            </span>
            <input
              type="tel"
              value={values.phone}
              onChange={set("phone")}
              disabled={pending}
              autoComplete="tel"
              className={INPUT}
            />
          </label>
        </div>

        {error && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
            {error}
          </p>
        )}
      </div>

      <div>
        <Button type="submit" variant="primary" size="lg" fullWidth disabled={pending}>
          {pending ? "Sending…" : "Send my request"}
        </Button>
        <p className="mt-2 text-center text-[12px] text-text-muted">
          Free, and nothing is booked until you choose a time from your quote.
        </p>
      </div>
    </form>
  );
}
