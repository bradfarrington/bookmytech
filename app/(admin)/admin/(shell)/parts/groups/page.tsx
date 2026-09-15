import Link from "next/link";
import { AlertTriangle, ArrowLeft, Link2, Search } from "lucide-react";

import { Overline } from "@/components/ui/overline";
import { Pill } from "@/components/ui/pill";
import { adsRegKey } from "@/lib/lkq/vehicle";
import { resolvePartGroupLink, type ResolvedPartGroupLink } from "@/lib/parts/part-group-match";
import { loadPartGroupLinks } from "@/lib/parts/part-groups";
import { createAdminClient } from "@/lib/supabase/admin";
import { cn } from "@/lib/utils";
import { ExampleCarPicker, type RecentVehicle } from "./_components/example-car-picker";
import { PartGroupReview, type ComponentOption } from "./_components/part-group-review";

// Part group matches (Task 45, stage 2).
//
// HaynesPro says which TecDoc part groups a repair uses. Alliance Automotive
// prices those groups directly; LKQ has its own component list, so each group
// has to be matched to an LKQ component — once, because a part group means the
// same thing on every vehicle. This is where that is decided.
//
// Rows arrive on their own as repairs are fetched (lib/parts/part-groups.ts).
// "Auto-matched" is computed on this page from the names, never stored, and is
// shown as unchecked until someone confirms it.

export const dynamic = "force-dynamic";

const TABS = [
  { key: "review", label: "Needs a match" },
  { key: "auto", label: "Auto-matched" },
  { key: "confirmed", label: "Confirmed" },
  { key: "none", label: "No LKQ equivalent" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function tabOf(link: ResolvedPartGroupLink): TabKey {
  switch (link.kind) {
    case "auto":
      return "auto";
    case "confirmed":
      return "confirmed";
    case "no_match":
      return "none";
    default:
      return "review";
  }
}

function StatusPill({ link }: { link: ResolvedPartGroupLink }) {
  switch (link.kind) {
    case "confirmed":
      return <Pill tone="success">Confirmed</Pill>;
    case "auto":
      return <Pill tone="accent">Auto-matched · not checked</Pill>;
    case "no_match":
      return <Pill tone="neutral">No LKQ equivalent</Pill>;
    case "stale":
      return <Pill tone="error">LKQ no longer lists {link.componentNumber}</Pill>;
    default:
      return <Pill tone="pending">Needs a match</Pill>;
  }
}

/** Cars customers or admins have looked up, newest first — candidates to show example parts on. */
async function recentVehicles(db: ReturnType<typeof createAdminClient>): Promise<RecentVehicle[]> {
  try {
    const { data } = await db
      .from("haynespro_vehicle_cache")
      .select("reg, description")
      .order("created_at", { ascending: false })
      .limit(15);
    return (data ?? []) as RecentVehicle[];
  } catch {
    return [];
  }
}

interface PageProps {
  searchParams: Promise<{ tab?: string; q?: string; reg?: string }>;
}

export default async function PartGroupMatchesPage({ searchParams }: PageProps) {
  const query = await searchParams;
  const db = createAdminClient();
  const [{ rows, missingTable }, recent] = await Promise.all([loadPartGroupLinks(db), recentVehicles(db)]);
  const reg = adsRegKey(query.reg ?? "") || null;

  const items = rows.map((row) => ({ row, link: resolvePartGroupLink(row) }));
  const counts = new Map<TabKey, number>(TABS.map((t) => [t.key, 0]));
  for (const item of items) {
    const key = tabOf(item.link);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const tab: TabKey =
    TABS.find((t) => t.key === query.tab)?.key ?? ((counts.get("review") ?? 0) > 0 ? "review" : "auto");
  const needle = (query.q ?? "").trim().toLowerCase();
  const visible = items
    .filter((item) => tabOf(item.link) === tab)
    .filter(
      ({ row }) =>
        !needle ||
        row.description.toLowerCase().includes(needle) ||
        String(row.genart_id) === needle ||
        (row.sample_repair ?? "").toLowerCase().includes(needle),
    )
    .sort((a, b) => a.row.description.localeCompare(b.row.description));

  const tabHref = (key: TabKey) =>
    `/admin/parts/groups?tab=${key}${needle ? `&q=${encodeURIComponent(query.q ?? "")}` : ""}${reg ? `&reg=${reg}` : ""}`;

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <Link
          href="/admin/parts"
          className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border text-text-secondary hover:bg-surface"
          aria-label="Back to parts"
        >
          <ArrowLeft size={18} />
        </Link>
        <div>
          <Overline>Parts</Overline>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-text-primary">Part group matches</h1>
          <p className="mt-1 max-w-3xl text-sm text-text-muted">
            HaynesPro lists the part groups each repair uses. Alliance Automotive prices those groups
            directly, but LKQ has its own list of parts, so each group needs matching to an LKQ part
            once. The match then applies to every vehicle.
          </p>
        </div>
      </header>

      {missingTable && (
        <div className="flex items-start gap-3 rounded-button border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">The part group table doesn&apos;t exist yet.</p>
            <p className="mt-0.5 text-amber-800">
              Run <code>supabase/migrations/0066_part_group_links.sql</code> on the database. Until
              then nothing is recorded or saved here.
            </p>
          </div>
        </div>
      )}

      <ExampleCarPicker reg={reg} recent={recent} tab={tab} q={query.q ?? ""} />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <nav className="flex flex-wrap gap-2" aria-label="Filter part groups">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={tabHref(t.key)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors",
                t.key === tab
                  ? "border-brand-blue bg-blue-50 text-brand-blue"
                  : "border-border bg-surface-card text-text-secondary hover:border-brand-blue/40",
              )}
            >
              {t.label} <span className="text-text-muted">{counts.get(t.key) ?? 0}</span>
            </Link>
          ))}
        </nav>
        <form action="/admin/parts/groups" className="flex w-full items-center gap-2 lg:w-80">
          <input type="hidden" name="tab" value={tab} />
          {reg && <input type="hidden" name="reg" value={reg} />}
          <label className="relative w-full">
            <span className="sr-only">Search part groups</span>
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              name="q"
              defaultValue={query.q ?? ""}
              placeholder="Search groups or repairs"
              className="h-10 w-full rounded-button border border-border bg-surface-card pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand-blue"
            />
          </label>
        </form>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface-card px-4 py-10 text-center">
          <Link2 size={22} className="mx-auto text-text-muted" />
          <p className="mt-3 text-sm font-semibold text-text-primary">
            {rows.length === 0 ? "No part groups recorded yet" : "Nothing here"}
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm text-text-muted">
            {rows.length === 0
              ? "Part groups are added as HaynesPro repairs are browsed. To fill the list for one car now, run scripts/seed-part-groups.mjs."
              : needle
                ? "No part group in this list matches that search."
                : "No part groups are in this state."}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border-subtle rounded-2xl border border-border bg-surface-card shadow-card">
          {visible.map(({ row, link }) => {
            const current: ComponentOption | null =
              link.kind === "confirmed" || link.kind === "auto"
                ? { number: link.component.ComponentNumber, name: link.component.ComponentName.trim() }
                : null;
            return (
              <li
                key={row.genart_id}
                className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:flex-wrap lg:items-start lg:gap-x-6"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-text-primary">
                      {row.description || `Part group ${row.genart_id}`}
                    </p>
                    <StatusPill link={link} />
                  </div>
                  <p className="mt-0.5 text-xs text-text-muted">
                    <span className="font-mono">Group {row.genart_id}</span>
                    {row.sample_repair && <> · used by &ldquo;{row.sample_repair}&rdquo;</>}
                  </p>
                  {current && (
                    <p className="mt-1 text-xs text-text-secondary">
                      LKQ: <span className="font-mono">{current.number}</span> {current.name}
                    </p>
                  )}
                </div>
                <PartGroupReview
                  genartId={row.genart_id}
                  description={row.description}
                  reg={reg}
                  kind={link.kind}
                  current={current}
                />
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-xs text-text-muted">
        &ldquo;Auto-matched&rdquo; means the names use exactly the same words and only one LKQ part
        fits. Nobody has checked it. Everything else is matched by looking at LKQ&apos;s actual parts on
        a real car, because a similar name can still be the wrong part (&ldquo;Tie rod end&rdquo; is not
        &ldquo;Inner Tie Rod&rdquo;). That uses LKQ credits the first time for each car and part, then is
        cached. Alliance Automotive needs no matching: it takes part groups directly.
      </p>
    </div>
  );
}
