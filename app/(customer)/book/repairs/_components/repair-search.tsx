"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import type { CatalogueNode } from "@/lib/haynespro/catalogue";
import { MIN_SEARCH_QUERY_LENGTH } from "@/lib/haynespro/search-query";
import { buildRepairHrefs } from "@/lib/bookings/repair-hrefs";
import { searchRepairsAction } from "@/app/actions/repair-search";
import { RepairRows } from "./repair-rows";

// The search box above the customer's repair browser (Task 30). Type what's
// wrong and the matching jobs appear, priced for this car, with the same
// Book / Add buttons as browsing — the results replace the browse list while
// a query is active and the list comes straight back when it's cleared, so
// nothing on the server re-renders per keystroke.
//
// HaynesPro has no keyword search: the server walks the tree best-first and
// stops after a bounded number of levels. `truncated` means "the closest
// matches we found", never "every match" — the heading says so.

interface RepairSearchProps {
  reg: string;
  make?: string;
  model?: string;
  postcode?: string;
  pref?: string;
  selectedIds: string[];
  adding: boolean;
  atCap: boolean;
  /** The server-rendered breadcrumbs + browse list, shown while not searching. */
  children: React.ReactNode;
}

interface SearchState {
  hits: CatalogueNode[];
  truncated: boolean;
  searching: boolean;
  error: string | null;
}

const IDLE: SearchState = { hits: [], truncated: false, searching: false, error: null };
const DEBOUNCE_MS = 350;

export function RepairSearch({
  reg,
  make,
  model,
  postcode,
  pref,
  selectedIds,
  adding,
  atCap,
  children,
}: RepairSearchProps) {
  const [query, setQuery] = useState("");
  const [{ hits, truncated, searching, error }, setState] = useState<SearchState>(IDLE);
  // Debounce + "latest wins": a slow reply for an earlier keystroke is dropped.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(0);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      latest.current++;
    },
    [],
  );

  const trimmed = query.trim();
  const active = trimmed.length >= MIN_SEARCH_QUERY_LENGTH;

  function onQueryChange(value: string) {
    setQuery(value);
    if (timer.current) clearTimeout(timer.current);
    const q = value.trim();
    const ticket = ++latest.current;
    if (q.length < MIN_SEARCH_QUERY_LENGTH) {
      setState(IDLE);
      return;
    }
    setState((s) => ({ ...s, searching: true, error: null }));
    timer.current = setTimeout(async () => {
      const result = await searchRepairsAction({ reg, query: q });
      if (ticket !== latest.current) return; // a newer search is in flight
      setState(
        result.ok
          ? { hits: result.hits, truncated: result.truncated, searching: false, error: null }
          : { hits: [], truncated: false, searching: false, error: result.error },
      );
    }, DEBOUNCE_MS);
  }

  function clear() {
    if (timer.current) clearTimeout(timer.current);
    latest.current++;
    setQuery("");
    setState(IDLE);
  }

  // A hit's group link starts a fresh trail at that group — the walk doesn't
  // record the path down to it, and one honest crumb beats a guessed one.
  const hrefs = buildRepairHrefs({ reg, make, model, postcode, pref, selectedIds, trail: [] });

  return (
    <div className="flex flex-col gap-4">
      <label className="relative block">
        <Search
          size={16}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search for a job, e.g. front brake pads"
          aria-label="Search repairs"
          autoComplete="off"
          enterKeyHint="search"
          className="h-12 w-full rounded-2xl border border-border bg-surface-card pl-10 pr-10 text-sm text-text-primary shadow-card outline-none placeholder:text-text-muted focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20 [&::-webkit-search-cancel-button]:hidden"
        />
        {searching ? (
          <Loader2
            size={16}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin text-text-muted"
          />
        ) : (
          query && (
            <button
              type="button"
              onClick={clear}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-text-muted hover:bg-surface hover:text-text-primary"
            >
              <X size={14} />
            </button>
          )
        )}
      </label>

      {!active ? (
        <>
          {query && (
            <p className="text-xs text-text-muted">
              Keep typing — at least {MIN_SEARCH_QUERY_LENGTH} letters to search.
            </p>
          )}
          {children}
        </>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-bold text-text-primary">
              {searching
                ? "Searching…"
                : error
                  ? "Search unavailable"
                  : hits.length === 0
                    ? "No matches"
                    : truncated
                      ? "Closest matches"
                      : `${hits.length} match${hits.length === 1 ? "" : "es"}`}
            </h2>
            <button
              type="button"
              onClick={clear}
              className="text-xs font-semibold text-brand-blue hover:underline"
            >
              Browse instead
            </button>
          </div>
          {error ? (
            <p className="rounded-2xl border border-border bg-surface-card px-4 py-6 text-center text-sm text-text-muted">
              {error}
            </p>
          ) : searching && hits.length === 0 ? (
            <div className="rounded-2xl border border-border bg-surface-card px-4 py-8 text-center text-sm text-text-muted">
              Looking through every repair for your car…
            </div>
          ) : (
            <RepairRows
              nodes={hits}
              selectedIds={selectedIds}
              adding={adding}
              atCap={atCap}
              groupHref={hrefs.groupHref}
              bookHref={hrefs.bookHref}
              groupCaption={() => "A group of repairs — open it to see them"}
              emptyLabel={
                <>
                  Nothing matches &ldquo;{trimmed}&rdquo;. Try fewer or different words, or
                  browse the categories instead.
                </>
              }
            />
          )}
          {truncated && !searching && hits.length > 0 && (
            <p className="text-xs text-text-muted">
              Not every repair was checked — be more specific to find others, or browse the
              categories.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
