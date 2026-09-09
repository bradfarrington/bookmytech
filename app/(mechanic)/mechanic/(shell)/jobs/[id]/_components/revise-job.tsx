"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRightLeft, ChevronDown, Loader2, Plus, Search, Send, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { cn, formatPrice } from "@/lib/utils";
import { groupRepairLines } from "@/lib/bookings/repair-lines";
import { REVISABLE_STATUSES, REVISION_STATUS_LABEL, isRevisionExpired, type OnSiteCharge } from "@/lib/revisions/status";
import { differenceLabel, diffRevision, hasChanges, mechanicDirectionSentence } from "@/lib/revisions/diff";
import { onSiteFeeOptions } from "@/lib/revisions/fees";
import { revisionMoney, type RevisionView } from "@/lib/revisions/load";
import type { RevisionPreview, RevisionPartInput } from "@/lib/revisions/mechanic";
import type { CatalogueHit } from "@/lib/revisions/mechanic";
import { listQuotePartsAction } from "@/app/actions/job-quotes";
import {
  endJobOnSiteAction,
  previewRevisionAction,
  searchJobCatalogueAction,
  sendRevisionAction,
  withdrawRevisionAction,
} from "@/app/actions/job-revisions";

// "Change what's being done" (Task 37) — Gareth's item 9 as Brad clarified
// it: the mechanic gets to site, finds the booked repair isn't right, rewrites
// the job sheet (repairs from this car's catalogue, parts kept, added or
// removed), and the customer approves the new job at its new price, up or
// down. Everything is priced server-side — the preview is the same figures
// the customer will see. If the customer declines, the mechanic ends the job
// from here, charging the on-site diagnostic, the cancellation fee, or nothing.

export interface ReviseJobLine {
  nodeId: string | null;
  description: string;
  chargedHours: number | null;
  linePence: number | null;
  itemId: string | null;
  itemLabel: string | null;
  product: boolean;
}

export interface ReviseJobPart {
  id: string;
  name: string;
  quantity: number;
  unitPricePence: number;
  totalPence: number;
  sourcing: "self" | "bmt";
}

interface ReviseJobProps {
  bookingId: string;
  status: string;
  lines: ReviseJobLine[];
  parts: ReviseJobPart[];
  revisions: RevisionView[];
  fees: { diagnosticPence: number; enRoutePence: number };
}

interface DraftPart {
  key: string;
  /** Set for a part already on the booking. */
  id: string | null;
  partId: string | null;
  name: string;
  quantity: string;
  unitPounds: string;
  /** Existing parts show their booked price; only new ones are editable. */
  existing: boolean;
}

let keySeq = 0;
const newKey = () => `r${++keySeq}`;

const INPUT =
  "h-10 rounded-button border border-border bg-surface-card px-3 text-sm text-text-primary placeholder:text-text-muted focus:border-brand-blue focus:outline-none";

function poundsToPence(v: string): number {
  const n = Number.parseFloat(v.replace(/[£,\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

/** One chip per chosen catalogue item: a combined repair once, a plain job by itself. */
interface ChosenItem {
  id: string;
  label: string;
  detail: string;
}

function chosenFromLines(lines: ReviseJobLine[]): ChosenItem[] {
  return groupRepairLines(lines).map((g) => {
    const first = g.lines[0];
    const id = g.label ? (first.itemId ?? first.nodeId ?? g.key) : (first.nodeId ?? g.key);
    const hours = g.lines.reduce((s, l) => s + (l.chargedHours ?? 0), 0);
    const pence = g.lines.reduce((s, l) => s + (l.linePence ?? 0), 0);
    return {
      id,
      label: g.label ?? first.description,
      detail: g.label
        ? g.lines.map((l) => l.description).join(" + ")
        : first.product
          ? `fixed price · ${formatPrice(pence)}`
          : `${hours} h${pence ? ` · ${formatPrice(pence)}` : ""}`,
    };
  });
}

export function ReviseJob({ bookingId, status, lines, parts, revisions, fees }: ReviseJobProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const money = useMemo(() => revisionMoney(revisions), [revisions]);
  const canRevise = REVISABLE_STATUSES.includes(status);

  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<ChosenItem[]>(() => chosenFromLines(lines));
  const [draftParts, setDraftParts] = useState<DraftPart[]>(() =>
    parts.map((p) => ({ key: newKey(), id: p.id, partId: null, name: p.name, quantity: String(p.quantity), unitPounds: (p.unitPricePence / 100).toFixed(2), existing: true })),
  );
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  // `forKey` names the inputs a result was priced for, so a stale preview is
  // never mistaken for the current one while a re-price is in flight.
  const [preview, setPreview] = useState<{ state: "idle" | "loading" | "ready" | "error"; result?: RevisionPreview; error?: string; forKey?: string }>({ state: "idle" });

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

  const partsInput = useMemo<RevisionPartInput[]>(
    () =>
      draftParts.map((p) =>
        p.id
          ? { id: p.id }
          : p.partId
            ? { partId: p.partId, quantity: Number(p.quantity) || 1 }
            : { name: p.name, quantity: Number(p.quantity) || 1, unitPence: poundsToPence(p.unitPounds) },
      ),
    [draftParts],
  );
  const repairIds = useMemo(() => chosen.map((c) => c.id), [chosen]);
  const inputKey = useMemo(() => JSON.stringify({ repairIds, partsInput }), [repairIds, partsInput]);

  // Re-price on every change, debounced — the server is the only pricer.
  // Everything happens inside the timer so the effect itself sets no state.
  const latest = useRef(0);
  useEffect(() => {
    if (!open || repairIds.length === 0) return;
    const ticket = ++latest.current;
    const key = inputKey;
    const handle = setTimeout(async () => {
      setPreview((p) => ({ ...p, state: "loading" }));
      const res = await previewRevisionAction({ bookingId, repairIds, parts: partsInput });
      if (ticket !== latest.current) return;
      if (!res.ok) setPreview({ state: "error", error: res.error, forKey: key });
      else setPreview({ state: "ready", result: res.preview, forKey: key });
    }, 450);
    return () => clearTimeout(handle);
  }, [open, bookingId, repairIds, partsInput, inputKey]);
  const previewCurrent = preview.state === "ready" && preview.forKey === inputKey;

  function send() {
    run(
      () => sendRevisionAction({ bookingId, repairIds, parts: partsInput, reason, note }),
      "Revised job sent — don't start the new work until it shows Approved.",
      () => setOpen(false),
    );
  }

  const diff = preview.result ? preview.result.diff : null;
  const changed = diff ? hasChanges(diff) : false;

  // --- Waiting on the customer -------------------------------------------------
  if (money.pending) {
    const r = money.pending;
    return (
      <div className="space-y-3">
        <RevisionSummary revision={r} />
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
          Waiting for the customer — don&apos;t start the revised work until it shows Approved.
          {r.expiresAt && ` Open until ${new Date(r.expiresAt).toLocaleString("en-GB", { weekday: "short", hour: "numeric", minute: "2-digit" })}.`}
        </p>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => withdrawRevisionAction(r.id), "Revised job withdrawn.")}
          className="text-xs font-semibold text-text-muted hover:text-red-600"
        >
          Withdraw
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* History: an approved revision is now the job sheet; declined ones unlock ending the job. */}
      {money.approved && (
        <div className="space-y-2">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-xs font-semibold text-success">
            <ArrowRightLeft size={12} /> Revised · was {formatPrice(money.approved.before.totalPence)}, now {formatPrice(money.approved.after.totalPence)}
          </p>
          <p className="text-xs text-text-muted">
            The customer approved the revised job — the job sheet above is the new one. A job can be revised once; complete it, then send a follow-on quote for anything else.
          </p>
        </div>
      )}

      {money.declined && canRevise && !open && (
        <EndJobPanel
          bookingId={bookingId}
          revision={money.declined}
          fees={fees}
          pending={pending}
          run={run}
          onRevise={() => setOpen(true)}
        />
      )}

      {!money.approved && canRevise && !open && !money.declined && (
        <div className="space-y-2">
          <p className="text-sm text-text-secondary">
            Booked the wrong repair? Change the job here — swap the repair, keep or drop parts, add what&apos;s needed — and the customer approves the new job at its new price, up or down. Found extra work <em>on top</em> of the booked job? Use <strong>Extra work &amp; faults</strong> below instead.
          </p>
          <Button size="sm" variant="secondary" iconLeft={ArrowRightLeft} onClick={() => setOpen(true)} disabled={pending}>
            Change what&apos;s being done
          </Button>
        </div>
      )}
      {!canRevise && !money.approved && !money.declined && (
        <p className="text-xs text-text-muted">The job can be changed once you&apos;ve arrived and begun work.</p>
      )}

      {open && (
        <div className="space-y-4 rounded-2xl border border-amber-400/50 bg-amber-50/40 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-bold text-text-primary">Revised job</p>
            <button type="button" onClick={() => setOpen(false)} className="text-xs font-semibold text-text-muted hover:text-text-primary">
              Cancel
            </button>
          </div>

          {/* Repairs */}
          <section className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Repairs</p>
            {chosen.length === 0 && <p className="text-xs text-text-muted">Nothing on the job — add a repair below.</p>}
            <ul className="space-y-1.5">
              {chosen.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-card px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-text-primary">{c.label}</p>
                    <p className="truncate text-xs text-text-muted">{c.detail}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setChosen((cs) => cs.filter((x) => x.id !== c.id))}
                    className="inline-flex size-7 shrink-0 items-center justify-center rounded-button text-text-muted hover:bg-red-50 hover:text-red-600"
                    aria-label={`Remove ${c.label}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
            <CatalogueSearch
              bookingId={bookingId}
              exclude={repairIds}
              onPick={(hit) =>
                setChosen((cs) => [
                  ...cs,
                  {
                    id: hit.id,
                    label: hit.bundleName ? `${hit.bundleName}${hit.optionLabel ? ` · ${hit.optionLabel}` : ""}` : hit.description,
                    detail: hit.fixedPrice
                      ? `fixed price · ${formatPrice(hit.pricePence ?? 0)}`
                      : `${hit.billedHours ?? 0} h · ${formatPrice(hit.pricePence ?? 0)}`,
                  },
                ])
              }
            />
          </section>

          {/* Parts */}
          <section className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Parts</p>
            {draftParts.length === 0 && <p className="text-xs text-text-muted">No parts on the job.</p>}
            <ul className="space-y-1.5">
              {draftParts.map((p) => (
                <li key={p.key} className="rounded-xl border border-border bg-surface-card px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    {p.existing ? (
                      <div className="min-w-0">
                        <p className="truncate text-sm text-text-primary">{p.name}</p>
                        <p className="text-xs text-text-muted">
                          {Number(p.quantity) > 1 ? `× ${p.quantity} · ` : ""}
                          {formatPrice(poundsToPence(p.unitPounds) * (Number(p.quantity) || 1))} · on the booking
                        </p>
                      </div>
                    ) : (
                      <NewPartFields part={p} onChange={(next) => setDraftParts((ps) => ps.map((x) => (x.key === p.key ? next : x)))} />
                    )}
                    <button
                      type="button"
                      onClick={() => setDraftParts((ps) => ps.filter((x) => x.key !== p.key))}
                      className="inline-flex size-7 shrink-0 items-center justify-center rounded-button text-text-muted hover:bg-red-50 hover:text-red-600"
                      aria-label={`Remove ${p.name || "part"}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <Button
              size="sm"
              variant="ghost"
              iconLeft={Plus}
              onClick={() => setDraftParts((ps) => [...ps, { key: newKey(), id: null, partId: null, name: "", quantity: "1", unitPounds: "", existing: false }])}
            >
              Add a part
            </Button>
          </section>

          {/* Why */}
          <label className="flex flex-col gap-1 text-xs font-semibold text-text-muted">
            Why the booked repair isn&apos;t right — the customer reads this
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="e.g. The pads are fine — the noise is a worn front wheel bearing."
              className={`${INPUT} h-auto py-2`}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-text-muted">
            Note (optional)
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000} placeholder="Anything else they should know" className={`${INPUT} h-auto py-2`} />
          </label>

          {/* Preview — the server's figures, the ones the customer will see. */}
          <div className="rounded-xl bg-surface-card px-3.5 py-3 text-sm">
            {repairIds.length === 0 && <p className="text-xs text-red-700">Keep or add at least one repair — a job can&apos;t be empty.</p>}
            {repairIds.length > 0 && (preview.state === "loading" || (preview.state === "ready" && !previewCurrent)) && (
              <p className="flex items-center gap-2 text-xs text-text-muted">
                <Loader2 size={14} className="animate-spin" /> Pricing…
              </p>
            )}
            {repairIds.length > 0 && preview.state === "error" && <p className="text-xs text-red-700">{preview.error}</p>}
            {previewCurrent && preview.result && diff && (
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-text-secondary">Was</span>
                  <span className="tabular-nums text-text-muted">{formatPrice(preview.result.before.totalPence)}</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span>Customer pays</span>
                  <span className="tabular-nums">
                    {formatPrice(preview.result.after.totalPence)}{" "}
                    <span className={cn("text-xs font-semibold", diff.differencePence > 0 ? "text-amber-700" : diff.differencePence < 0 ? "text-success" : "text-text-muted")}>
                      {differenceLabel(diff.differencePence)}
                    </span>
                  </span>
                </div>
                <div className="flex justify-between text-xs text-text-muted">
                  <span>You receive (after {Math.round(preview.result.after.commissionRate * 1000) / 10}% fee)</span>
                  <span className="tabular-nums">{formatPrice(preview.result.after.mechanicPayoutPence)}</span>
                </div>
                {diff.durationChange !== 0 && (
                  <p className="text-xs text-text-muted">Visit now ~{preview.result.after.serviceDurationHours} h (was ~{preview.result.before.serviceDurationHours} h).</p>
                )}
                <p className="text-xs text-text-secondary">{changed ? mechanicDirectionSentence(diff.differencePence) : "Nothing has changed yet — remove or add a repair or part."}</p>
              </div>
            )}
          </div>

          <Button size="sm" iconLeft={Send} disabled={pending || !previewCurrent || !changed || !reason.trim()} onClick={send}>
            Send to customer
          </Button>
          <p className="text-xs text-text-muted">
            The customer approves the new job — if it costs more they authorise the difference on their card; if less, the difference is released when you complete. Don&apos;t start the revised work until it shows Approved.
          </p>
        </div>
      )}
    </div>
  );
}

function RevisionSummary({ revision }: { revision: RevisionView }) {
  const diff = useMemo(() => diffRevision(revision.before, revision.after), [revision]);
  const expired = isRevisionExpired(revision);
  return (
    <div className="rounded-xl border border-border bg-surface-card px-3.5 py-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-text-primary">{revision.after.repairDescription}</p>
          <p className="text-xs text-text-muted">
            Revised job · <span className="font-semibold">{expired ? "Expired" : REVISION_STATUS_LABEL[revision.status]}</span>
          </p>
        </div>
        <div className="shrink-0 text-right">
          <span className="block text-sm font-bold tabular-nums text-text-primary">{formatPrice(revision.after.totalPence)}</span>
          <span className="text-xs text-text-muted">{differenceLabel(revision.differencePence)} on {formatPrice(revision.before.totalPence)}</span>
        </div>
      </div>
      <ul className="mt-1.5 space-y-0.5 text-xs text-text-secondary">
        {diff.lines.removed.map((l) => (
          <li key={`r-${l.nodeId}`} className="text-text-muted line-through">{l.description}</li>
        ))}
        {diff.parts.removed.map((p, i) => (
          <li key={`rp-${p.id ?? i}`} className="text-text-muted line-through">{p.name}</li>
        ))}
        {diff.lines.added.map((l) => (
          <li key={`a-${l.nodeId}`}>+ {l.description}</li>
        ))}
        {diff.parts.added.map((p, i) => (
          <li key={`ap-${i}`}>+ {p.name}</li>
        ))}
      </ul>
      <p className="mt-1.5 text-xs text-text-muted">“{revision.reason}”</p>
    </div>
  );
}

function EndJobPanel({
  bookingId,
  revision,
  fees,
  pending,
  run,
  onRevise,
}: {
  bookingId: string;
  revision: RevisionView;
  fees: { diagnosticPence: number; enRoutePence: number };
  pending: boolean;
  run: (action: () => Promise<{ ok: boolean; error?: string }>, success?: string, after?: () => void) => void;
  onRevise: () => void;
}) {
  const [choice, setChoice] = useState<OnSiteCharge | null>(null);
  const [note, setNote] = useState("");
  const options = onSiteFeeOptions({ diagnosticPence: fees.diagnosticPence, enRoutePence: fees.enRoutePence });
  const picked = options.find((o) => o.kind === choice) ?? null;
  return (
    <div className="space-y-3">
      <RevisionSummary revision={revision} />
      <div className="space-y-3 rounded-2xl border border-red-200 bg-red-50/40 p-4">
        <p className="text-sm font-bold text-text-primary">
          The customer {revision.status === "declined" ? "declined" : "didn't answer"} the revised job
        </p>
        <p className="text-xs text-text-secondary">
          Don&apos;t carry out the revised work. You can end the job here — the amount you choose is taken from the customer&apos;s hold, the rest is released, and it&apos;s paid to you minus the platform fee like any job.
        </p>
        <ul className="space-y-1.5">
          {options.map((o) => (
            <li key={o.kind}>
              <label className={cn("flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5", choice === o.kind ? "border-brand-blue bg-blue-50" : "border-border bg-surface-card")}>
                <input type="radio" name="end-job" className="mt-1" checked={choice === o.kind} onChange={() => setChoice(o.kind)} />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-text-primary">{o.label}</span>
                  <span className="block text-xs text-text-muted">{o.hint}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Anything to add for the record (optional)" aria-label="Note" className={`${INPUT} w-full`} />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="destructive"
            iconLeft={XCircle}
            disabled={pending || !picked}
            onClick={() => {
              if (!picked) return;
              const sentence = picked.pence > 0 ? `Charge ${formatPrice(picked.pence)} and end this job? The rest of their hold is released.` : "End this job with no charge? Their whole hold is released.";
              if (window.confirm(sentence)) run(() => endJobOnSiteAction({ bookingId, charge: picked.kind, note }), "Job ended — the customer's been told.");
            }}
          >
            {picked && picked.pence > 0 ? `Charge ${formatPrice(picked.pence)} and end the job` : "End the job"}
          </Button>
          <button type="button" onClick={onRevise} className="text-xs font-semibold text-brand-blue hover:underline">
            Send a different revision
          </button>
        </div>
        <p className="text-xs text-text-muted">
          Or carry on with the original job as booked — nothing to press here; just complete it as normal when it&apos;s done.
        </p>
      </div>
    </div>
  );
}

function NewPartFields({ part, onChange }: { part: DraftPart; onChange: (next: DraftPart) => void }) {
  const [catalogue, setCatalogue] = useState<Array<{ id: string; name: string; bmtPricePence: number }> | null>(null);
  useEffect(() => {
    let cancelled = false;
    listQuotePartsAction().then((res) => {
      if (!cancelled && res.ok) setCatalogue(res.parts);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const names = useMemo(() => (catalogue ?? []).map((p) => p.name), [catalogue]);
  return (
    <div className="min-w-0 flex-1 space-y-1.5">
      <Combobox
        value={part.name}
        onChange={(value) => {
          const match = (catalogue ?? []).find((p) => p.name.toLowerCase() === value.trim().toLowerCase());
          onChange(match ? { ...part, name: match.name, partId: match.id, unitPounds: (match.bmtPricePence / 100).toFixed(2) } : { ...part, name: value, partId: null });
        }}
        options={names}
        placeholder={catalogue == null ? "Loading parts…" : "Part name — pick from the catalogue or type your own"}
        aria-label="Part"
      />
      <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
        <label className="flex items-center gap-1.5">
          Qty
          <input value={part.quantity} onChange={(e) => onChange({ ...part, quantity: e.target.value })} inputMode="numeric" aria-label="Quantity" className={`${INPUT} w-16`} />
        </label>
        <label className="flex items-center gap-1.5">
          Each £
          <input
            value={part.unitPounds}
            onChange={(e) => onChange({ ...part, unitPounds: e.target.value, partId: null })}
            inputMode="decimal"
            placeholder="0.00"
            aria-label="Unit price in pounds"
            className={`${INPUT} w-24`}
            disabled={Boolean(part.partId)}
          />
        </label>
        <span>{part.partId ? "Catalogue price" : "Your price"}</span>
      </div>
    </div>
  );
}

function CatalogueSearch({ bookingId, exclude, onPick }: { bookingId: string; exclude: string[]; onPick: (hit: CatalogueHit) => void }) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<CatalogueHit[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [searching, setSearching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(0);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      latest.current++;
    },
    [],
  );

  function onQuery(value: string) {
    setQuery(value);
    if (timer.current) clearTimeout(timer.current);
    const q = value.trim();
    const ticket = ++latest.current;
    if (q.length < 3) {
      setHits([]);
      return;
    }
    setSearching(true);
    timer.current = setTimeout(async () => {
      const res = await searchJobCatalogueAction({ bookingId, query: q });
      if (ticket !== latest.current) return;
      setSearching(false);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setHits(res.hits.filter((h) => !exclude.includes(h.id)));
      setTruncated(res.truncated);
    }, 350);
  }

  return (
    <div className="space-y-1.5">
      <label className="relative block">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Add a repair — search this car, e.g. wheel bearing" aria-label="Search repairs for this car" className={`${INPUT} w-full pl-9 pr-9`} />
        {searching && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-text-muted" />}
      </label>
      {hits.length > 0 && (
        <ul className="max-h-56 divide-y divide-border-subtle overflow-y-auto rounded-lg border border-border bg-surface">
          {hits.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(h);
                  setHits([]);
                  setQuery("");
                }}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-surface-card"
              >
                <span className="min-w-0">
                  <span className="block truncate text-text-primary">{h.bundleName ? `${h.bundleName}${h.optionLabel ? ` · ${h.optionLabel}` : ""}` : h.description}</span>
                  {h.bundleName && <span className="block truncate text-xs text-text-muted">{h.description}</span>}
                </span>
                <span className="shrink-0 text-xs text-text-muted">
                  {h.fixedPrice ? "fixed" : `${h.billedHours ?? 0} h`} · {formatPrice(h.pricePence ?? 0)}
                </span>
              </button>
            </li>
          ))}
          {truncated && (
            <li className="flex items-center gap-1 px-3 py-1.5 text-[11px] text-text-muted">
              <ChevronDown size={11} /> Closest matches — be more specific to find others.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
