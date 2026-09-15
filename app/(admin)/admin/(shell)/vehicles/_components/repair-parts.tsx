"use client";

import { useState, useTransition } from "react";
import { ArrowDownWideNarrow, Info, Link2, Package, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import {
  chooseRepairPartAction,
  loadRepairPartsAction,
  resetRepairPartAction,
  type RepairPartGroupView,
  type RepairPartsResult,
} from "@/app/actions/repair-parts";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import {
  dearestOffer,
  SUPPLIER_LABEL,
  type SupplierOffer,
  type SupplierPanel,
} from "@/lib/parts/supplier-offer";
import { cn, formatPrice } from "@/lib/utils";
import { PartGroupMatcher } from "../../parts/groups/_components/part-group-matcher";

// A repair's parts on one engine variant (Task 45), opened from a timed repair
// on the admin vehicle model page.
//
// Nothing is fetched until the admin opens it: a first look at a vehicle and
// part group spends LKQ catalogue credits (then cached). The default part is
// the dearest either supplier will sell us; "Change" lists every fitting part
// from both, and a choice applies to this engine variant only.
//
// Money rules as on /admin/parts: supplier cost, no mark-up; surcharge never
// added to cost; an unpriced part shows "—", never £0.00.

const SHORT_SUPPLIER = { lkq: "LKQ", aag: "AAG" } as const;

function panelOffers(panel: SupplierPanel): SupplierOffer[] {
  return panel.state === "ok" ? panel.offers : [];
}

function panelNote(panel: SupplierPanel): string | null {
  switch (panel.state) {
    case "ok":
      return null;
    case "not_connected":
      return panel.hint ? `${panel.message} ${panel.hint}` : panel.message;
    default:
      return panel.message;
  }
}

function OfferSummary({ offer }: { offer: SupplierOffer }) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-sm font-semibold text-text-primary">{offer.brand ?? "Unbranded"}</span>
        <span className="font-mono text-xs text-text-muted">{offer.partNumber}</span>
        {offer.tier && <Pill tone="neutral">{offer.tier}</Pill>}
        <Pill tone="info">{SHORT_SUPPLIER[offer.supplier]}</Pill>
      </div>
      {(offer.description || offer.fitment.length > 0) && (
        <p className="mt-0.5 text-xs text-text-muted">
          {[offer.description, ...offer.fitment.map((f) => `${f.label}: ${f.value}`)].filter(Boolean).join(" · ")}
        </p>
      )}
    </div>
  );
}

function Cost({ offer }: { offer: SupplierOffer }) {
  return (
    <div className="shrink-0 text-right">
      <div className={cn("text-sm font-semibold", offer.costPence == null && "text-text-muted")}>
        {offer.costPence == null ? "Not priced" : formatPrice(offer.costPence)}
      </div>
      {offer.quantityOfFit && offer.quantityOfFit > 1 && offer.costPence != null && (
        <div className="whitespace-nowrap text-xs text-text-muted">
          needs {offer.quantityOfFit} · {formatPrice(offer.costPence * offer.quantityOfFit)}
        </div>
      )}
      {offer.surchargePence != null && (
        <div className="whitespace-nowrap text-xs text-amber-700">+ {formatPrice(offer.surchargePence)} surcharge</div>
      )}
    </div>
  );
}

function PartGroupCard({
  group,
  carTypeId,
  nodeId,
  reg,
  onUpdated,
  onMatched,
}: {
  group: RepairPartGroupView;
  carTypeId: number;
  nodeId: string;
  /** The registration these parts were priced for; the LKQ matcher shows parts on it too. */
  reg: string;
  onUpdated: (next: RepairPartGroupView) => void;
  /** The part group's LKQ match changed, so both suppliers' parts need asking again. */
  onMatched: () => void;
}) {
  const [changing, setChanging] = useState(false);
  const [matching, setMatching] = useState(false);
  const lkqMatched = group.lkqLink.kind === "confirmed" || group.lkqLink.kind === "auto";
  const [pending, startTransition] = useTransition();

  const offers = [...panelOffers(group.lkq), ...panelOffers(group.aag)].sort(
    (a, b) => (b.costPence ?? -1) - (a.costPence ?? -1),
  );
  const selection = group.selection;
  const selected = selection.source === "none" ? null : selection.offer;
  const notes = [
    { label: SUPPLIER_LABEL.lkq, note: panelNote(group.lkq) },
    { label: SUPPLIER_LABEL.aag, note: panelNote(group.aag) },
  ].filter((n) => n.note);

  const choose = (offer: SupplierOffer) =>
    startTransition(async () => {
      const result = await chooseRepairPartAction({
        carTypeId,
        nodeId,
        genartId: group.genartId,
        supplier: offer.supplier,
        partNumber: offer.partNumber,
        brand: offer.brand,
        description: offer.description,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      onUpdated({ ...group, selection: { source: "choice", offer } });
      setChanging(false);
      toast.success(`Using ${offer.brand ?? offer.partNumber} for this engine variant.`);
    });

  const reset = () =>
    startTransition(async () => {
      const result = await resetRepairPartAction({ carTypeId, nodeId, genartId: group.genartId });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const dearest = dearestOffer(offers);
      onUpdated({
        ...group,
        selection: dearest ? { source: "dearest", offer: dearest, missingChoice: null } : { source: "none", missingChoice: null },
      });
      toast.success("Back to the dearest part.");
    });

  return (
    <div className="rounded-xl border border-border bg-surface-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-text-primary">{group.description}</p>
        <span className="font-mono text-xs text-text-muted">Group {group.genartId}</span>
        {group.lkqLink.kind === "confirmed" && <Pill tone="success">LKQ matched</Pill>}
        {group.lkqLink.kind === "auto" && <Pill tone="accent">LKQ auto-matched</Pill>}
        {(group.lkqLink.kind === "unmatched" || group.lkqLink.kind === "stale") && (
          <Pill tone="pending">Not matched to LKQ</Pill>
        )}
        {group.lkqLink.kind === "no_match" && <Pill tone="neutral">No LKQ equivalent</Pill>}
      </div>

      <div className="mt-2 flex flex-col gap-2 rounded-lg bg-surface px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
        {selected ? (
          <>
            <div className="flex min-w-0 items-start gap-2">
              <Pill tone={selection.source === "choice" ? "dark" : "accent"}>
                {selection.source === "choice" ? "Chosen" : "Dearest (default)"}
              </Pill>
              <OfferSummary offer={selected} />
            </div>
            <Cost offer={selected} />
          </>
        ) : (
          <p className="text-sm text-text-muted">Neither supplier returned a part we can buy for this vehicle.</p>
        )}
      </div>

      {selection.source !== "choice" && selection.missingChoice && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-700">
          <Info size={12} className="mt-0.5 shrink-0" />
          The part chosen before ({selection.missingChoice.brand ?? SHORT_SUPPLIER[selection.missingChoice.supplier]}{" "}
          {selection.missingChoice.part_number}) isn&apos;t in today&apos;s results, so the dearest is shown.
        </p>
      )}

      {notes.map(({ label, note }) => (
        <p key={label} className="mt-1.5 text-xs text-text-muted">
          <span className="font-semibold">{label}:</span> {note}
        </p>
      ))}

      <div className="mt-2 flex flex-wrap gap-2">
        {offers.length > 0 && (
          <Button size="sm" variant="secondary" iconLeft={ArrowDownWideNarrow} disabled={pending} onClick={() => setChanging((v) => !v)}>
            {changing ? "Close" : `Change (${offers.length} options)`}
          </Button>
        )}
        {selection.source === "choice" && (
          <Button size="sm" variant="tertiary" iconLeft={RotateCcw} disabled={pending} onClick={reset}>
            Use dearest
          </Button>
        )}
        <Button size="sm" variant="ghost" iconLeft={Link2} disabled={pending} onClick={() => setMatching((v) => !v)}>
          {matching ? "Close LKQ match" : lkqMatched ? "Check LKQ match" : "Match to LKQ"}
        </Button>
      </div>

      {matching && (
        <div className="mt-2">
          <PartGroupMatcher
            genartId={group.genartId}
            description={group.description}
            reg={reg}
            current={
              lkqMatched && group.lkqLink.componentNumber && group.lkqLink.componentName
                ? { number: group.lkqLink.componentNumber, name: group.lkqLink.componentName.trim() }
                : null
            }
            confirmed={group.lkqLink.kind === "confirmed"}
            allowNoMatch={group.lkqLink.kind !== "no_match"}
            onMatched={() => {
              setMatching(false);
              onMatched();
            }}
          />
        </div>
      )}

      {changing && (
        <ul className="mt-2 max-h-96 divide-y divide-border-subtle overflow-y-auto rounded-lg border border-border">
          {offers.map((offer) => {
            const isSelected = selected?.supplier === offer.supplier && selected.partNumber === offer.partNumber;
            return (
              <li
                key={`${offer.supplier}-${offer.partNumber}`}
                className={cn("flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between", isSelected && "bg-blue-50")}
              >
                <OfferSummary offer={offer} />
                <div className="flex items-center gap-3">
                  <Cost offer={offer} />
                  {isSelected ? (
                    <Pill tone="success">In use</Pill>
                  ) : (
                    <Button size="sm" variant="ghost" disabled={pending || !offer.buyable} onClick={() => choose(offer)}>
                      {offer.buyable ? "Use this" : "Not buyable"}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function RepairParts({
  carTypeId,
  nodeId,
  repairName,
}: {
  carTypeId: number;
  nodeId: string;
  repairName: string;
}) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<RepairPartsResult | null>(null);
  const [reg, setReg] = useState("");
  const [loading, startLoading] = useTransition();

  const load = (typedReg?: string) =>
    startLoading(async () => {
      const next = await loadRepairPartsAction({ carTypeId, nodeId, reg: typedReg ?? null });
      setResult(next);
      if (!next.ok) toast.error(next.error);
    });

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !result) load();
  };

  const updateGroup = (updated: RepairPartGroupView) =>
    setResult((current) =>
      current?.ok && current.state === "ready"
        ? { ...current, groups: current.groups.map((g) => (g.genartId === updated.genartId ? updated : g)) }
        : current,
    );

  return (
    <>
      <Button size="sm" variant="ghost" iconLeft={Package} onClick={toggle} aria-expanded={open}>
        Parts
      </Button>
      {open && (
        <div className="basis-full space-y-3 rounded-xl border border-border bg-surface p-3">
          {loading && (
            <p className="text-sm text-text-muted">
              Asking LKQ and Alliance Automotive for the parts for &ldquo;{repairName}&rdquo;…
            </p>
          )}

          {!loading && result && !result.ok && <p className="text-sm text-red-700">{result.error}</p>}

          {!loading && result?.ok && result.state === "needs_reg" && (
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (reg.trim()) load(reg);
              }}
            >
              <p className="text-sm text-text-primary">
                Suppliers only price a real vehicle. Enter a registration for this engine variant. We&apos;ll
                check it&apos;s the right car and remember it.
              </p>
              {result.reason && <p className="text-sm text-amber-700">{result.reason}</p>}
              <div className="flex flex-wrap gap-2">
                <input
                  value={reg}
                  onChange={(e) => setReg(e.target.value.toUpperCase())}
                  placeholder="e.g. FX73 KUA"
                  aria-label="Registration"
                  className="h-10 w-44 rounded-button border border-border bg-surface-card px-3 font-mono text-sm uppercase text-text-primary placeholder:normal-case placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand-blue"
                />
                <Button type="submit" size="md" disabled={!reg.trim()}>
                  Show parts
                </Button>
              </div>
            </form>
          )}

          {!loading && result?.ok && result.state === "ready" && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-text-muted">
                  Priced for <span className="font-mono font-semibold text-text-primary">{result.reg}</span>
                  {result.vehicle ? ` · ${result.vehicle}` : ""} · LKQ credits {result.credits.used}/{result.credits.cap} this
                  month
                </p>
                <button
                  type="button"
                  onClick={() => setResult({ ok: true, state: "needs_reg", reason: null })}
                  className="text-xs font-semibold text-brand-blue hover:underline"
                >
                  Use a different registration
                </button>
              </div>
              {result.groups.length === 0 ? (
                <p className="text-sm text-text-muted">HaynesPro doesn&apos;t list any parts for this repair.</p>
              ) : (
                result.groups.map((group) => (
                  <PartGroupCard
                    key={group.genartId}
                    group={group}
                    carTypeId={carTypeId}
                    nodeId={nodeId}
                    reg={result.reg}
                    onUpdated={updateGroup}
                    onMatched={() => load(result.reg)}
                  />
                ))
              )}
              <p className="text-xs text-text-muted">
                Supplier cost, no mark-up. The dearest part is used unless you change it; a change applies to this
                engine variant only.
              </p>
            </>
          )}
        </div>
      )}
    </>
  );
}
