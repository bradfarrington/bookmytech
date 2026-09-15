"use client";

import { useState, useTransition } from "react";
import { ArrowDownWideNarrow, Info, Package, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import {
  chooseRepairPartAction,
  loadRepairPartsAction,
  resetRepairPartAction,
  setPartGroupChargedAction,
  type RepairPartGroupView,
  type RepairPartsResult,
} from "@/app/actions/repair-parts";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { Switch } from "@/components/ui/switch";
import { selectJobParts, type MissingChoice } from "@/lib/parts/repair-part-choice";
import {
  offerLinePence,
  ratingRank,
  type SupplierOffer,
  type SupplierPanel,
} from "@/lib/parts/supplier-offer";
import { cn, formatPrice } from "@/lib/utils";

// A repair's parts on one engine variant (Task 45), opened from a timed repair
// on the admin vehicle model page.
//
// Nothing is fetched until the admin opens it. Alliance Automotive prices each
// part group the repair uses, and the part shown is the one customer quotes use
// (Task 43): AAG's best-rated, dearest within that rating, one per axle when the
// repair names neither. "Change" lists every fitting part, and a choice applies
// to this engine variant only. The switch stops customers being charged for a
// part group on every repair (a tool, not a part).
//
// Money rules: supplier cost, no mark-up; a core charge is never added to the
// cost; an unpriced part says "Not priced", never £0.00.

const POSITION_LABEL = { front: "Front", rear: "Rear" } as const;

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

/** Best-rated first, dearest first within a rating: the order the default is picked in. */
function byDefaultOrder(a: SupplierOffer, b: SupplierOffer): number {
  return ratingRank(b.tier) - ratingRank(a.tier) || (offerLinePence(b) ?? -1) - (offerLinePence(a) ?? -1);
}

function OfferSummary({ offer }: { offer: SupplierOffer }) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-sm font-semibold text-text-primary">{offer.brand ?? "Unbranded"}</span>
        <span className="font-mono text-xs text-text-muted">{offer.partNumber}</span>
        {offer.tier && <Pill tone="neutral">{offer.tier}</Pill>}
        {offer.position && <Pill tone="info">{POSITION_LABEL[offer.position]}</Pill>}
      </div>
      {offer.description && <p className="mt-0.5 text-xs text-text-muted">{offer.description}</p>}
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
        <div className="whitespace-nowrap text-xs text-amber-700">+ {formatPrice(offer.surchargePence)} core charge</div>
      )}
    </div>
  );
}

function PartGroupCard({
  group,
  carTypeId,
  nodeId,
  repairName,
  settingsReady,
  onUpdated,
}: {
  group: RepairPartGroupView;
  carTypeId: number;
  nodeId: string;
  repairName: string;
  settingsReady: boolean;
  onUpdated: (next: RepairPartGroupView) => void;
}) {
  const [changing, setChanging] = useState(false);
  const [pending, startTransition] = useTransition();

  const offers = [...panelOffers(group.aag)].sort(byDefaultOrder);
  const note = panelNote(group.aag);
  const chosen = group.selections.some((s) => s.selection.source === "choice");
  const missingChoice = group.selections
    .map((s) => (s.selection.source === "choice" ? null : s.selection.missingChoice))
    .find(Boolean);
  const inUse = new Set(
    group.selections.flatMap((s) => (s.selection.source === "none" ? [] : [s.selection.offer.partNumber])),
  );

  const reselect = (choice: MissingChoice | null) =>
    group.aag.state === "ok" ? selectJobParts(repairName, group.aag.offers, choice) : group.selections;

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
      const choice = { supplier: offer.supplier, part_number: offer.partNumber, brand: offer.brand, description: offer.description };
      onUpdated({ ...group, selections: reselect(choice) });
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
      onUpdated({ ...group, selections: reselect(null) });
      toast.success("Back to the default part.");
    });

  const setCharged = (charged: boolean) =>
    startTransition(async () => {
      onUpdated({ ...group, charged }); // optimistic
      const result = await setPartGroupChargedAction({ genartId: group.genartId, description: group.description, charged });
      if (!result.ok) {
        onUpdated({ ...group, charged: !charged });
        toast.error(result.error);
        return;
      }
      toast.success(
        charged
          ? `Customers are charged for “${group.description}” again.`
          : `Customers won't be charged for “${group.description}” on any repair.`,
      );
    });

  return (
    <div className={cn("rounded-xl border border-border bg-surface-card p-3", !group.charged && "opacity-75")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-text-primary">{group.description}</p>
          <span className="font-mono text-xs text-text-muted">Group {group.genartId}</span>
          {!group.charged && <Pill tone="neutral">Not charged</Pill>}
        </div>
        {settingsReady && (
          <label className="flex items-center gap-2 text-xs font-semibold text-text-secondary">
            Charge customers
            <Switch
              size="sm"
              checked={group.charged}
              disabled={pending}
              onChange={setCharged}
              label={`Charge customers for ${group.description}`}
            />
          </label>
        )}
      </div>

      <div className="mt-2 space-y-2">
        {group.selections.map(({ position, selection }) => (
          <div
            key={position ?? "any"}
            className="flex flex-col gap-2 rounded-lg bg-surface px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
          >
            {selection.source === "none" ? (
              <p className="text-sm text-text-muted">
                {position ? `${POSITION_LABEL[position]}: ` : ""}Alliance Automotive didn&apos;t return a part we can buy
                for this vehicle.
              </p>
            ) : (
              <>
                <div className="flex min-w-0 items-start gap-2">
                  <Pill tone={selection.source === "choice" ? "dark" : "accent"}>
                    {selection.source === "choice" ? "Chosen" : "Default: Best, dearest"}
                  </Pill>
                  <OfferSummary offer={selection.offer} />
                </div>
                <Cost offer={selection.offer} />
              </>
            )}
          </div>
        ))}
      </div>

      {missingChoice && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-700">
          <Info size={12} className="mt-0.5 shrink-0" />
          The part chosen before ({missingChoice.brand ?? "Alliance Automotive"} {missingChoice.part_number}) isn&apos;t
          in today&apos;s results, so the default is shown.
        </p>
      )}

      {note && <p className="mt-1.5 text-xs text-text-muted">{note}</p>}
      {group.aag.state === "empty" && group.charged && (
        <p className="mt-1 text-xs text-amber-700">
          A customer can&apos;t book this repair for this car while this group is charged. If it&apos;s a tool rather
          than a part, switch it off.
        </p>
      )}

      {(offers.length > 0 || chosen) && (
        <div className="mt-2 flex flex-wrap gap-2">
          {offers.length > 0 && (
            <Button size="sm" variant="secondary" iconLeft={ArrowDownWideNarrow} disabled={pending} onClick={() => setChanging((v) => !v)}>
              {changing ? "Close" : `Change (${offers.length} options)`}
            </Button>
          )}
          {chosen && (
            <Button size="sm" variant="tertiary" iconLeft={RotateCcw} disabled={pending} onClick={reset}>
              Use default
            </Button>
          )}
        </div>
      )}

      {changing && (
        <ul className="mt-2 max-h-96 divide-y divide-border-subtle overflow-y-auto rounded-lg border border-border">
          {offers.map((offer) => {
            const isInUse = inUse.has(offer.partNumber);
            return (
              <li
                key={offer.partNumber}
                className={cn("flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between", isInUse && "bg-blue-50")}
              >
                <OfferSummary offer={offer} />
                <div className="flex items-center gap-3">
                  <Cost offer={offer} />
                  {isInUse ? (
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
              Asking Alliance Automotive for the parts for &ldquo;{repairName}&rdquo;…
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
                  {result.vehicle ? ` · ${result.vehicle}` : ""}
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
                    repairName={result.repairName}
                    settingsReady={result.settingsReady}
                    onUpdated={updateGroup}
                  />
                ))
              )}
              <p className="text-xs text-text-muted">
                Supplier cost, no mark-up. Customers are charged the part shown unless the group is switched off; a
                change applies to this engine variant only.
                {!result.settingsReady && " Charge switches appear once migration 0070 is applied."}
              </p>
            </>
          )}
        </div>
      )}
    </>
  );
}
