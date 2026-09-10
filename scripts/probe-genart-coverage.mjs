// How much of a car's repair catalogue could a parts supplier price with no
// mapping table? (Task 40.)
//
// AAG prices by TecDoc GenArt product group. HaynesPro's repair-time nodes
// carry `genarts[]`. This walks the repair tree for one vehicle and reports
// how many bookable repairs carry at least one GenArt id, which ids appear,
// and which repairs carry none — i.e. whether the full build can derive
// product groups from HaynesPro for free, or needs an admin-maintained map.
//
//   node scripts/probe-genart-coverage.mjs --vrm AB12CDE            # reg already looked up in the app
//   node scripts/probe-genart-coverage.mjs --type 317000222         # a HaynesPro car type directly
//   node scripts/probe-genart-coverage.mjs --vrm … --max 300        # walk further (default 150 expansions)
//   node scripts/probe-genart-coverage.mjs --vrm … --quote          # also ask AAG for each GenArt seen
//   node scripts/probe-genart-coverage.mjs --vrm … --json           # machine-readable summary at the end
//
// --vrm reads `haynespro_vehicle_cache` (written when the reg went through the
// booking funnel or the admin lookup); an unknown reg needs --type instead.
// Every expansion is a metered HaynesPro call, hence the cap. --quote needs
// the AAG env and calls /api/quote once per distinct GenArt (cap 15).
//
// Exit 0 = printed, 2 = config/upstream problem.
import { col, createAagRest, regKey } from "./lib/aag-rest.mjs";
import { createHaynesProRest } from "./lib/haynespro-rest.mjs";

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const flag = (name) => args.includes(name);

const vrm = arg("--vrm");
const typeArg = arg("--type");
const maxExpansions = Number(arg("--max") ?? 150);
const quoteCap = Number(arg("--quote-max") ?? 15);
if (!vrm && !typeArg) {
  console.error("Usage: node scripts/probe-genart-coverage.mjs (--vrm <reg> | --type <carTypeId>) [--max N] [--quote] [--json]");
  process.exit(2);
}

const hp = createHaynesProRest();

async function resolveRepairtimeTypeId() {
  if (typeArg) {
    const id = await hp.getRepairtimeTypeId(Number(typeArg));
    return { repairtimeTypeId: id, label: `car type ${typeArg}` };
  }
  const { data } = await hp.db
    .from("haynespro_vehicle_cache")
    .select("car_type_id, repairtime_type_id, description")
    .eq("reg", regKey(vrm))
    .maybeSingle();
  if (!data) {
    console.error(`${regKey(vrm)} isn't in haynespro_vehicle_cache — look it up in the app first (booking funnel or admin), or pass --type <carTypeId>.`);
    process.exit(2);
  }
  return {
    repairtimeTypeId: data.repairtime_type_id ?? (await hp.getRepairtimeTypeId(data.car_type_id)),
    label: `${data.description ?? "vehicle"} (car type ${data.car_type_id})`,
  };
}

try {
  const { repairtimeTypeId, label } = await resolveRepairtimeTypeId();
  if (repairtimeTypeId == null) {
    console.error(`No repair-times coverage for ${label}.`);
    process.exit(2);
  }
  console.log(`${label} · repairtime type ${repairtimeTypeId} · walking up to ${maxExpansions} groups\n`);

  const queue = [{ id: "root", path: [] }];
  const queued = new Set(["root"]);
  const leaves = [];
  let expansions = 0;

  while (queue.length && expansions < maxExpansions) {
    const batch = queue.splice(0, Math.min(8, maxExpansions - expansions));
    expansions += batch.length;
    const levels = await Promise.all(batch.map((g) => hp.getSubnodes(repairtimeTypeId, g.id)));
    for (let i = 0; i < levels.length; i++) {
      const parent = batch[i];
      for (const node of levels[i]) {
        if (node.id == null) continue;
        if (node.hasSubnodes) {
          if (!queued.has(node.id)) {
            queued.add(node.id);
            queue.push({ id: node.id, path: [...parent.path, node.description ?? node.id] });
          }
          continue;
        }
        if (typeof node.value !== "number" || node.value <= 0) continue; // untimed = unbookable
        const genarts = (node.genarts ?? []).filter((g) => typeof g?.id === "number" && g.id > 0);
        leaves.push({
          id: node.id,
          description: node.description ?? node.id,
          path: parent.path.join(" › "),
          genarts: genarts.map((g) => ({ id: g.id, description: g.description ?? null })),
        });
      }
    }
  }

  const covered = leaves.filter((l) => l.genarts.length > 0);
  const byGenart = new Map();
  for (const leaf of covered) {
    for (const g of leaf.genarts) {
      const entry = byGenart.get(g.id) ?? { id: g.id, description: g.description, repairs: 0, samples: [] };
      entry.repairs += 1;
      if (!entry.description && g.description) entry.description = g.description;
      if (entry.samples.length < 2) entry.samples.push(leaf.description);
      byGenart.set(g.id, entry);
    }
  }
  const genartRows = [...byGenart.values()].sort((a, b) => b.repairs - a.repairs);
  const pct = leaves.length ? Math.round((covered.length / leaves.length) * 100) : 0;

  console.log(`Groups expanded: ${expansions}${queue.length ? ` (${queue.length} still queued — raise --max to go further)` : " (whole tree)"}`);
  console.log(`Bookable repairs seen: ${leaves.length}`);
  console.log(`  with ≥1 GenArt: ${covered.length} (${pct}%)`);
  console.log(`  with none:      ${leaves.length - covered.length}`);
  console.log(`Distinct GenArt ids: ${genartRows.length}\n`);

  console.log(`${col("genart", 8)}${col("repairs", 8)}${col("HaynesPro description", 36)}sample repairs`);
  for (const row of genartRows) {
    console.log(`${col(row.id, 8)}${col(row.repairs, 8)}${col(row.description, 36)}${row.samples.join(" · ")}`);
  }

  const uncovered = leaves.filter((l) => l.genarts.length === 0).slice(0, 25);
  if (uncovered.length) {
    console.log(`\nFirst ${uncovered.length} repairs with no GenArt (many are labour-only — adjust, check, bleed):`);
    for (const leaf of uncovered) console.log(`  ${col(leaf.description, 48)}${leaf.path}`);
  }

  let quoteRows = [];
  if (flag("--quote")) {
    if (!vrm) {
      console.error("\n--quote needs --vrm (AAG prices by registration).");
    } else {
      const aag = createAagRest();
      console.log(`\nAsking AAG (${aag.env.baseUrl}) for ${regKey(vrm)} · up to ${quoteCap} GenArts\n`);
      console.log(`${col("genart", 8)}${col("articles", 9)}${col("products", 9)}${col("cheapest £", 11)}note`);
      for (const row of genartRows.slice(0, quoteCap)) {
        try {
          const result = await aag.quote(vrm, row.id);
          const articles = result.body?.Articles ?? [];
          const options = articles.flatMap((a) => a.ProductOptions ?? []);
          const prices = options.map((o) => o.CostPrice).filter((p) => typeof p === "number");
          const cheapest = prices.length ? Math.min(...prices).toFixed(2) : "";
          quoteRows.push({ genart: row.id, articles: articles.length, products: options.length, cheapest: prices.length ? Math.min(...prices) : null, error: null });
          console.log(`${col(row.id, 8)}${col(articles.length, 9)}${col(options.length, 9)}${col(cheapest, 11)}`);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          quoteRows.push({ genart: row.id, articles: 0, products: 0, cheapest: null, error: message });
          console.log(`${col(row.id, 8)}${col("", 9)}${col("", 9)}${col("", 11)}${message}`);
        }
      }
    }
  }

  if (flag("--json")) {
    console.log("\n" + JSON.stringify({
      label,
      repairtimeTypeId,
      expansions,
      queuedRemaining: queue.length,
      repairs: leaves.length,
      withGenart: covered.length,
      coveragePct: pct,
      genarts: genartRows,
      uncoveredSample: uncovered.map((l) => l.description),
      quotes: quoteRows,
    }, null, 2));
  }
} catch (err) {
  console.error("Probe failed:", err instanceof Error ? err.message : err);
  process.exit(2);
}
