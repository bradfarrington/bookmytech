"use client";

import { useEffect, useState } from "react";
import { Check, Search, Undo2, X } from "lucide-react";

import {
  confirmPartGroupMatch,
  markPartGroupNoMatch,
  resetPartGroupMatch,
  searchComponentsForMatch,
} from "@/app/actions/part-groups";
import { Button } from "@/components/ui/button";
import type { ResolvedPartGroupLink } from "@/lib/parts/part-group-match";
import { useCatalogueAction } from "../../../repairs/_components/use-catalogue-action";

// The decision controls for one part group on /admin/parts/groups (Task 45).
// Each button is one server action; the list is server-rendered and refreshes
// after every change.

export interface ComponentOption {
  number: string;
  name: string;
  /** Name similarity, 0–100, for a suggestion. */
  score?: number;
}

const MIN_QUERY = 2;

export function PartGroupReview({
  genartId,
  kind,
  current,
  suggestions,
}: {
  genartId: number;
  kind: ResolvedPartGroupLink["kind"];
  current: ComponentOption | null;
  suggestions: ComponentOption[];
}) {
  const { pending, run } = useCatalogueAction();
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ComponentOption[]>([]);

  useEffect(() => {
    const q = query.trim();
    if (!searching || q.length < MIN_QUERY) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const found = await searchComponentsForMatch(q);
      if (!cancelled) setResults(found);
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, searching]);

  const shownResults = query.trim().length >= MIN_QUERY ? results : [];

  const confirm = (option: ComponentOption) =>
    run(() => confirmPartGroupMatch({ genartId, componentNumber: option.number }), {
      success: `Matched to ${option.name}.`,
      onSuccess: () => {
        setSearching(false);
        setQuery("");
      },
    });

  return (
    <div className="flex w-full flex-col gap-2 lg:w-[26rem]">
      <div className="flex flex-wrap items-center gap-2">
        {kind === "auto" && current && (
          <Button size="sm" variant="success" iconLeft={Check} disabled={pending} onClick={() => confirm(current)}>
            Confirm match
          </Button>
        )}
        {suggestions.map((option) => (
          <Button
            key={option.number}
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => confirm(option)}
            title={`${option.number} · ${option.score ?? 0}% of words shared`}
          >
            Use {option.name}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          iconLeft={Search}
          disabled={pending}
          onClick={() => setSearching((open) => !open)}
        >
          {kind === "confirmed" ? "Change…" : "Search LKQ…"}
        </Button>
        {kind !== "no_match" && kind !== "confirmed" && (
          <Button
            size="sm"
            variant="ghost"
            iconLeft={X}
            disabled={pending}
            onClick={() => run(() => markPartGroupNoMatch({ genartId }), { success: "Marked as no LKQ equivalent." })}
          >
            No LKQ equivalent
          </Button>
        )}
        {(kind === "confirmed" || kind === "no_match" || kind === "stale") && (
          <Button
            size="sm"
            variant="tertiary"
            iconLeft={Undo2}
            disabled={pending}
            onClick={() => run(() => resetPartGroupMatch({ genartId }), { success: "Back to unreviewed." })}
          >
            Undo
          </Button>
        )}
      </div>
      {searching && (
        <div className="rounded-button border border-border bg-surface p-2">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search LKQ's 2,277 parts"
            className="h-9 w-full rounded-button border border-border bg-surface-card px-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand-blue"
          />
          {shownResults.length > 0 && (
            <ul className="mt-2 max-h-56 divide-y divide-border-subtle overflow-y-auto rounded-button border border-border bg-surface-card">
              {shownResults.map((option) => (
                <li key={option.number}>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => confirm(option)}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-blue-50 disabled:opacity-50"
                  >
                    <span className="font-mono text-xs text-text-muted">{option.number}</span>
                    <span className="text-text-primary">{option.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {query.trim().length >= MIN_QUERY && shownResults.length === 0 && (
            <p className="mt-2 px-1 text-xs text-text-muted">No LKQ part matches that yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
