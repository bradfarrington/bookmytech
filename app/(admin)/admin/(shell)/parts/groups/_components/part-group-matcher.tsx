"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Check, Eye, ImageOff, Info, X } from "lucide-react";
import { toast } from "sonner";

import {
  confirmPartGroupMatch,
  loadLkqComponentExamplesAction,
  loadPartGroupEvidenceAction,
  markPartGroupNoMatch,
  type AdsCredits,
  type ComponentChoice,
  type PartGroupEvidenceResult,
} from "@/app/actions/part-groups";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import type { ExamplesPanel, PartExample } from "@/lib/parts/part-examples";
import { cn } from "@/lib/utils";

// Matching a HaynesPro part group to an LKQ part (Task 45).
//
// The part group's own name says what it is ("Actuator, eccentric shaft
// (variable valve lift)"). What an LKQ component name covers is the unknown, so
// on one real car this lists only the LKQ parts that fit it, and picking one
// shows LKQ's actual parts for it (pictures, fitting position) before it can be
// matched. Alliance Automotive isn't asked: it takes part groups directly and
// never needs matching.
//
// Nothing is preselected unless the group already has a match. A name that
// shares a word ("Inlet Valve") is a guess, and a preselected guess with a
// match button under it reads like the answer.
//
// Used on /admin/parts/groups and inside a repair's Parts panel on the vehicle
// model page. Credits: up to two to open on a new car (cached 30 days), one per
// LKQ part shown on a new car (cached 7 days).

type LkqState = { status: "loading" } | { status: "done"; panel: ExamplesPanel };

const MIN_FILTER = 2;

function ExampleCard({ example }: { example: PartExample }) {
  return (
    <li className="flex gap-3 rounded-lg border border-border bg-surface-card p-2">
      {example.imageUrl ? (
        // Served straight from the supplier's image store, as on /admin/parts.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={example.imageUrl}
          alt=""
          loading="lazy"
          className="size-16 shrink-0 rounded-md border border-border bg-white object-contain"
        />
      ) : (
        <div className="flex size-16 shrink-0 items-center justify-center rounded-md border border-dashed border-border text-text-muted">
          <ImageOff size={16} aria-hidden />
        </div>
      )}
      <div className="min-w-0 text-xs">
        <p className="text-sm font-semibold text-text-primary">{example.title}</p>
        {example.details.length > 0 && <p className="mt-0.5 text-text-secondary">{example.details.join(" · ")}</p>}
      </div>
    </li>
  );
}

function CandidateButton({
  choice,
  selected,
  onClick,
}: {
  choice: ComponentChoice;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "rounded-full border px-3 py-1 text-left text-xs font-semibold transition-colors",
        selected
          ? "border-brand-blue bg-blue-50 text-brand-blue"
          : "border-border bg-surface-card text-text-secondary hover:border-brand-blue/40",
      )}
    >
      {choice.name} <span className="font-mono font-normal text-text-muted">{choice.number}</span>
    </button>
  );
}

function StepTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">{children}</h3>;
}

export function PartGroupMatcher({
  genartId,
  description,
  reg,
  current,
  confirmed,
  allowNoMatch = false,
  onMatched,
}: {
  genartId: number;
  description: string;
  reg: string;
  /** The LKQ part this group is matched (or auto-matched) to now, if any. */
  current: ComponentChoice | null;
  confirmed: boolean;
  allowNoMatch?: boolean;
  onMatched: () => void;
}) {
  const [evidence, setEvidence] = useState<PartGroupEvidenceResult | null>(null);
  const [picked, setPicked] = useState<ComponentChoice | null>(null);
  const [lkq, setLkq] = useState<Record<string, LkqState>>({});
  const [credits, setCredits] = useState<AdsCredits | null>(null);
  const [filter, setFilter] = useState("");
  const [saving, startSaving] = useTransition();

  // The parent keys this component by car, so a different car remounts it.
  useEffect(() => {
    let cancelled = false;
    loadPartGroupEvidenceAction({ genartId, reg, description }).then((result) => {
      if (cancelled) return;
      setEvidence(result);
      if (result.ok) setCredits(result.credits);
    });
    return () => {
      cancelled = true;
    };
  }, [genartId, reg, description]);

  const fitting = evidence?.ok ? evidence.fitting : null;
  const needle = filter.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      fitting && needle.length >= MIN_FILTER
        ? fitting
            .filter((c) => c.name.toLowerCase().includes(needle) || c.number.toLowerCase().includes(needle))
            .slice(0, 30)
        : [],
    [fitting, needle],
  );

  const groupName = description || `Part group ${genartId}`;
  const shell = "w-full space-y-3 rounded-xl border border-border bg-surface p-3 lg:basis-full";

  if (!evidence) {
    return (
      <div className={shell}>
        <p className="text-sm text-text-muted">Asking LKQ which of its parts fit {reg}…</p>
      </div>
    );
  }
  if (!evidence.ok) {
    return (
      <div className={shell}>
        <p className="text-sm text-red-700">{evidence.error}</p>
      </div>
    );
  }

  const shown = picked ?? current;
  const shownState = shown ? lkq[shown.number] : undefined;
  const shownIsCurrent = !!shown && shown.number === current?.number;
  const currentFits = current && fitting ? fitting.some((c) => c.number === current.number) : null;
  const seenParts = shownState?.status === "done" && shownState.panel.state === "ok";

  const showLkq = (choice: ComponentChoice) => {
    if (lkq[choice.number]) return;
    setLkq((state) => ({ ...state, [choice.number]: { status: "loading" } }));
    loadLkqComponentExamplesAction({ componentNumber: choice.number, reg }).then((result) => {
      if (!result.ok) {
        toast.error(result.error);
        setLkq((state) => {
          const next = { ...state };
          delete next[choice.number];
          return next;
        });
        return;
      }
      setCredits(result.credits);
      setLkq((state) => ({ ...state, [choice.number]: { status: "done", panel: result.examples } }));
    });
  };

  const pick = (choice: ComponentChoice) => {
    setPicked(choice);
    showLkq(choice);
  };

  const match = (choice: ComponentChoice) =>
    startSaving(async () => {
      const result = await confirmPartGroupMatch({ genartId, componentNumber: choice.number });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`“${groupName}” is now matched to LKQ's ${choice.name}, on every vehicle.`);
      onMatched();
    });

  const noMatch = () =>
    startSaving(async () => {
      const result = await markPartGroupNoMatch({ genartId });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Marked as no LKQ equivalent.");
      onMatched();
    });

  const candidates = (choices: readonly ComponentChoice[]) => (
    <div className="flex flex-wrap gap-1.5">
      {choices.map((choice) => (
        <CandidateButton
          key={choice.number}
          choice={choice}
          selected={shown?.number === choice.number}
          onClick={() => pick(choice)}
        />
      ))}
    </div>
  );

  return (
    <div className={shell}>
      <div>
        <p className="text-sm font-semibold text-text-primary">Which LKQ part is &ldquo;{groupName}&rdquo;?</p>
        <p className="mt-0.5 text-xs text-text-muted">
          Checked on <span className="font-mono font-semibold text-text-primary">{evidence.reg}</span>
          {evidence.vehicle ? ` · ${evidence.vehicle}` : ""}. The match then applies to every vehicle.
          {credits && credits.cap > 0 && ` LKQ credits ${credits.used}/${credits.cap} this month.`}
        </p>
      </div>

      {evidence.fittingNote || !fitting ? (
        <p className="text-sm text-amber-700">
          {evidence.fittingNote} Matching needs LKQ&apos;s parts for a real car, so it has to wait.
        </p>
      ) : (
        <section className="space-y-2">
          <StepTitle>1 · Pick an LKQ part</StepTitle>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={`Search the ${fitting.length} LKQ parts that fit ${evidence.reg}`}
            aria-label={`Search the LKQ parts that fit ${evidence.reg}`}
            className="h-9 w-full rounded-button border border-border bg-surface-card px-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand-blue"
          />
          {needle.length >= MIN_FILTER ? (
            filtered.length > 0 ? (
              <div className="max-h-40 overflow-y-auto">{candidates(filtered)}</div>
            ) : (
              <p className="text-xs text-text-muted">None of the LKQ parts that fit this car match that.</p>
            )
          ) : (
            evidence.suggestions.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs text-text-muted">
                  Or one whose name shares a word with the group. These are often wrong, so check their parts.
                </p>
                {candidates(evidence.suggestions)}
              </div>
            )
          )}
        </section>
      )}

      {shown && (
        <section className="space-y-2 border-t border-border-subtle pt-3">
          <StepTitle>2 · Check LKQ&apos;s parts, then match</StepTitle>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-text-primary">LKQ&apos;s {shown.name}</p>
            <span className="font-mono text-xs text-text-muted">{shown.number}</span>
            {shownIsCurrent && (
              <Pill tone={confirmed ? "success" : "accent"}>{confirmed ? "Current match" : "Auto-matched, not checked"}</Pill>
            )}
          </div>

          {shownIsCurrent && currentFits === false && (
            <p className="flex items-start gap-1.5 text-xs text-amber-700">
              <Info size={12} className="mt-0.5 shrink-0" />
              LKQ doesn&apos;t list {shown.name} for this car. Either this car doesn&apos;t take one, or the match is
              wrong.
            </p>
          )}

          {shownState?.status === "done" ? (
            shownState.panel.state === "ok" ? (
              <>
                <ul className="grid gap-2 md:grid-cols-2">
                  {shownState.panel.examples.map((example) => (
                    <ExampleCard key={example.key} example={example} />
                  ))}
                </ul>
                {shownState.panel.total > shownState.panel.examples.length && (
                  <p className="text-xs text-text-muted">
                    Showing {shownState.panel.examples.length} of {shownState.panel.total}.
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-text-muted">
                {shownState.panel.message} It can&apos;t be checked on this car, so pick another part or another car.
              </p>
            )
          ) : shownState?.status === "loading" ? (
            <p className="text-sm text-text-muted">Asking LKQ for its {shown.name} on {evidence.reg}…</p>
          ) : (
            <div className="rounded-lg border border-dashed border-border p-3">
              <Button size="sm" variant="secondary" iconLeft={Eye} onClick={() => showLkq(shown)}>
                Show LKQ&apos;s {shown.name} for this car
              </Button>
              <p className="mt-1.5 text-xs text-text-muted">Uses 1 LKQ credit the first time, then free for 7 days.</p>
            </div>
          )}

          {seenParts && !(shownIsCurrent && confirmed) && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <Button size="sm" variant="success" iconLeft={Check} disabled={saving} onClick={() => match(shown)}>
                Match to LKQ&apos;s {shown.name}
              </Button>
              <span className="text-xs text-text-muted">Not the same kind of part? Pick another above.</span>
            </div>
          )}
        </section>
      )}

      {allowNoMatch && (
        <div className="border-t border-border-subtle pt-3">
          <Button size="sm" variant="ghost" iconLeft={X} disabled={saving} onClick={noMatch}>
            LKQ has nothing equivalent
          </Button>
        </div>
      )}
    </div>
  );
}
