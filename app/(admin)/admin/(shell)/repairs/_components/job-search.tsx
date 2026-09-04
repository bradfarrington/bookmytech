"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { addNodeToBundle, searchJobsForBundle } from "@/app/actions/repair-catalogue";
import { useCatalogueAction } from "./use-catalogue-action";

// The search box on a combined repair's card (Task 26): type a job's name,
// pick it, and it joins the bundle's pool. Searches the reference vehicle's
// tree the same way the customer search does (best-first walk, capped), so
// "closest matches" is the honest label when the walk stopped early.

interface Hit {
  id: string;
  description: string;
  billedHours: number | null;
}

interface SearchState {
  hits: Hit[];
  truncated: boolean;
  searching: boolean;
  error: string | null;
}

const IDLE: SearchState = { hits: [], truncated: false, searching: false, error: null };

export function JobSearch({ bundleId, poolIds }: { bundleId: string; poolIds: string[] }) {
  const { pending, run } = useCatalogueAction();
  const [query, setQuery] = useState("");
  const [{ hits, truncated, searching, error }, setState] = useState<SearchState>(IDLE);
  // Debounce + "latest wins": a slow reply for an earlier keystroke is dropped.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(0);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    latest.current++;
  }, []);

  function onQueryChange(value: string) {
    setQuery(value);
    if (timer.current) clearTimeout(timer.current);
    const q = value.trim();
    const ticket = ++latest.current;
    if (q.length < 3) {
      setState(IDLE);
      return;
    }
    timer.current = setTimeout(async () => {
      setState((s) => ({ ...s, searching: true }));
      const result = await searchJobsForBundle({ query: q });
      if (ticket !== latest.current) return; // a newer search is in flight
      setState(
        result.ok
          ? { hits: result.hits, truncated: result.truncated, searching: false, error: null }
          : { hits: [], truncated: false, searching: false, error: result.error },
      );
    }, 350);
  }

  const visible = hits.filter((h) => !poolIds.includes(h.id));

  return (
    <div className="space-y-2">
      <label className="relative block">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search for a job to add, e.g. front brake discs"
          aria-label="Search for a job to add"
          className="h-10 w-full rounded-md border border-border bg-surface-card pl-9 pr-9 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20"
        />
        {searching && (
          <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-text-muted" />
        )}
      </label>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {query.trim().length >= 3 && !searching && !error && visible.length === 0 && (
        <p className="text-xs text-text-muted">No jobs match that. Try fewer words.</p>
      )}
      {visible.length > 0 && (
        <ul className="max-h-64 divide-y divide-border-subtle overflow-y-auto rounded-xl border border-border bg-surface">
          {visible.map((hit) => (
            <li key={hit.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate text-text-primary">{hit.description}</span>
              <span className="shrink-0 text-xs text-text-muted">
                {hit.billedHours != null ? `${hit.billedHours}h` : ""}
              </span>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  run(() => addNodeToBundle({ bundleId, nodeId: hit.id }), {
                    success: `Added "${hit.description}".`,
                  })
                }
                className={cn(
                  "inline-flex h-8 shrink-0 items-center gap-1 rounded-button bg-brand-blue px-2.5 text-xs font-semibold text-white",
                  pending && "opacity-60",
                )}
              >
                <Plus size={12} />
                Add
              </button>
            </li>
          ))}
          {truncated && (
            <li className="px-3 py-2 text-[11px] text-text-muted">
              Closest matches — not every job was checked. Be more specific to find others.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
