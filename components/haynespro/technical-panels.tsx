import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getAdjustments,
  getCapacities,
  getIdLocations,
  getStory,
  getStoryList,
} from "@/lib/haynespro/tree";
import type { HpAdjustment, HpStoryLine } from "@/lib/haynespro/types";

// HaynesPro repair manuals and technical data, rendered IN the app (Task 16
// Stage E built these for the admin model page; Task 27 shares them with the
// mechanic's job page so nobody is sent out to WorkshopData Touch). Server
// components: every HaynesPro read is server-side and memoised.

// ---------------------------------------------------------------------------
// Manuals — story list + story viewer.
// ---------------------------------------------------------------------------

export interface ManualsHrefs {
  /** The list of manuals (the viewer's "All manuals" link). */
  list: string;
  /** One manual. */
  story: (storyId: number) => string;
}

export async function ManualsPanel({
  carTypeId,
  hrefs,
  storyId,
}: {
  carTypeId: number;
  hrefs: ManualsHrefs;
  storyId?: string;
}) {
  const storyIdNum = Number.parseInt(storyId ?? "", 10);
  if (Number.isFinite(storyIdNum)) {
    const story = await getStory(carTypeId, storyIdNum);
    return (
      <div className="space-y-4">
        <Link
          href={hrefs.list}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-blue hover:underline"
        >
          <ArrowLeft size={14} /> All manuals
        </Link>
        {!story ? (
          <p className="rounded-button border border-border bg-surface-card px-4 py-8 text-center text-sm text-text-muted">
            Couldn&apos;t load this manual.
          </p>
        ) : (
          <article className="rounded-2xl border border-border bg-surface-card p-6 shadow-card">
            <h2 className="text-xl font-bold text-text-primary">{story.name}</h2>
            <div className="mt-4 space-y-3">
              {(story.storyLines ?? []).map((line, i) => (
                <StoryLineView key={i} line={line} depth={0} />
              ))}
            </div>
          </article>
        )}
      </div>
    );
  }

  const stories = await getStoryList(carTypeId);
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface-card shadow-card">
      {stories.length === 0 && (
        <p className="px-4 py-8 text-center text-sm text-text-muted">
          No repair manuals available for this variant.
        </p>
      )}
      <ul className="divide-y divide-border-subtle">
        {stories.map((story) => (
          <li key={story.storyId}>
            <Link
              href={hrefs.story(story.storyId as number)}
              className="flex items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-text-primary transition-colors hover:bg-surface"
            >
              {story.name}
              <span className="text-xs font-normal text-text-muted">Read ›</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function StoryLineView({ line, depth }: { line: HpStoryLine; depth: number }) {
  const hasChildren = (line.subStoryLines ?? []).length > 0;
  const image = line.mimeData?.mimeDataName;
  return (
    <div className={cn(depth > 0 && "ml-4 border-l border-border-subtle pl-4")}>
      {line.name && (
        <p
          className={cn(
            "text-sm leading-relaxed",
            hasChildren ? "font-semibold text-text-primary" : "text-text-secondary",
          )}
        >
          {line.name}
        </p>
      )}
      {line.paragraphContent && (
        <p className="mt-1 text-sm leading-relaxed text-text-secondary">
          {line.paragraphContent}
        </p>
      )}
      {line.remark && (
        <p className="mt-1 text-xs italic text-text-muted">{line.remark}</p>
      )}
      {image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt=""
          loading="lazy"
          className="mt-2 max-h-80 w-auto max-w-full rounded-lg border border-border-subtle bg-white p-2"
        />
      )}
      {hasChildren && (
        <div className="mt-2 space-y-2">
          {(line.subStoryLines ?? []).map((sub, i) => (
            <StoryLineView key={i} line={sub} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Technical data — adjustments, capacities, ID locations.
// ---------------------------------------------------------------------------

export async function DataPanel({ carTypeId }: { carTypeId: number }) {
  const [adjustments, capacities, idLocations] = await Promise.all([
    getAdjustments(carTypeId),
    getCapacities(carTypeId),
    getIdLocations(carTypeId),
  ]);

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-3 text-lg font-bold text-text-primary">
          Adjustments &amp; specifications
        </h2>
        {adjustments.length === 0 ? (
          <p className="rounded-button border border-border bg-surface-card px-4 py-6 text-center text-sm text-text-muted">
            No adjustment data for this variant.
          </p>
        ) : (
          <div className="space-y-2">
            {adjustments.map((group, i) => (
              <details
                key={i}
                className="group rounded-2xl border border-border bg-surface-card shadow-card"
              >
                <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-text-primary">
                  {group.name}
                </summary>
                <div className="border-t border-border-subtle px-4 py-3">
                  <AdjustmentRows rows={group.subAdjustments ?? []} depth={0} />
                </div>
              </details>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold text-text-primary">Capacities</h2>
        {capacities.length === 0 ? (
          <p className="rounded-button border border-border bg-surface-card px-4 py-6 text-center text-sm text-text-muted">
            No capacity data for this variant.
          </p>
        ) : (
          <div className="rounded-2xl border border-border bg-surface-card px-4 py-3 shadow-card">
            {capacities.map((group, i) => (
              <AdjustmentRows key={i} rows={group.subAdjustments ?? []} depth={0} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold text-text-primary">
          VIN &amp; ID plate locations
        </h2>
        {idLocations.length === 0 ? (
          <p className="rounded-button border border-border bg-surface-card px-4 py-6 text-center text-sm text-text-muted">
            No ID-location data for this variant.
          </p>
        ) : (
          idLocations.map((loc, i) => (
            <div
              key={i}
              className="rounded-2xl border border-border bg-surface-card p-4 shadow-card"
            >
              <div className="space-y-3">
                {(loc.storyLines ?? []).map((line, j) => (
                  <StoryLineView key={j} line={line} depth={0} />
                ))}
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

function AdjustmentRows({ rows, depth }: { rows: HpAdjustment[]; depth: number }) {
  return (
    <div className={cn(depth > 0 && "ml-4")}>
      {rows.map((row, i) => {
        const hasChildren = (row.subAdjustments ?? []).length > 0;
        return (
          <div key={i} className="py-1">
            {hasChildren ? (
              <>
                <p className="pt-1 text-sm font-semibold text-text-primary">{row.name}</p>
                <AdjustmentRows rows={row.subAdjustments ?? []} depth={depth + 1} />
              </>
            ) : (
              <div className="flex items-baseline justify-between gap-4 text-sm">
                <span className="text-text-secondary">{row.name}</span>
                <span className="shrink-0 font-medium text-text-primary">
                  {row.value ?? "—"}
                  {row.unit ? ` ${row.unit}` : ""}
                </span>
              </div>
            )}
            {row.remark && <p className="text-xs italic text-text-muted">{row.remark}</p>}
          </div>
        );
      })}
    </div>
  );
}
