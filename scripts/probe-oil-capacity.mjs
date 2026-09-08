// What does HaynesPro's getLubricantCapacitiesV4 actually return? (Task 31.)
//
// Gareth wants engine oil priced at £/litre × the manufacturer's capacity,
// "pulled from adjustments and specifications". lib/haynespro/oil-capacity.ts
// parses the capacities tree for the engine-oil figure; this script prints
// that tree for a car type (and, with --save, writes the raw JSON to
// lib/haynespro/__fixtures__/capacities-<type>.json so the parser's unit
// tests run against real payloads).
//
//   node scripts/probe-oil-capacity.mjs                       # VW Golf VII 1.0 TSI
//   node scripts/probe-oil-capacity.mjs --type 317000222      # a specific car type
//   node scripts/probe-oil-capacity.mjs --type … --save       # also write the fixture
//   node scripts/probe-oil-capacity.mjs --adjustments         # print getAdjustmentsV7 too
//
// Shares the app's VRID (scripts/lib/haynespro-rest.mjs), so it never
// invalidates the production session. Read-only against HaynesPro.
//
// Exit 0 = printed, 2 = config/upstream problem.
import { mkdirSync, writeFileSync } from "node:fs";
import { createHaynesProRest } from "./lib/haynespro-rest.mjs";

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const flag = (name) => args.includes(name);

const carTypeId = Number(arg("--type") ?? 317000222);
const hp = createHaynesProRest();

function printTree(rows, depth = 0) {
  for (const row of rows ?? []) {
    const bits = [row.name ?? "(unnamed)"];
    if (row.value != null && row.value !== "") bits.push(`= ${row.value}${row.unit ? ` ${row.unit}` : ""}`);
    if (row.remark) bits.push(`[${row.remark}]`);
    console.log(`${"  ".repeat(depth)}${bits.join(" ")}`);
    if (Array.isArray(row.subAdjustments) && row.subAdjustments.length) {
      printTree(row.subAdjustments, depth + 1);
    }
  }
}

try {
  const node = await hp.getCarTypeNode(carTypeId);
  console.log(`Car type ${carTypeId}: ${node?.fullName ?? node?.name ?? "(unknown)"} · fuel ${JSON.stringify(node?.fuelType ?? null)}`);

  const capacities = await hp.call("getLubricantCapacitiesV4", {
    descriptionLanguage: "en",
    carType: carTypeId,
  });
  const rows = Array.isArray(capacities) ? capacities : capacities ? [capacities] : [];
  console.log(`\ngetLubricantCapacitiesV4 → ${Array.isArray(capacities) ? "array" : typeof capacities} (${rows.length} top-level row${rows.length === 1 ? "" : "s"})\n`);
  printTree(rows);

  if (flag("--adjustments")) {
    const adjustments = await hp.call("getAdjustmentsV7", { descriptionLanguage: "en", carType: carTypeId });
    console.log(`\ngetAdjustmentsV7 → ${(adjustments ?? []).length} top-level rows\n`);
    printTree(adjustments ?? []);
  }

  if (flag("--save")) {
    mkdirSync("lib/haynespro/__fixtures__", { recursive: true });
    const path = `lib/haynespro/__fixtures__/capacities-${carTypeId}.json`;
    writeFileSync(path, JSON.stringify(capacities, null, 2) + "\n");
    console.log(`\nSaved ${path}`);
  }
} catch (err) {
  console.error("Probe failed:", err instanceof Error ? err.message : err);
  process.exit(2);
}
