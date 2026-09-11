#!/usr/bin/env node
// Task 41 — ADS part lookup probe. SPENDS ONE CREDIT PER RUN.
//
//   node scripts/probe-ads-parts.mjs --attributes lib/lkq/__fixtures__/ads-attributes-NV57XGP.json --group 104
//   ... --group 104 --increment 2       # next page/refinement
//   ... --group 104 --dump --save
//
// --group is an ADS COMPONENT GROUP, not a TecDoc GenArt. The docx gives one
// worked example: 104 = brake discs (TecDoc's GenArt for brake discs is 82, so
// the two numberings are NOT interchangeable). The full component list has not
// been supplied, so groups other than 104 are guesswork until it is — which is
// the single biggest open question on this integration.
//
// Attributes come from scripts/probe-ads-vehicle.mjs --save so a part lookup
// does not pay for a vehicle lookup as well.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { requireEnv, post, partsBody, col } from "./lib/ads-rest.mjs";

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
    ? process.argv[i + 1]
    : null;
}
const has = (name) => process.argv.includes(`--${name}`);

const attributesPath = arg("attributes");
const group = arg("group");
const increment = arg("increment") || "1";

if (!attributesPath || !group) {
  console.error(
    "Usage: --attributes <file from probe-ads-vehicle.mjs --save> --group <component group> [--increment N]\n" +
      "Only component group 104 (brake discs) is confirmed by the documentation.",
  );
  process.exit(2);
}
if (!/^\d+$/.test(group)) {
  console.error(`Component group must be numeric, got "${group}".`);
  process.exit(2);
}

let attributes;
try {
  attributes = JSON.parse(readFileSync(attributesPath, "utf8"));
} catch (err) {
  console.error(`Could not read ${attributesPath}: ${err.message}`);
  process.exit(2);
}
if (!Array.isArray(attributes) || attributes.length === 0) {
  console.error(`${attributesPath} is not a non-empty array of {Name, Value}.`);
  process.exit(2);
}

const env = requireEnv();
const url = `${env.partsUrl}/${group}/${increment}`;
const body = partsBody(env, attributes, randomUUID(), randomUUID());

console.log(`ADS part lookup: component group ${group}, increment ${increment}`);
console.log(`${attributes.length} vehicle attributes from ${attributesPath}  (one credit)\n`);

let result;
try {
  result = await post(env, url, body, { dump: has("dump") });
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const json = result.json;

if (has("save")) {
  mkdirSync("lib/lkq/__fixtures__", { recursive: true });
  const file = `lib/lkq/__fixtures__/ads-parts-${group}-${increment}.json`;
  writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
  console.log(`Saved reply -> ${file}\n`);
}

// Response shape is not pinned by the docx either; locate the part list by
// looking for objects that carry something part-number-shaped.
function findParts(node, depth = 0) {
  if (!node || typeof node !== "object" || depth > 6) return null;
  if (Array.isArray(node)) {
    if (node.length && node.some((e) => e && typeof e === "object" &&
      Object.keys(e).some((k) => /partnumber|partno|productcode|sku/i.test(k)))) return node;
    for (const e of node) {
      const hit = findParts(e, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  for (const key of Object.keys(node)) {
    const hit = findParts(node[key], depth + 1);
    if (hit) return hit;
  }
  return null;
}

const parts = findParts(json);
if (!parts) {
  console.log("No part-shaped list found. Full reply:\n");
  console.log(JSON.stringify(json, null, 2).slice(0, 4000));
  process.exit(0);
}

const pick = (obj, re) => {
  const key = Object.keys(obj).find((k) => re.test(k));
  return key ? obj[key] : "";
};

console.log(`${parts.length} parts returned:\n`);
console.log(col("PART NUMBER", 16) + col("BRAND", 16) + "DESCRIPTION");
console.log("-".repeat(90));
for (const p of parts.slice(0, 40)) {
  console.log(
    col(pick(p, /partnumber|partno|productcode|sku/i), 16) +
    col(pick(p, /brand|manufacturer|supplier/i), 16) +
    pick(p, /description|desc|name/i),
  );
}
console.log("-".repeat(90));
if (parts.length > 40) console.log(`(showing 40 of ${parts.length})`);
console.log(
  "\nThese part numbers are the input to the ECP pricing call:\n" +
    "  node scripts/probe-lkq-price.mjs --part <number>",
);
