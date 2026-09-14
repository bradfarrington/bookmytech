// Fill part_group_links from one vehicle's HaynesPro repair tree (Task 45).
//
// Part groups are normally recorded as repairs are fetched in the app. This
// fills the review list at /admin/parts/groups for one car up front. The only
// write is inserting part groups not already listed: existing rows, and every
// admin decision, are left alone.
//
//   node scripts/seed-part-groups.mjs --vrm BM19WKO          # a reg in haynespro_vehicle_cache
//   node scripts/seed-part-groups.mjs --type 619023786       # a HaynesPro car type directly
//   node scripts/seed-part-groups.mjs --vrm … --max 150      # walk further (default 120)
//   node scripts/seed-part-groups.mjs --vrm … --all          # every top-level group, not just part-heavy ones
//   node scripts/seed-part-groups.mjs --vrm … --dry-run      # count, write nothing
//
// Every expansion is a metered HaynesPro content call (probe-prefixed session,
// scripts/lib/haynespro-rest.mjs), hence --max. Without --all only top-level
// groups likely to name parts are walked; labour-only groups name none.
//
// Exit 0 = done, 2 = config/upstream problem.
import { createHaynesProRest } from "./lib/haynespro-rest.mjs";

/** Uppercase, no spaces or punctuation — the haynespro_vehicle_cache key shape. */
const regKey = (reg) => (reg ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const flag = (name) => args.includes(name);

const vrm = arg("--vrm");
const typeArg = arg("--type");
const maxExpansions = Number(arg("--max") ?? 120);
if (!vrm && !typeArg) {
  console.error("Usage: node scripts/seed-part-groups.mjs (--vrm <reg> | --type <carTypeId>) [--max N] [--all] [--dry-run]");
  process.exit(2);
}

const PART_HEAVY =
  /brake|clutch|filter|cool|suspension|exhaust|ignition|steer|timing|belt|fuel|wheel|shock|spark|glow|starter|alternator|battery|wiper|light|bearing|engine|transmission|drive|air/i;

const hp = createHaynesProRest();

async function resolveVehicle() {
  if (typeArg) {
    const carTypeId = Number(typeArg);
    return { carTypeId, repairtimeTypeId: await hp.getRepairtimeTypeId(carTypeId), label: `car type ${carTypeId}` };
  }
  const { data } = await hp.db
    .from("haynespro_vehicle_cache")
    .select("car_type_id, repairtime_type_id, description")
    .eq("reg", regKey(vrm))
    .maybeSingle();
  if (!data) {
    console.error(`${regKey(vrm)} isn't in haynespro_vehicle_cache — look it up in the app first, or pass --type <carTypeId>.`);
    process.exit(2);
  }
  return {
    carTypeId: data.car_type_id,
    repairtimeTypeId: data.repairtime_type_id ?? (await hp.getRepairtimeTypeId(data.car_type_id)),
    label: `${data.description ?? "vehicle"} (car type ${data.car_type_id})`,
  };
}

try {
  const { carTypeId, repairtimeTypeId, label } = await resolveVehicle();
  if (repairtimeTypeId == null) {
    console.error(`No repair-times coverage for ${label}.`);
    process.exit(2);
  }
  const vehicle = { carTypeId, repairtimeTypeId };

  const root = await hp.getSubnodes(vehicle, "root");
  const start = root.filter((n) => n.id != null && n.hasSubnodes && (flag("--all") || PART_HEAVY.test(n.description ?? "")));
  console.log(`${label} · ${start.length} of ${root.length} top-level groups · up to ${maxExpansions} expansions`);

  // Depth-first: repairs sit two or more levels down, and a breadth-first walk
  // spends its whole budget on the top-level groups' children.
  const groups = new Map();
  const stack = start.map((n) => n.id).reverse();
  const seen = new Set(stack);
  let expansions = 1;
  while (stack.length && expansions < maxExpansions) {
    const id = stack.pop();
    expansions++;
    for (const node of await hp.getSubnodes(vehicle, id)) {
      if (node.id == null) continue;
      if (node.hasSubnodes) {
        if (!seen.has(node.id)) {
          seen.add(node.id);
          stack.push(node.id);
        }
        continue;
      }
      for (const g of node.genarts ?? []) {
        if (typeof g?.id !== "number" || g.id <= 0 || groups.has(g.id)) continue;
        groups.set(g.id, {
          genart_id: g.id,
          description: (g.description ?? "").trim(),
          sample_repair: (node.description ?? "").trim() || null,
        });
      }
    }
  }
  console.log(`walked ${expansions} groups · ${groups.size} distinct part groups`);
  if (groups.size === 0) process.exit(0);

  const ids = [...groups.keys()];
  const { data: existing, error: readError } = await hp.db.from("part_group_links").select("genart_id").in("genart_id", ids);
  if (readError) {
    console.error(`Couldn't read part_group_links: ${readError.message}. Has migration 0066 been applied?`);
    process.exit(2);
  }
  const known = new Set((existing ?? []).map((r) => r.genart_id));
  const fresh = ids.filter((id) => !known.has(id)).map((id) => groups.get(id));
  console.log(`${known.size} already listed · ${fresh.length} new`);

  if (flag("--dry-run")) {
    for (const row of fresh.slice(0, 20)) console.log(`  + ${row.genart_id} ${row.description}`);
    console.log("dry run: nothing written");
    process.exit(0);
  }
  if (fresh.length) {
    const { error } = await hp.db
      .from("part_group_links")
      .upsert(fresh, { onConflict: "genart_id", ignoreDuplicates: true });
    if (error) {
      console.error(`Insert failed: ${error.message}`);
      process.exit(2);
    }
  }
  console.log(`inserted ${fresh.length} · review them at /admin/parts/groups`);
} catch (err) {
  console.error("Seed failed:", err instanceof Error ? err.message : err);
  process.exit(2);
}
