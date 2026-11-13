// Builds lib/haynespro/search-vocabulary.json — for every HaynesPro repair
// group, the words used anywhere beneath it. The repair search
// (lib/haynespro/catalogue.ts runSearch) uses it to know which groups to open.
//
// Why it exists: HaynesPro has no keyword search, so the search walks the tree
// within a budget of upstream calls. Without this file the walk could only
// guess from a group's own NAME, and the names rarely carry the customer's
// word: "Renew the front brake pads" sits under "Brake pad" under
// "Brakes (Mechanical)", so "pads" earned the brakes branch no priority and the
// budget ran out on other groups. Group ids are one fixed taxonomy across every
// vehicle (1M01500000G is "Brake pad" on a BMW diesel and a Golf petrol alike,
// checked 2026-11-13), so a vocabulary taken from a few reference cars steers
// the walk for all of them.
//
//   node scripts/build-search-vocabulary.mjs                 # crawl + write
//   node scripts/build-search-vocabulary.mjs --cache <dir>   # reuse/save raw crawls
//
// Each reference car costs one upstream call per group (~390). Probe sessions
// use the bmtprobe prefix, never the app's (see scripts/lib/haynespro-rest.mjs).
// Re-run when HaynesPro's tree changes noticeably or to add a reference car.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHaynesProRest, norm } from "./lib/haynespro-rest.mjs";

/** A diesel, a petrol, a modern diesel 4x4 (AdBlue, transfer box) and a hybrid. */
const REFERENCE_CARS = [
  { key: "bmw-3-f30-316d", make: "BMW", model: "3 (F30", type: /316 ?d/i },
  { key: "vw-golf-vii-14tsi", make: "VOLKSWAGEN", model: "Golf VII", type: /1\.4 TSI/i },
  { key: "ford-ranger-2022", make: "FORD", modelId: 319018285, type: /2\.0/i },
  { key: "toyota-yaris-p21-hybrid", make: "TOYOTA", modelId: 319007168, type: /hybrid/i },
];

/**
 * Words never worth steering by: articles, joins, and the verbs on nearly
 * every job. Must agree with SEARCH_STOP_WORDS in lib/haynespro/search-terms.ts
 * only in spirit; the search ignores these words in queries anyway.
 */
const SKIP = new Set([
  "the", "and", "or", "of", "to", "for", "with", "on", "in", "at", "by", "from", "an",
  "using", "removed", "remove", "refit", "renew", "check", "repair", "difficult",
  "additional", "work", "all", "both", "one", "two", "is", "be", "if", "as",
]);

const args = process.argv.slice(2);
const cacheDir = (() => {
  const i = args.indexOf("--cache");
  return i >= 0 ? args[i + 1] : null;
})();
const OUT = new URL("../lib/haynespro/search-vocabulary.json", import.meta.url);

const hp = createHaynesProRest();
let calls = 0;

async function resolveCar(car) {
  const makes = await hp.getMakes();
  const make = makes.find((m) => norm(m.name) === norm(car.make));
  if (!make) throw new Error(`Make ${car.make} not found`);
  const models = await hp.getMakeModels(make.id);
  const model = car.modelId
    ? models.find((m) => m.id === car.modelId)
    : models.find((m) => norm(m.name).startsWith(norm(car.model)));
  if (!model) throw new Error(`Model ${car.modelId ?? car.model} not found under ${car.make}`);
  const { types } = await hp.getModelTypes(model.id);
  const type = types.find((t) => car.type.test(t.name ?? "")) ?? types[0];
  if (!type) throw new Error(`No engine variants under ${car.make} ${model.name}`);
  const repairtimeTypeId = await hp.getRepairtimeTypeId(type.id);
  if (repairtimeTypeId == null) throw new Error(`${model.name} ${type.name} has no repair times`);
  return { carTypeId: type.id, repairtimeTypeId, label: `${car.make} ${model.name} ${type.name}` };
}

/** Every node of the tree, each with the ids of the groups above it. */
async function crawl(vehicle) {
  const nodes = [];
  const queue = [{ id: "root", path: [] }];
  while (queue.length) {
    const batch = queue.splice(0, 6);
    const levels = await Promise.all(batch.map((b) => hp.getSubnodes(vehicle, b.id)));
    calls += batch.length;
    levels.forEach((kids, i) => {
      for (const k of kids) {
        if (k.id == null) continue;
        nodes.push({ id: k.id, d: k.description ?? "", g: Boolean(k.hasSubnodes), path: batch[i].path });
        if (k.hasSubnodes) queue.push({ id: k.id, path: [...batch[i].path, k.id] });
      }
    });
  }
  return nodes;
}

function words(text) {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2 && !/\d/.test(w) && !SKIP.has(w));
}

const vocab = new Map(); // group id -> Set<word>
const labels = [];

for (const car of REFERENCE_CARS) {
  const cached = cacheDir ? join(cacheDir, `${car.key}.json`) : null;
  let record;
  if (cached && existsSync(cached)) {
    record = JSON.parse(readFileSync(cached, "utf8"));
    console.log(`${car.key}: ${record.nodes.length} nodes (cached)`);
  } else {
    const vehicle = await resolveCar(car);
    const nodes = await crawl(vehicle);
    record = { label: vehicle.label, nodes };
    console.log(`${car.key}: ${vehicle.label} — ${nodes.length} nodes, ${calls} calls so far`);
    if (cached) {
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(cached, JSON.stringify(record));
    }
  }
  labels.push(record.label);

  for (const node of record.nodes) {
    // A node's words belong to every group above it — and a group's own name
    // to itself.
    const owners = node.g ? [...node.path, node.id] : node.path;
    for (const owner of owners) {
      let set = vocab.get(owner);
      if (!set) vocab.set(owner, (set = new Set()));
      for (const w of words(node.d)) set.add(w);
    }
  }
}

const groups = Object.fromEntries(
  [...vocab.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, set]) => [id, [...set].sort().join(" ")]),
);

writeFileSync(
  OUT,
  `${JSON.stringify({ generated: new Date().toISOString().slice(0, 10), vehicles: labels, groups }, null, 0)}\n`,
);
console.log(`Wrote ${Object.keys(groups).length} groups to ${OUT.pathname} (${calls} upstream calls)`);
