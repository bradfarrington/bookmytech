"use client";

import { createContext, useContext, useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronDown,
  ChevronUp,
  ImageOff,
  Loader2,
  RefreshCw,
  ScanSearch,
  Search,
  Sparkles,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  chooseModelPartAction,
  decideCodeMapAction,
  findCodeMatchesAction,
  lookupPartNumberAction,
  recheckModelAction,
  removeModelPartAction,
  scanModelAction,
  type PartLookup,
} from "@/app/actions/parts-gaps";
import type { PartCandidate } from "@/lib/parts/part-candidates";
import { cn, formatPrice } from "@/lib/utils";

// The Parts gaps screen's controls (Task 77). Each one refreshes the page on
// success, so what changed is redrawn from the server.

const SMALL_BUTTON =
  "flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface-card px-3 py-1.5 text-xs font-semibold text-text-primary transition-colors hover:border-brand-blue/40 hover:text-brand-blue disabled:opacity-60";
const PRIMARY_BUTTON =
  "flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-blue px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-blue-dark disabled:opacity-60";

function goToModel(router: ReturnType<typeof useRouter>, make: string, modelLabel: string) {
  router.push(`/admin/parts/gaps?make=${encodeURIComponent(make)}&model=${encodeURIComponent(modelLabel)}`);
  router.refresh();
}

// --- Pictures ----------------------------------------------------------------------

/** NAPA's picture of a part, or a plain placeholder when it sent none. */
export function PartThumb({ src, alt, size = 56 }: { src: string | null | undefined; alt: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const box = { width: size, height: size };
  if (!src || failed) {
    return (
      <span style={box} className="flex shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-surface text-text-muted">
        <ImageOff size={Math.round(size / 3)} />
      </span>
    );
  }
  return (
    // NAPA's own CDN; a plain img keeps their pictures out of the image optimiser.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      style={box}
      loading="lazy"
      onError={() => setFailed(true)}
      className="shrink-0 rounded-lg border border-border-subtle bg-white object-contain p-1"
    />
  );
}

// --- Adding a model and finding matches ------------------------------------------------

export function ScanForm() {
  const router = useRouter();
  const [reg, setReg] = useState("");
  const [pending, startTransition] = useTransition();

  function scan() {
    startTransition(async () => {
      const result = await scanModelAction({ reg });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message);
      setReg("");
      goToModel(router, result.make, result.modelLabel);
    });
  }

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (reg.trim() && !pending) scan();
      }}
    >
      <input
        value={reg}
        onChange={(e) => setReg(e.target.value.toUpperCase())}
        placeholder="Number plate"
        aria-label="Number plate of the car to add"
        className="w-36 rounded-lg border border-border bg-surface-card px-3 py-1.5 font-mono text-sm uppercase"
      />
      <button type="submit" disabled={pending || !reg.trim()} className={PRIMARY_BUTTON}>
        {pending ? <Loader2 size={13} className="animate-spin" /> : <ScanSearch size={13} />}
        {pending ? "Reading the car, about a minute…" : "Add a car model"}
      </button>
    </form>
  );
}

/** Add the model a registration belongs to, from the list of models customers priced. */
export function ScanRegButton({ reg }: { reg: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className={SMALL_BUTTON}
      onClick={() =>
        startTransition(async () => {
          const result = await scanModelAction({ reg });
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          toast.success(result.message);
          goToModel(router, result.make, result.modelLabel);
        })
      }
    >
      {pending ? <Loader2 size={13} className="animate-spin" /> : <ScanSearch size={13} />}
      {pending ? "Reading…" : `Add it using ${reg}`}
    </button>
  );
}

export function RecheckButton({ make, modelLabel }: { make: string; modelLabel: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className={SMALL_BUTTON}
      onClick={() =>
        startTransition(async () => {
          const result = await recheckModelAction({ make, modelLabel });
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          toast.success(`NAPA's prices for the ${modelLabel} are up to date.`);
          router.refresh();
        })
      }
    >
      {pending ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
      {pending ? "Asking NAPA…" : "Ask NAPA again"}
    </button>
  );
}

export function FindMatchesButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className={SMALL_BUTTON}
      onClick={() =>
        startTransition(async () => {
          const result = await findCodeMatchesAction();
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          toast.success(result.message);
          router.refresh();
        })
      }
    >
      {pending ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
      {pending ? "Looking…" : "Look for more"}
    </button>
  );
}

// --- Code matches ------------------------------------------------------------------------

export function CodeMapDecision({
  genartId,
  label,
  status,
}: {
  genartId: number;
  label: string;
  status: "proposed" | "approved" | "rejected";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function decide(decision: "approved" | "rejected" | "proposed") {
    startTransition(async () => {
      const result = await decideCodeMapAction({ genartId, decision });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        decision === "approved"
          ? `${label}: we'll use NAPA's name for it on every car.`
          : decision === "rejected"
            ? `${label} won't be matched.`
            : `${label} is waiting for a decision again.`,
      );
      router.refresh();
    });
  }

  if (status !== "proposed") {
    return (
      <button type="button" onClick={() => decide("proposed")} disabled={pending} className={SMALL_BUTTON}>
        <Undo2 size={13} />
        Undo
      </button>
    );
  }
  return (
    <div className="flex shrink-0 gap-2">
      <button type="button" onClick={() => decide("approved")} disabled={pending} className={PRIMARY_BUTTON}>
        <Check size={13} />
        Yes, same part
      </button>
      <button type="button" onClick={() => decide("rejected")} disabled={pending} className={SMALL_BUTTON}>
        <X size={13} />
        No
      </button>
    </div>
  );
}

// --- Choosing a part ---------------------------------------------------------------------

export function RemovePickButton({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-text-muted transition-colors hover:bg-surface hover:text-red-600 disabled:opacity-60"
      onClick={() =>
        startTransition(async () => {
          const result = await removeModelPartAction({ id });
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          toast.success(`That part is no longer used for ${label}.`);
          router.refresh();
        })
      }
    >
      <Trash2 size={13} />
      Change
    </button>
  );
}

/** Candidates per part type, sent to the browser once for the whole model rather than per repair. */
const CandidatesContext = createContext<Record<number, PartCandidate[]>>({});

export function CandidatesProvider({
  candidates,
  children,
}: {
  candidates: Record<number, PartCandidate[]>;
  children: ReactNode;
}) {
  return <CandidatesContext.Provider value={candidates}>{children}</CandidatesContext.Provider>;
}

function money(part: { costPence: number | null; quantity: number | null }): string | null {
  if (part.costPence == null) return null;
  const each = formatPrice(part.costPence);
  return part.quantity && part.quantity > 1 ? `${each} each (needs ${part.quantity})` : each;
}

function partName(part: { description: string | null; partNumber: string }): string {
  return part.description?.trim() || part.partNumber;
}

const RATING_TONE: Record<string, string> = {
  best: "bg-green-100 text-green-700",
  better: "bg-blue-100 text-brand-blue-dark",
  good: "bg-border-subtle text-slate-700",
};

function Rating({ rating }: { rating: string | null }) {
  if (!rating) return null;
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", RATING_TONE[rating.toLowerCase()] ?? RATING_TONE.good)}>
      {rating}
    </span>
  );
}

/** One part as a row: picture, name, brand and number, quality, price, where NAPA sells it. */
function PartRow({ part, selected }: { part: PartCandidate; selected: boolean }) {
  return (
    <span className="flex items-center gap-3">
      <PartThumb src={part.imageUrl} alt={partName(part)} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-text-primary">{partName(part)}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-text-muted">
          <span>{part.brand ?? "NAPA"}</span>
          <span className="font-mono">{part.partNumber}</span>
          <Rating rating={part.rating} />
          {part.position && <span>{part.position} axle</span>}
        </span>
        <span className="mt-0.5 block truncate text-xs text-text-muted">
          NAPA sells it for: {part.seenOn.slice(0, 3).join(", ")}
          {part.seenOn.length > 3 ? ` and ${part.seenOn.length - 3} more` : ""}
        </span>
      </span>
      <span className="shrink-0 text-right">
        {money(part) && <span className="block text-sm font-bold text-text-primary">{money(part)}</span>}
        {selected && <Check size={16} className="ml-auto mt-1 text-brand-blue" />}
      </span>
    </span>
  );
}

/**
 * Choose the part for one missing part type: a dropdown with NAPA's pictures
 * of the parts it sells under that part type on other cars (same make first,
 * right axle only), searchable, or a NAPA part number typed in and checked
 * live. The choice covers the part type on the whole model (per axle where
 * the repair names one), so every repair on the model that needs it is priced.
 */
export function PartChooser({
  make,
  modelLabel,
  genartId,
  label,
  position,
}: {
  make: string;
  modelLabel: string;
  genartId: number;
  label: string;
  position: "front" | "rear" | null;
}) {
  const router = useRouter();
  const all = useContext(CandidatesContext)[genartId];
  // A part NAPA lists for one axle only fits a job on that axle.
  const candidates = useMemo(
    () => (all ?? []).filter((c) => !position || c.position == null || c.position === position),
    [all, position],
  );
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<PartCandidate | null>(null);
  const [typed, setTyped] = useState("");
  const [checked, setChecked] = useState<PartLookup | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((c) =>
      [c.partNumber, c.brand, c.description, ...c.seenOn].some((text) => text?.toLowerCase().includes(q)),
    );
  }, [candidates, query]);

  function check() {
    setChecked(null);
    setCheckError(null);
    startTransition(async () => {
      const result = await lookupPartNumberAction({ partNumber: typed, genartId });
      if (!result.ok) {
        setCheckError(result.error);
        return;
      }
      setChecked(result.part);
      if (result.part.sameType) {
        setSelected({
          partNumber: result.part.partNumber,
          brand: result.part.brand,
          description: result.part.description,
          rating: result.part.rating,
          costPence: result.part.costPence,
          quantity: result.part.quantity,
          position: null,
          imageUrl: null,
          seenOn: ["checked with NAPA just now"],
          sameMake: false,
        });
      }
    });
  }

  function save() {
    if (!selected) return;
    startTransition(async () => {
      const result = await chooseModelPartAction({
        make,
        modelLabel,
        genartId,
        label,
        position,
        partNumber: selected.partNumber,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Every ${modelLabel} now uses ${selected.brand ?? ""} ${selected.partNumber} for ${label.toLowerCase()}.`);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-border bg-surface-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface"
      >
        {selected ? (
          <span className="min-w-0 flex-1">
            <PartRow part={selected} selected={false} />
          </span>
        ) : (
          <span className="min-w-0 flex-1 text-sm text-text-secondary">
            {candidates.length
              ? `Choose a part (${candidates.length} NAPA part${candidates.length === 1 ? "" : "s"} to pick from)`
              : "No NAPA parts to pick from yet: type a part number"}
          </span>
        )}
        {open ? <ChevronUp size={16} className="text-text-muted" /> : <ChevronDown size={16} className="text-text-muted" />}
      </button>

      {open && (
        <div className="space-y-3 border-t border-border-subtle p-3">
          {candidates.length > 0 && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <span className="font-semibold">Check before you choose.</span> These are parts NAPA sells for{" "}
              <span className="font-semibold">other</span> cars, so they may not fit the {modelLabel}. Only pick one if
              you know it&apos;s the right part. If none of them is, type the right NAPA part number below.
            </p>
          )}
          {candidates.length > 3 && (
            <label className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5">
              <Search size={14} className="text-text-muted" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, brand, part number or car"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
            </label>
          )}

          {filtered.length > 0 && (
            <ul role="listbox" aria-label={`Parts for ${label}`} className="max-h-96 space-y-1 overflow-y-auto">
              {filtered.map((c) => {
                const isSelected = selected?.partNumber === c.partNumber;
                return (
                  <li key={c.partNumber}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => setSelected(c)}
                      className={cn(
                        "w-full rounded-lg border px-2 py-2 text-left transition-colors",
                        isSelected ? "border-brand-blue bg-blue-50" : "border-transparent hover:bg-surface",
                      )}
                    >
                      <PartRow part={c} selected={isSelected} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {candidates.length > 0 && filtered.length === 0 && (
            <p className="text-xs text-text-muted">Nothing matches that search.</p>
          )}

          <div className="space-y-1.5 rounded-lg bg-surface p-2.5">
            <p className="text-xs font-semibold text-text-secondary">Know the NAPA part number? Type it here.</p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value.toUpperCase())}
                placeholder="e.g. NPANBD5431"
                className="min-w-0 flex-1 rounded-lg border border-border bg-surface-card px-3 py-1.5 font-mono text-xs uppercase"
              />
              <button type="button" onClick={check} disabled={pending || !typed.trim()} className={SMALL_BUTTON}>
                Check with NAPA
              </button>
            </div>
            {checkError && <p className="text-xs text-red-600">{checkError}</p>}
            {checked && !checked.sameType && (
              <p className="text-xs text-red-600">
                NAPA says {checked.partNumber} isn&apos;t a {label.toLowerCase()}, so it can&apos;t be used here.
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-text-muted">
              This will be used for {label.toLowerCase()}
              {position ? ` (${position})` : ""} on every {modelLabel}.
            </p>
            <button type="button" onClick={save} disabled={pending || !selected} className={PRIMARY_BUTTON}>
              {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              Use this part
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
