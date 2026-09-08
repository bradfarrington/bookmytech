"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  BadgePoundSterling,
  Loader2,
  Plus,
  Search,
  Send,
  Trash2,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { cn, formatPrice } from "@/lib/utils";
import { safePriceQuoteLines, type QuoteLineInput, type QuoteLineKind } from "@/lib/quotes/pricing";
import { QUOTABLE_STATUSES, QUOTE_KIND_LABEL, QUOTE_STATUS_LABEL } from "@/lib/quotes/status";
import type { FaultView, QuoteView } from "@/lib/quotes/load";
import { addFaultAction, deleteFaultAction } from "@/app/actions/booking-faults";
import {
  createQuoteAction,
  listQuotePartsAction,
  searchJobRepairTimesAction,
  withdrawQuoteAction,
} from "@/app/actions/job-quotes";

// Faults, quotes and price changes on the job (Task 33) — Gareth's "adjust the
// labour and parts with a button to add labour and parts", "a box where
// mechanics can add faults", and "an automatic quote tool". The automatic part:
// a labour line's hours come from HaynesPro's book time when the mechanic picks
// the job from this car's tree; parts come from the catalogue with the BMT
// price filled in. Everything is priced server-side again on send; the totals
// here are the same pure arithmetic, for display.

interface JobExtrasProps {
  bookingId: string;
  status: string;
  faults: FaultView[];
  quotes: QuoteView[];
  hourlyRatePence: number;
  commissionRate: number;
}

interface DraftLine {
  key: string;
  kind: QuoteLineKind;
  description: string;
  hours: string;
  quantity: string;
  unitPounds: string;
  nodeId: string | null;
  partId: string | null;
  faultId: string | null;
}

let keySeq = 0;
const newKey = () => `l${++keySeq}`;

function poundsToPence(v: string): number {
  const n = Number.parseFloat(v.replace(/[£,\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

function toInputs(lines: DraftLine[]): QuoteLineInput[] {
  return lines.map((l) => ({
    kind: l.kind,
    description: l.description,
    hours: l.kind === "labour" ? Number(l.hours) : null,
    quantity: l.kind === "labour" ? 1 : Number(l.quantity || 1),
    unitPence: l.kind === "labour" ? null : poundsToPence(l.unitPounds),
    nodeId: l.nodeId,
    partId: l.partId,
    faultId: l.faultId,
  }));
}

const INPUT =
  "h-10 rounded-button border border-border bg-surface-card px-3 text-sm text-text-primary placeholder:text-text-muted focus:border-brand-blue focus:outline-none";

export function JobExtras({ bookingId, status, faults, quotes, hourlyRatePence, commissionRate }: JobExtrasProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const canNote = ["confirmed", "en_route", "in_progress"].includes(status);
  const canQuoteNow = QUOTABLE_STATUSES.now.includes(status);
  const canQuoteFollowOn = QUOTABLE_STATUSES.follow_on.includes(status);
  const pendingNow = quotes.find((q) => q.kind === "now" && q.status === "sent") ?? null;

  const [builderOpen, setBuilderOpen] = useState(false);
  const [kind, setKind] = useState<"now" | "follow_on">(canQuoteNow ? "now" : "follow_on");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);

  function run(action: () => Promise<{ ok: boolean; error?: string }>, success?: string, after?: () => void) {
    startTransition(async () => {
      const res = await action();
      if (!res.ok) {
        toast.error(res.error ?? "Something went wrong.");
        return;
      }
      if (success) toast.success(success);
      after?.();
      router.refresh();
    });
  }

  function openBuilderFor(fault?: FaultView) {
    setBuilderOpen(true);
    if (fault) {
      setLines((ls) => [
        ...ls,
        { key: newKey(), kind: "labour", description: fault.description.slice(0, 120), hours: "", quantity: "1", unitPounds: "", nodeId: null, partId: null, faultId: fault.id },
      ]);
      if (!title) setTitle(fault.description.slice(0, 80));
    } else if (lines.length === 0) {
      setLines([{ key: newKey(), kind: "labour", description: "", hours: "", quantity: "1", unitPounds: "", nodeId: null, partId: null, faultId: null }]);
    }
  }

  const priced = useMemo(() => safePriceQuoteLines(toInputs(lines), { hourlyRatePence, commissionRate }), [lines, hourlyRatePence, commissionRate]);

  function send() {
    run(
      () => createQuoteAction({ bookingId, kind, title, note, lines: toInputs(lines) }),
      kind === "now" ? "Quote sent — don't start until it shows Approved." : "Quote sent for a return visit.",
      () => {
        setBuilderOpen(false);
        setLines([]);
        setTitle("");
        setNote("");
      },
    );
  }

  return (
    <div className="space-y-6">
      {/* Faults */}
      <section className="space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-text-primary">
          <AlertTriangle size={15} className="text-amber-600" />
          Faults found
        </h3>
        {faults.length === 0 ? (
          <p className="text-sm text-text-muted">Nothing noted yet.</p>
        ) : (
          <ul className="divide-y divide-border-subtle rounded-xl border border-border">
            {faults.map((f) => (
              <li key={f.id} className="flex items-start justify-between gap-3 px-3.5 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm text-text-primary">{f.description}</p>
                  <p className="mt-0.5 text-xs text-text-muted">
                    <span className={f.severity === "urgent" ? "font-semibold text-red-700" : "text-amber-700"}>
                      {f.severity === "urgent" ? "Urgent" : "Advisory"}
                    </span>
                    {f.quoteId && " · quoted"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {(canQuoteNow || canQuoteFollowOn) && !f.quoteId && (
                    <button
                      type="button"
                      onClick={() => openBuilderFor(f)}
                      className="rounded-button px-2 py-1 text-xs font-semibold text-brand-blue hover:bg-blue-50"
                    >
                      Quote this
                    </button>
                  )}
                  {canNote && !f.quoteId && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => deleteFaultAction(f.id), "Removed.")}
                      className="inline-flex size-7 items-center justify-center rounded-button text-text-muted hover:bg-red-50 hover:text-red-600"
                      aria-label={`Remove fault "${f.description}"`}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {canNote && <AddFault bookingId={bookingId} pending={pending} run={run} />}
      </section>

      {/* Quotes */}
      <section className="space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-text-primary">
          <BadgePoundSterling size={15} className="text-brand-blue" />
          Quotes &amp; price changes
        </h3>
        {quotes.length === 0 && <p className="text-sm text-text-muted">No quotes on this job yet.</p>}
        {quotes.length > 0 && (
          <ul className="space-y-2">
            {quotes.map((q) => (
              <li key={q.id} className="rounded-xl border border-border bg-surface-card px-3.5 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-text-primary">
                      {q.title ?? QUOTE_KIND_LABEL[q.kind]}
                    </p>
                    <p className="mt-0.5 text-xs text-text-muted">
                      {QUOTE_KIND_LABEL[q.kind]} ·{" "}
                      <span
                        className={cn(
                          "font-semibold",
                          q.status === "approved" && "text-success",
                          q.status === "sent" && "text-amber-700",
                          (q.status === "declined" || q.status === "expired" || q.status === "withdrawn") && "text-text-muted",
                        )}
                      >
                        {QUOTE_STATUS_LABEL[q.status]}
                      </span>
                    </p>
                    <ul className="mt-1.5 space-y-0.5 text-xs text-text-secondary">
                      {q.lines.map((l) => (
                        <li key={l.id}>
                          {l.description}
                          {l.kind === "labour" ? ` · ${l.hours} h` : l.quantity > 1 ? ` × ${l.quantity}` : ""} · {formatPrice(l.linePence)}
                        </li>
                      ))}
                    </ul>
                    {q.status === "approved" && q.kind === "now" && (
                      <p className="mt-1.5 text-xs font-semibold text-success">Approved and authorised — go ahead. Paid with the job.</p>
                    )}
                    {q.status === "sent" && q.kind === "now" && (
                      <p className="mt-1.5 text-xs font-semibold text-amber-700">Don&apos;t start this work until it shows Approved.</p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className="text-sm font-bold tabular-nums text-text-primary">{formatPrice(q.totalPence)}</span>
                    {q.status === "sent" && (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => run(() => withdrawQuoteAction(q.id), "Quote withdrawn.")}
                        className="text-xs font-semibold text-text-muted hover:text-red-600"
                      >
                        Withdraw
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {(canQuoteNow || canQuoteFollowOn) && !builderOpen && (
          <Button size="sm" variant="secondary" iconLeft={Plus} onClick={() => openBuilderFor()} disabled={pending}>
            Add labour or parts
          </Button>
        )}
        {!canQuoteNow && !canQuoteFollowOn && (
          <p className="text-xs text-text-muted">Quotes can be sent once work has begun (and a return visit after completion).</p>
        )}

        {builderOpen && (
          <div className="space-y-4 rounded-2xl border border-brand-blue/30 bg-blue-50/40 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-bold text-text-primary">New quote</p>
              <button type="button" onClick={() => setBuilderOpen(false)} className="text-xs font-semibold text-text-muted hover:text-text-primary">
                Cancel
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs font-semibold text-text-muted">
                What kind of work
                <Select<"now" | "follow_on">
                  value={kind}
                  onChange={setKind}
                  options={[
                    ...(canQuoteNow ? [{ value: "now" as const, label: "Do it today — add to this job" }] : []),
                    ...(canQuoteFollowOn ? [{ value: "follow_on" as const, label: "Book a return visit" }] : []),
                  ]}
                  aria-label="Kind of quote"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-text-muted">
                Title (optional)
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Rear brake pads" className={INPUT} maxLength={120} />
              </label>
            </div>
            {kind === "now" && pendingNow && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                A quote is already waiting on the customer — withdraw it first to send another for this visit.
              </p>
            )}

            <ul className="space-y-3">
              {lines.map((line) => (
                <DraftLineRow
                  key={line.key}
                  line={line}
                  bookingId={bookingId}
                  hourlyRatePence={hourlyRatePence}
                  onChange={(next) => setLines((ls) => ls.map((l) => (l.key === line.key ? next : l)))}
                  onRemove={() => setLines((ls) => ls.filter((l) => l.key !== line.key))}
                />
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="ghost"
                iconLeft={Wrench}
                onClick={() => setLines((ls) => [...ls, { key: newKey(), kind: "labour", description: "", hours: "", quantity: "1", unitPounds: "", nodeId: null, partId: null, faultId: null }])}
              >
                Add labour
              </Button>
              <Button
                size="sm"
                variant="ghost"
                iconLeft={Plus}
                onClick={() => setLines((ls) => [...ls, { key: newKey(), kind: "part", description: "", hours: "", quantity: "1", unitPounds: "", nodeId: null, partId: null, faultId: null }])}
              >
                Add part
              </Button>
              <Button
                size="sm"
                variant="ghost"
                iconLeft={Plus}
                onClick={() => setLines((ls) => [...ls, { key: newKey(), kind: "other", description: "", hours: "", quantity: "1", unitPounds: "", nodeId: null, partId: null, faultId: null }])}
              >
                Add other
              </Button>
            </div>

            <label className="flex flex-col gap-1 text-xs font-semibold text-text-muted">
              Note to the customer (optional)
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000} placeholder="What you found and why it needs doing" className={`${INPUT} h-auto py-2`} />
            </label>

            <div className="rounded-xl bg-surface-card px-3.5 py-3 text-sm">
              {priced.ok ? (
                <>
                  <div className="flex justify-between"><span className="text-text-secondary">Labour</span><span className="tabular-nums">{formatPrice(priced.totals.labourPence)}</span></div>
                  <div className="flex justify-between"><span className="text-text-secondary">Parts</span><span className="tabular-nums">{formatPrice(priced.totals.partsPence)}</span></div>
                  <div className="mt-1 flex justify-between border-t border-border pt-1 font-bold"><span>Customer pays</span><span className="tabular-nums">{formatPrice(priced.totals.totalPence)}</span></div>
                  <div className="flex justify-between text-xs text-text-muted"><span>You receive (after {Math.round(commissionRate * 1000) / 10}% fee)</span><span className="tabular-nums">{formatPrice(priced.totals.mechanicPayoutPence)}</span></div>
                </>
              ) : (
                <p className="text-xs text-text-muted">{lines.length ? priced.error : "Add a line to see the price."}</p>
              )}
            </div>

            <Button
              size="sm"
              iconLeft={Send}
              disabled={pending || !priced.ok || (kind === "now" && Boolean(pendingNow))}
              onClick={send}
            >
              Send to customer
            </Button>
            <p className="text-xs text-text-muted">
              {kind === "now"
                ? "The customer approves and authorises the amount on their card; it's charged with the job when you complete it. Don't start until it shows Approved."
                : "The customer books the return visit from the quote; you're offered the job first."}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function AddFault({
  bookingId,
  pending,
  run,
}: {
  bookingId: string;
  pending: boolean;
  run: (action: () => Promise<{ ok: boolean; error?: string }>, success?: string, after?: () => void) => void;
}) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<"advisory" | "urgent">("advisory");
  if (!open) {
    return (
      <Button size="sm" variant="ghost" iconLeft={Plus} onClick={() => setOpen(true)}>
        Add a fault
      </Button>
    );
  }
  return (
    <form
      className="space-y-2 rounded-xl border border-border bg-surface p-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => addFaultAction({ bookingId, description, severity }), "Fault noted.", () => {
          setDescription("");
          setOpen(false);
        });
      }}
    >
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        maxLength={500}
        placeholder="What you found, e.g. rear pads worn to 2 mm"
        aria-label="Fault description"
        className={`${INPUT} h-auto w-full py-2`}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Select<"advisory" | "urgent">
          value={severity}
          onChange={setSeverity}
          options={[
            { value: "advisory", label: "Advisory" },
            { value: "urgent", label: "Urgent" },
          ]}
          aria-label="Severity"
          className="min-w-36"
        />
        <Button type="submit" size="sm" disabled={pending || !description.trim()}>
          Save fault
        </Button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs font-semibold text-text-muted hover:text-text-primary">
          Cancel
        </button>
      </div>
    </form>
  );
}

function DraftLineRow({
  line,
  bookingId,
  hourlyRatePence,
  onChange,
  onRemove,
}: {
  line: DraftLine;
  bookingId: string;
  hourlyRatePence: number;
  onChange: (next: DraftLine) => void;
  onRemove: () => void;
}) {
  const linePence =
    line.kind === "labour"
      ? Math.round((Number(line.hours) || 0) * hourlyRatePence)
      : (Number(line.quantity) || 0) * (poundsToPence(line.unitPounds) || 0);
  return (
    <li className="space-y-2 rounded-xl border border-border bg-surface-card p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          {line.kind === "labour" ? "Labour" : line.kind === "part" ? "Part" : "Other"}
          {line.faultId && " · for a fault you noted"}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold tabular-nums text-text-primary">{formatPrice(Number.isFinite(linePence) ? linePence : 0)}</span>
          <button type="button" onClick={onRemove} className="inline-flex size-7 items-center justify-center rounded-button text-text-muted hover:bg-red-50 hover:text-red-600" aria-label="Remove line">
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      {line.kind === "labour" ? (
        <>
          <RepairTimeSearch
            bookingId={bookingId}
            onPick={(hit) => onChange({ ...line, description: hit.description, hours: String(hit.hours), nodeId: hit.nodeId })}
          />
          <div className="grid gap-2 sm:grid-cols-[1fr_120px]">
            <input value={line.description} onChange={(e) => onChange({ ...line, description: e.target.value, nodeId: null })} placeholder="What the work is" aria-label="Labour description" className={INPUT} maxLength={200} />
            <input value={line.hours} onChange={(e) => onChange({ ...line, hours: e.target.value })} inputMode="decimal" placeholder="Hours" aria-label="Hours" className={INPUT} />
          </div>
          <p className="text-xs text-text-muted">
            {line.nodeId ? "Hours from the manufacturer's book time." : "Search a job above to fill the hours in from the book time, or type them."} × {formatPrice(hourlyRatePence)}/h
          </p>
        </>
      ) : (
        <>
          {line.kind === "part" ? (
            <PartPicker line={line} onChange={onChange} />
          ) : (
            <input value={line.description} onChange={(e) => onChange({ ...line, description: e.target.value })} placeholder="e.g. Brake cleaner" aria-label="Description" className={`${INPUT} w-full`} maxLength={200} />
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-xs text-text-muted">
              Qty
              <input value={line.quantity} onChange={(e) => onChange({ ...line, quantity: e.target.value })} inputMode="numeric" aria-label="Quantity" className={`${INPUT} w-20`} />
            </label>
            <label className="flex items-center gap-2 text-xs text-text-muted">
              Each £
              <input value={line.unitPounds} onChange={(e) => onChange({ ...line, unitPounds: e.target.value, partId: null })} inputMode="decimal" placeholder="0.00" aria-label="Unit price in pounds" className={`${INPUT} w-28`} />
            </label>
          </div>
        </>
      )}
    </li>
  );
}

function RepairTimeSearch({
  bookingId,
  onPick,
}: {
  bookingId: string;
  onPick: (hit: { nodeId: string; description: string; hours: number; pricePence: number }) => void;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Array<{ nodeId: string; description: string; hours: number; pricePence: number }>>([]);
  const [truncated, setTruncated] = useState(false);
  const [searching, setSearching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(0);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); latest.current++; }, []);

  function onQuery(value: string) {
    setQuery(value);
    if (timer.current) clearTimeout(timer.current);
    const q = value.trim();
    const ticket = ++latest.current;
    if (q.length < 3) { setHits([]); return; }
    setSearching(true);
    timer.current = setTimeout(async () => {
      const res = await searchJobRepairTimesAction({ bookingId, query: q });
      if (ticket !== latest.current) return;
      setSearching(false);
      if (!res.ok) { toast.error(res.error); return; }
      setHits(res.hits);
      setTruncated(res.truncated);
    }, 350);
  }

  return (
    <div className="space-y-1.5">
      <label className="relative block">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Find the book time, e.g. rear brake pads" aria-label="Search repair book times" className={`${INPUT} w-full pl-9 pr-9`} />
        {searching && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-text-muted" />}
      </label>
      {hits.length > 0 && (
        <ul className="max-h-48 divide-y divide-border-subtle overflow-y-auto rounded-lg border border-border bg-surface">
          {hits.map((h) => (
            <li key={h.nodeId}>
              <button
                type="button"
                onClick={() => { onPick(h); setHits([]); setQuery(""); }}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-surface-card"
              >
                <span className="min-w-0 truncate text-text-primary">{h.description}</span>
                <span className="shrink-0 text-xs text-text-muted">{h.hours} h · {formatPrice(h.pricePence)}</span>
              </button>
            </li>
          ))}
          {truncated && <li className="px-3 py-1.5 text-[11px] text-text-muted">Closest matches — be more specific to find others.</li>}
        </ul>
      )}
    </div>
  );
}

function PartPicker({ line, onChange }: { line: DraftLine; onChange: (next: DraftLine) => void }) {
  const [parts, setParts] = useState<Array<{ id: string; name: string; bmtPricePence: number }> | null>(null);
  useEffect(() => {
    let cancelled = false;
    listQuotePartsAction().then((res) => {
      if (!cancelled && res.ok) setParts(res.parts);
    });
    return () => { cancelled = true; };
  }, []);
  const names = useMemo(() => (parts ?? []).map((p) => p.name), [parts]);
  return (
    <div className="space-y-1">
      <Combobox
        value={line.description}
        onChange={(value) => {
          const match = (parts ?? []).find((p) => p.name.toLowerCase() === value.trim().toLowerCase());
          onChange(match ? { ...line, description: match.name, partId: match.id, unitPounds: (match.bmtPricePence / 100).toFixed(2) } : { ...line, description: value, partId: null });
        }}
        options={names}
        placeholder={parts == null ? "Loading parts…" : "Part name — pick from the catalogue or type your own"}
        aria-label="Part"
      />
      <p className="text-xs text-text-muted">{line.partId ? "From the catalogue — BMT price filled in." : "Not in the catalogue — enter the price you'll charge."}</p>
    </div>
  );
}

