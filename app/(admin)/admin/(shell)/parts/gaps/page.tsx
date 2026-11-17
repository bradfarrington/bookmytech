import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeftRight,
  BadgeCheck,
  CircleCheck,
  CircleDashed,
  CircleHelp,
  EyeOff,
  PackageSearch,
  ShieldCheck,
  ShoppingCart,
  Wrench,
} from "lucide-react";

import { Overline } from "@/components/ui/overline";
import { Pill } from "@/components/ui/pill";
import { excludedRepairNodeIdsForVehicle, NO_EXCLUSIONS } from "@/lib/haynespro/exclusions";
import type { PartCodeMapRow } from "@/lib/parts/code-maps";
import type { ModelPartChoiceRow } from "@/lib/parts/model-parts";
import { listScans, loadScan, loadStoredAnswers, scanView, type RepairView } from "@/lib/parts/model-scan";
import { loadPartCandidates, type PartCandidate } from "@/lib/parts/part-candidates";
import { PARTS_GAPS_SCREEN_ENABLED } from "@/lib/parts/parts-gaps-flag";
import { isMissingTable, loadPartGroupSettings } from "@/lib/parts/part-group-settings";
import { repairGroupIcon } from "@/lib/repair-group-icons";
import { createAdminClient } from "@/lib/supabase/admin";
import { cn } from "@/lib/utils";
import {
  CandidatesProvider,
  CodeMapDecision,
  FindMatchesButton,
  PartChooser,
  PartThumb,
  RecheckButton,
  RemovePickButton,
  ScanForm,
  ScanRegButton,
} from "./_components/gap-controls";

// Parts gaps (Task 77). A scanned model's repairs, laid out by HaynesPro's
// categories, showing every visible repair whose parts NAPA Auto Parts can't
// price on that model, with a dropdown to choose the part. A choice covers the
// part type on the whole model (per axle where the repair names one), at
// NAPA's live price. Code matches (HaynesPro's code -> NAPA's code for the
// same part) are reviewed at the top and apply to every car. Hiding a repair
// stays on Repairs.

export const dynamic = "force-dynamic";
// Scanning a model runs from this page: HaynesPro's tree, then NAPA for
// every part type. Allow it the time.
export const maxDuration = 300;

interface GapRow {
  make_name: string;
  model_label: string;
  last_reg: string | null;
  last_seen_at: string;
}

function day(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function evidenceLine(evidence: Record<string, unknown>): string | null {
  const note = typeof evidence.note === "string" ? evidence.note : null;
  if (note) return note;
  const model = typeof evidence.model === "string" ? evidence.model : null;
  const pricedOn = typeof evidence.pricedOn === "number" ? evidence.pricedOn : null;
  const onGapCar = typeof evidence.onGapCar === "number" ? evidence.onGapCar : null;
  const gapReg = typeof evidence.gapReg === "string" ? evidence.gapReg : null;
  const parts = [
    model ? `NAPA prices it on the ${model}${pricedOn && pricedOn > 1 ? ` and ${pricedOn - 1} more` : ""}` : null,
    gapReg && onGapCar != null ? (onGapCar > 0 ? `${onGapCar} parts on ${gapReg}` : `still nothing on ${gapReg}`) : null,
  ];
  return parts.filter(Boolean).join(" · ") || null;
}

function modelHref(make: string, model: string, all = false): string {
  return `/admin/parts/gaps?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}${all ? "&show=all" : ""}`;
}

function axleText(position: "front" | "rear" | null): string {
  return position === "front" ? " (front)" : position === "rear" ? " (rear)" : "";
}

export default async function AdminPartsGapsPage({
  searchParams,
}: {
  searchParams: Promise<{ make?: string; model?: string; show?: string }>;
}) {
  // Local only until we've decided how Gareth uses it (lib/parts/parts-gaps-flag.ts).
  if (!PARTS_GAPS_SCREEN_ENABLED) notFound();
  const params = await searchParams;
  const db = createAdminClient();

  const [mapsRead, scans, gapsRead] = await Promise.all([
    db.from("part_code_maps").select("*").order("label"),
    listScans(db),
    db.from("part_gaps").select("make_name, model_label, last_reg, last_seen_at").order("last_seen_at", { ascending: false }).limit(5000),
  ]);
  const notSetUp = [mapsRead.error, gapsRead.error].some((e) => e && isMissingTable(e));
  const maps = (mapsRead.data ?? []) as PartCodeMapRow[];
  const proposed = maps.filter((m) => m.status === "proposed");
  const decided = maps.filter((m) => m.status !== "proposed");

  // Models customers priced that haven't been scanned: one row each, newest first.
  const scanned = new Set(scans.map((s) => `${s.make_name}|${s.model_label}`));
  const unscanned = new Map<string, GapRow>();
  for (const gap of (gapsRead.data ?? []) as GapRow[]) {
    const key = `${gap.make_name}|${gap.model_label}`;
    if (!scanned.has(key) && !unscanned.has(key) && gap.last_reg) unscanned.set(key, gap);
  }

  const selected =
    scans.find((s) => s.make_name === params.make && s.model_label === params.model) ?? scans[0] ?? null;
  const showAll = params.show === "all";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Overline>Parts supplier</Overline>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-text-primary">Parts gaps</h1>
          <p className="mt-1 max-w-3xl text-sm text-text-muted">
            Repairs customers can book where we can&apos;t get a price for the part yet. Choose the part once and
            it&apos;s sorted for every customer with that kind of car.
          </p>
        </div>
        <ScanForm />
      </header>

      <HowItWorks />

      {notSetUp && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          This screen isn&apos;t set up yet. Apply migration <span className="font-mono">0090_parts_gaps.sql</span> first.
        </div>
      )}

      {/* --- Code matches --- */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-text-muted">
            Same part, two names{proposed.length ? ` (${proposed.length} to check)` : ""}
          </h2>
          <FindMatchesButton />
        </div>
        <p className="max-w-3xl text-sm text-text-muted">
          Our repair book and NAPA sometimes give the same part a different number, a bit like one person saying
          &ldquo;trainers&rdquo; and another saying &ldquo;sneakers&rdquo;. When you say yes, we use NAPA&apos;s number for
          that part on every car. We only ever pair parts with exactly the same name.
        </p>
        {proposed.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border bg-surface-card px-4 py-5 text-center text-sm text-text-muted">
            Nothing to check. Add more car models, then press &ldquo;Look for more&rdquo;.
          </p>
        ) : (
          <ul className="divide-y divide-border-subtle overflow-hidden rounded-2xl border border-border bg-surface-card shadow-card">
            {proposed.map((m) => {
              const label = m.label ?? `Part type ${m.genart_id}`;
              return (
                <li key={m.genart_id} className="flex flex-wrap items-center gap-4 px-4 py-3">
                  <ArrowLeftRight size={16} className="shrink-0 text-text-muted" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-text-primary">{label}</p>
                    <p className="mt-0.5 text-xs text-text-muted">
                      Our repair book calls it <span className="font-mono">{m.genart_id}</span>, NAPA calls it{" "}
                      <span className="font-mono">{m.napa_genart_id}</span>.
                    </p>
                    {evidenceLine(m.evidence) && <p className="mt-0.5 text-xs text-text-muted">{evidenceLine(m.evidence)}</p>}
                  </div>
                  <CodeMapDecision genartId={m.genart_id} label={label} status={m.status} />
                </li>
              );
            })}
          </ul>
        )}
        {decided.length > 0 && (
          <details className="rounded-2xl border border-border bg-surface-card px-4 py-3 text-sm">
            <summary className="cursor-pointer font-semibold text-text-primary">
              Decided ({decided.filter((m) => m.status === "approved").length} approved,{" "}
              {decided.filter((m) => m.status === "rejected").length} rejected)
            </summary>
            <ul className="mt-3 divide-y divide-border-subtle">
              {decided.map((m) => (
                <li key={m.genart_id} className="flex items-center gap-3 py-2">
                  <Pill tone={m.status === "approved" ? "success" : "neutral"}>{m.status === "approved" ? "Approved" : "Rejected"}</Pill>
                  <span className="min-w-0 flex-1 text-sm text-text-primary">
                    {m.label ?? `Part type ${m.genart_id}`}{" "}
                    <span className="font-mono text-xs text-text-muted">
                      {m.genart_id} → {m.napa_genart_id}
                    </span>
                  </span>
                  <CodeMapDecision genartId={m.genart_id} label={m.label ?? `Part type ${m.genart_id}`} status={m.status} />
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {/* --- Models --- */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-text-muted">Car models</h2>
        <p className="max-w-3xl text-sm text-text-muted">
          Pick a model to see its repairs. To add one, type a number plate at the top: we read every repair for that
          model and ask NAPA about the parts. It takes about a minute.
        </p>
        {scans.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-surface-card px-4 py-8 text-center">
            <PackageSearch size={22} className="mx-auto text-text-muted" />
            <p className="mt-3 text-sm font-semibold text-text-primary">No car models added yet</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-text-muted">Type a number plate at the top to add one.</p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {scans.map((s) => {
              const active = selected?.make_name === s.make_name && selected?.model_label === s.model_label;
              return (
                <Link
                  key={`${s.make_name}|${s.model_label}`}
                  href={modelHref(s.make_name, s.model_label)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                    active
                      ? "border-brand-blue bg-brand-blue text-white"
                      : "border-border bg-surface-card text-text-primary hover:border-brand-blue/40 hover:text-brand-blue",
                  )}
                >
                  {s.model_label}
                </Link>
              );
            })}
          </div>
        )}
        {unscanned.size > 0 && (
          <details className="rounded-2xl border border-border bg-surface-card px-4 py-3 text-sm">
            <summary className="cursor-pointer font-semibold text-text-primary">
              Customers looked at {unscanned.size} more model{unscanned.size === 1 ? "" : "s"} with missing parts
            </summary>
            <ul className="mt-3 divide-y divide-border-subtle">
              {[...unscanned.values()].map((g) => (
                <li key={`${g.make_name}|${g.model_label}`} className="flex items-center gap-3 py-2">
                  <span className="min-w-0 flex-1 text-sm text-text-primary">
                    {g.model_label} <span className="text-xs text-text-muted">· last priced {day(g.last_seen_at)}</span>
                  </span>
                  {g.last_reg && <ScanRegButton reg={g.last_reg} />}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {selected && <ModelGaps make={selected.make_name} model={selected.model_label} showAll={showAll} />}
    </div>
  );
}

/** The plain-English explanation at the top of the page. */
function HowItWorks() {
  const steps = [
    {
      icon: Wrench,
      title: "A customer picks a repair",
      text: "Some repairs need a new part, like a bulb or a brake pad.",
    },
    {
      icon: ShoppingCart,
      title: "We ask NAPA for the price",
      text: "NAPA is the shop we buy parts from. We ask what the part costs for that exact car.",
    },
    {
      icon: CircleHelp,
      title: "Sometimes NAPA can't say",
      text: "Then the customer can't see the full price, so they can't book that repair.",
    },
    {
      icon: BadgeCheck,
      title: "You choose the part once",
      text: "Pick the right part here and every customer with the same model gets the price straight away.",
    },
  ];
  const automatic = [
    {
      icon: ShieldCheck,
      title: "Checks the engine",
      text: "Some parts only fit one engine. NAPA tells us which engine each car has, so we only use those parts on the right engine.",
    },
    {
      icon: ArrowLeftRight,
      title: "Spots parts with two names",
      text: "If our repair book and NAPA use different numbers for the same part, we find it and ask you to say yes.",
    },
    {
      icon: EyeOff,
      title: "Never guesses",
      text: "If NAPA isn't sure a part fits, we don't pick one. The wrong part turning up is worse than no price.",
    },
  ];
  return (
    <details open className="group rounded-2xl border border-border bg-surface-card shadow-card">
      <summary className="flex cursor-pointer items-center justify-between gap-3 px-5 py-4">
        <span className="text-base font-bold text-text-primary">How this page works</span>
        <span className="text-xs font-semibold text-brand-blue group-open:hidden">Show</span>
        <span className="hidden text-xs font-semibold text-brand-blue group-open:inline">Hide</span>
      </summary>
      <div className="space-y-5 border-t border-border-subtle px-5 py-5">
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, i) => (
            <li key={step.title} className="rounded-xl bg-surface p-4">
              <div className="flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-full bg-brand-blue text-xs font-bold text-white">
                  {i + 1}
                </span>
                <step.icon size={18} className="text-brand-blue" />
              </div>
              <p className="mt-3 text-sm font-bold text-text-primary">{step.title}</p>
              <p className="mt-1 text-sm text-text-secondary">{step.text}</p>
            </li>
          ))}
        </ol>
        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <p className="text-sm font-bold text-text-primary">What the computer already does</p>
            <ul className="mt-2 space-y-2">
              {automatic.map((item) => (
                <li key={item.title} className="flex gap-3">
                  <item.icon size={18} className="mt-0.5 shrink-0 text-green-600" />
                  <p className="text-sm text-text-secondary">
                    <span className="font-semibold text-text-primary">{item.title}.</span> {item.text}
                  </p>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-sm font-bold text-text-primary">What you need to do</p>
            <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm text-text-secondary">
              <li>Say yes or no to the parts with two names, just below.</li>
              <li>Pick a car model, then choose a part for each repair that&apos;s missing one.</li>
              <li>
                If we&apos;d never do a repair, hide it on{" "}
                <Link href="/admin/repairs" className="font-semibold text-brand-blue hover:underline">
                  Repairs
                </Link>{" "}
                instead. It disappears for every car.
              </li>
            </ol>
          </div>
        </div>
      </div>
    </details>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "neutral" | "green" | "blue" | "amber" }) {
  const colour = {
    neutral: "text-text-primary",
    green: "text-green-700",
    blue: "text-brand-blue",
    amber: "text-amber-700",
  }[tone];
  return (
    <div className="rounded-xl bg-surface px-4 py-3">
      <p className={cn("text-2xl font-bold", colour)}>{value}</p>
      <p className="mt-0.5 text-xs text-text-muted">{label}</p>
    </div>
  );
}

/** A part already chosen for the model: its picture, name and number. */
function ChosenPart({
  pick,
  info,
  label,
  model,
}: {
  pick: ModelPartChoiceRow;
  info: PartCandidate | null;
  label: string;
  model: string;
}) {
  const name = info?.description?.trim() || pick.description?.trim() || pick.product_id;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-3 py-2">
      <PartThumb src={info?.imageUrl} alt={name} size={48} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1 text-xs font-semibold text-green-700">
          <CircleCheck size={13} /> Chosen for every {model}
          {pick.position ? ` (${pick.position} axle)` : ""}
        </p>
        <p className="truncate text-sm font-semibold text-text-primary">{name}</p>
        <p className="text-xs text-text-muted">
          {[pick.brand ?? info?.brand, pick.product_id].filter(Boolean).join(" · ")}
        </p>
      </div>
      <RemovePickButton id={pick.id} label={label} />
    </div>
  );
}

/** One scanned model's repairs, by HaynesPro category. */
async function ModelGaps({ make, model, showAll }: { make: string; model: string; showAll: boolean }) {
  const db = createAdminClient();
  const scan = await loadScan(db, make, model);
  if (!scan) return null;

  const genartIds = [...new Set(scan.repairs.flatMap((r) => r.groups.map((g) => g.genartId)))];
  const [hidden, answers, picksRead, settings] = await Promise.all([
    excludedRepairNodeIdsForVehicle(model, db).catch(() => NO_EXCLUSIONS),
    loadStoredAnswers(db, scan.reg),
    db.from("model_part_choices").select("*").eq("make_name", make).eq("model_label", model),
    loadPartGroupSettings(db, genartIds),
  ]);
  const picks = (picksRead.data ?? []) as ModelPartChoiceRow[];
  const views = scanView({
    repairs: scan.repairs,
    hidden,
    answers,
    picks,
    uncharged: settings.enabled ? settings.uncharged : undefined,
    setPrices: settings.enabled ? settings.setPrices : undefined,
  });

  const open = (v: RepairView) => v.missing.some((m) => !m.pick);
  const chosen = views.filter((v) => v.status === "gap" && !open(v)).length;
  const missing = views.filter(open);
  const pricedByNapa = views.filter((v) => v.status === "priced").length;
  const unchecked = views.some((v) => v.missing.some((m) => m.unchecked));
  const done = views.length ? Math.round(((pricedByNapa + chosen) / views.length) * 100) : 100;

  const shown = showAll ? views : views.filter((v) => v.status === "gap");
  const gapTypes = [...new Set(views.flatMap((v) => v.missing.map((m) => m.genartId)))];
  const candidates = await loadPartCandidates(db, gapTypes, make, model);
  const infoFor = (pick: ModelPartChoiceRow) =>
    candidates.get(pick.genart_id)?.find((c) => c.partNumber === pick.product_id) ?? null;

  // Top category -> sub-group trail -> repairs, in HaynesPro's order.
  const categories = new Map<string, { id: string; name: string; groups: Map<string, RepairView[]> }>();
  for (const view of shown) {
    const top = view.path[0] ?? { id: "other", name: "Other" };
    const category = categories.get(top.id) ?? { id: top.id, name: top.name, groups: new Map() };
    const trail = view.path.slice(1).map((p) => p.name).join(" › ") || top.name;
    category.groups.set(trail, [...(category.groups.get(trail) ?? []), view]);
    categories.set(top.id, category);
  }

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-border bg-surface-card px-5 py-5 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-text-primary">{model}</h2>
            <p className="mt-0.5 text-xs text-text-muted">
              {scan.vehicle ?? model} · read using <span className="font-mono">{scan.reg}</span> on {day(scan.scanned_at)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={modelHref(make, model, !showAll)}
              className="rounded-lg border border-border bg-surface-card px-3 py-1.5 text-xs font-semibold text-text-primary hover:border-brand-blue/40 hover:text-brand-blue"
            >
              {showAll ? "Only show what's missing" : "Show every repair"}
            </Link>
            <RecheckButton make={make} modelLabel={model} />
          </div>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="text-text-secondary">{done}% of repairs that need a part have a price</span>
            <span className="text-text-muted">
              {pricedByNapa + chosen} of {views.length}
            </span>
          </div>
          <div className="mt-1.5 flex h-2.5 overflow-hidden rounded-full bg-border-subtle">
            <div className="bg-green-500" style={{ width: `${views.length ? (pricedByNapa / views.length) * 100 : 0}%` }} />
            <div className="bg-brand-blue" style={{ width: `${views.length ? (chosen / views.length) * 100 : 0}%` }} />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Repairs that need a part" value={views.length} tone="neutral" />
          <Stat label="NAPA gave us a price" value={pricedByNapa} tone="green" />
          <Stat label="You chose the part" value={chosen} tone="blue" />
          <Stat label="Still need a part" value={missing.length} tone="amber" />
        </div>
        {unchecked && (
          <p className="mt-3 text-xs text-amber-700">
            NAPA didn&apos;t give a clear answer about some parts. Press &ldquo;Ask NAPA again&rdquo;. If it still
            doesn&apos;t, you can choose those parts yourself.
          </p>
        )}
      </div>

      {categories.size === 0 && (
        <p className="rounded-2xl border border-dashed border-border bg-surface-card px-4 py-8 text-center text-sm text-text-muted">
          Every repair customers can book on the {model} has a price.
        </p>
      )}

      <CandidatesProvider candidates={Object.fromEntries(candidates)}>
        {[...categories.values()].map((category, index) => {
          const Icon = repairGroupIcon(category.name);
          const repairs = [...category.groups.values()].flat();
          const openCount = repairs.filter(open).length;
          return (
            <details
              key={category.id}
              open={index === 0}
              className="overflow-hidden rounded-2xl border border-border bg-surface-card shadow-card"
            >
              <summary className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-surface">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-brand-blue">
                  <Icon size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-text-primary">{category.name}</span>
                  <span className="block text-xs text-text-muted">
                    {repairs.length} repair{repairs.length === 1 ? "" : "s"}
                  </span>
                </span>
                <Pill tone={openCount ? "pending" : "success"}>{openCount ? `${openCount} need a part` : "All sorted"}</Pill>
              </summary>
              <div className="divide-y divide-border-subtle border-t border-border-subtle">
                {[...category.groups.entries()].map(([trail, list]) => (
                  <div key={trail}>
                    <p className="bg-surface px-4 py-2 text-xs font-semibold uppercase tracking-wide text-text-muted">{trail}</p>
                    <ul className="divide-y divide-border-subtle">
                      {list.map((repair) => (
                        <li key={repair.id} className="px-4 py-4">
                          <div className="flex items-start gap-2">
                            {repair.status === "priced" || !open(repair) ? (
                              <CircleCheck size={18} className="mt-0.5 shrink-0 text-green-600" />
                            ) : (
                              <CircleDashed size={18} className="mt-0.5 shrink-0 text-amber-600" />
                            )}
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-text-primary">{repair.name}</p>
                              {repair.status === "priced" && (
                                <p className="text-xs text-green-700">NAPA gave us a price for every part.</p>
                              )}
                            </div>
                          </div>
                          {repair.missing.length > 0 && (
                            <div className="mt-3 space-y-3 pl-6">
                              {repair.missing.map((part) => (
                                <div key={`${part.genartId}-${part.position ?? "any"}`} className="space-y-2">
                                  <p className="text-xs text-text-secondary">
                                    <span className="font-semibold text-text-primary">
                                      Part needed: {part.label}
                                      {axleText(part.position)}
                                    </span>
                                    {!part.pick && !part.unchecked && (
                                      <span> · NAPA doesn&apos;t sell this for the {model} yet.</span>
                                    )}
                                  </p>
                                  {part.pick ? (
                                    <ChosenPart pick={part.pick} info={infoFor(part.pick)} label={part.label} model={model} />
                                  ) : (
                                    <>
                                      {part.unchecked && (
                                        <p className="text-xs text-amber-700">
                                          NAPA didn&apos;t give a clear answer about this part. Press &ldquo;Ask NAPA
                                          again&rdquo;, or choose the part yourself.
                                        </p>
                                      )}
                                      <PartChooser
                                        make={make}
                                        modelLabel={model}
                                        genartId={part.genartId}
                                        label={part.label}
                                        position={part.position}
                                      />
                                    </>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </details>
          );
        })}
      </CandidatesProvider>
    </section>
  );
}
