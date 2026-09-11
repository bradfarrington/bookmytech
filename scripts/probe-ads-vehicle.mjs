#!/usr/bin/env node
// Task 41 — ADS vehicle lookup probe. SPENDS ONE CREDIT PER RUN.
//
//   node scripts/probe-ads-vehicle.mjs --vrm NV57XGP
//   node scripts/probe-ads-vehicle.mjs --vin YV1MS204282384666
//   node scripts/probe-ads-vehicle.mjs --vrm NV57XGP --dump   # show request
//   node scripts/probe-ads-vehicle.mjs --vrm NV57XGP --save   # fixture + attrs
//
// --save also writes the returned attribute list to
// lib/lkq/__fixtures__/ads-attributes-<reg>.json, which is the exact input
// scripts/probe-ads-parts.mjs wants — so one vehicle lookup can feed many
// part lookups instead of paying for the vehicle call again.

import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { requireEnv, post, vehicleBody, regKey, col } from "./lib/ads-rest.mjs";

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
    ? process.argv[i + 1]
    : null;
}
const has = (name) => process.argv.includes(`--${name}`);

const vrm = arg("vrm");
const vin = arg("vin");
if (!vrm && !vin) {
  console.error("Give --vrm <registration> or --vin <vin>. Each run spends one ADS credit.");
  process.exit(2);
}

const env = requireEnv();
const name = vrm ? "VRM" : "VIN";
const value = vrm ? regKey(vrm) : vin.toUpperCase().trim();
const sessionGuid = randomUUID();

console.log(`ADS vehicle lookup by ${name}: ${value}  (one credit)\n`);

let result;
try {
  result = await post(env, env.vehicleUrl, vehicleBody(env, name, value, sessionGuid), { dump: has("dump") });
} catch (err) {
  console.error(err.message);
  console.error(
    "\nIf this is a token/field-name rejection, correct TOKEN_KEYS in scripts/lib/ads-rest.mjs\n" +
      "and re-run with --dump. Do not loop over guesses — each attempt costs a credit.",
  );
  process.exit(1);
}

const json = result.json;

if (has("save")) {
  mkdirSync("lib/lkq/__fixtures__", { recursive: true });
  const stem = `lib/lkq/__fixtures__/ads-vehicle-${value}`;
  writeFileSync(`${stem}.json`, `${JSON.stringify(json, null, 2)}\n`);
  console.log(`Saved reply -> ${stem}.json`);
}

// The docx does not pin the response envelope, so find the attribute list
// wherever it sits rather than assuming a key.
function findAttributes(node, depth = 0) {
  if (!node || typeof node !== "object" || depth > 6) return null;
  if (Array.isArray(node)) {
    if (node.length && node.every((e) => e && typeof e === "object" && "Name" in e && "Value" in e)) return node;
    for (const e of node) {
      const hit = findAttributes(e, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  for (const key of Object.keys(node)) {
    const hit = findAttributes(node[key], depth + 1);
    if (hit) return hit;
  }
  return null;
}

const attributes = findAttributes(json);

if (!attributes) {
  console.log("No {Name, Value} attribute list found. Full reply:\n");
  console.log(JSON.stringify(json, null, 2).slice(0, 4000));
  process.exit(0);
}

console.log(`\n${attributes.length} vehicle attributes returned:\n`);
console.log(col("NAME", 34) + "VALUE");
console.log("-".repeat(80));
for (const a of attributes) console.log(col(a.Name, 34) + (a.Value ?? ""));
console.log("-".repeat(80));

if (has("save")) {
  const file = `lib/lkq/__fixtures__/ads-attributes-${value}.json`;
  writeFileSync(file, `${JSON.stringify(attributes, null, 2)}\n`);
  console.log(`\nSaved attributes -> ${file}`);
  console.log(`Feed them to the parts probe:\n  node scripts/probe-ads-parts.mjs --attributes ${file} --group 104`);
}
