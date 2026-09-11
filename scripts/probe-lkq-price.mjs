#!/usr/bin/env node
// Task 41 — LKQ ECP PutSession + GetPrice probe. READ-ONLY: nothing is ordered.
//
//   node scripts/probe-lkq-price.mjs --part 101690288
//   node scripts/probe-lkq-price.mjs --part 101690288,333330020
//   node scripts/probe-lkq-price.mjs --manuf "0 986 012 350"
//   node scripts/probe-lkq-price.mjs --type TECHDOC --code 12345
//   node scripts/probe-lkq-price.mjs --part 101690288 --json      # full reply
//   node scripts/probe-lkq-price.mjs --part 101690288 --save      # fixture
//
// --part is an ECP part number (8-digit as returned by ADS, or full 9-digit).
// --manuf is shorthand for --type MANUF --code <value>.
// Session and price calls are unmetered, unlike the ADS catalogue credits.

import { mkdirSync, writeFileSync } from "node:fs";
import {
  requireEnv, putSession, getPrice, asArray, col, flattenPart, isNotFound, LKQ_QUALITY,
} from "./lib/lkq-soap.mjs";

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
    ? process.argv[i + 1]
    : null;
}
const has = (name) => process.argv.includes(`--${name}`);

const partArg = arg("part");
const manufArg = arg("manuf");
const typeArg = arg("type");
const codeArg = arg("code");

const parts = [];
if (partArg) for (const p of partArg.split(",")) parts.push({ supplierPartNo: p.trim() });
if (manufArg) parts.push({ type: "MANUF", code: manufArg });
if (typeArg && codeArg) parts.push({ type: typeArg.toUpperCase(), code: codeArg });

if (parts.length === 0) {
  console.error(
    "Nothing to price. Give --part <ecp number[,number]>, --manuf <manufacturer code>,\n" +
      "or --type <MANUF|OEM|TECHDOC> --code <value>.",
  );
  process.exit(2);
}

const env = requireEnv();
console.log(`Account ${env.account} via PCID ${env.pcId}${env.branch ? ` (branch ${env.branch})` : " (home branch)"}`);

let session;
try {
  session = await putSession(env);
  console.log(`Session OK — token valid 20 minutes, branch "${session.branch || "(default)"}".\n`);
} catch (err) {
  console.error(`PutSession failed: ${err.message}`);
  console.error("\nIf scripts/probe-lkq-hello.mjs succeeds, this is credentials or account, not network.");
  process.exit(1);
}

let result;
try {
  result = await getPrice(env, session.token, parts);
} catch (err) {
  console.error(`GetPrice failed: ${err.message}`);
  process.exit(1);
}

const reply = result.reply;

if (has("json")) {
  console.log(JSON.stringify(reply, null, 2));
}

if (has("save")) {
  mkdirSync("lib/lkq/__fixtures__", { recursive: true });
  const name = `lib/lkq/__fixtures__/getprice-${parts[0].supplierPartNo || parts[0].code}.json`
    .replace(/\s+/g, "");
  writeFileSync(name, `${JSON.stringify(reply, null, 2)}\n`);
  console.log(`Saved fixture -> ${name}\n`);
}

const rows = asArray(reply?.Parts?.Part).map(flattenPart);
if (rows.length === 0) {
  console.log("No parts in the reply. Status was:", reply?.Modes?.Status ?? reply?.Status);
  process.exit(0);
}

const customer = reply?.Customer ?? {};
console.log(
  `${customer.Name ?? ""} — currency ${customer.Currency ?? "?"} (UKL = GBP), ` +
  `branch ${reply?.Modes?.Branch ?? "?"}\n`,
);

const money = (v) => (v == null ? "-" : `£${v.toFixed(2)}`);
const qty = (v) => (v == null ? "-" : String(v));

console.log(
  col("ECP PART", 12) + col("DESCRIPTION", 34) + col("BRAND", 12) +
  col("QUAL", 6) + col("YOURS", 9) + col("SURCH", 9) + col("RRP", 9) +
  "STOCK br/buddy/rdc/ndc/co",
);
console.log("-".repeat(125));
for (const p of rows) {
  const stock = [p.branchFree, p.buddyFree, p.rdcFree, p.ndcFree, p.companyFree].map(qty).join("/");
  console.log(
    col(p.supplierPartNo, 12) +
    col(isNotFound(p) ? "*** NOT FOUND ***" : p.fullDesc, 34) +
    col(p.brand, 12) +
    col(p.quality, 6) +
    col(money(p.showPrice), 9) +
    col(money(p.custSur), 9) +
    col(money(p.retailPrice), 9) +
    stock,
  );
}
console.log("-".repeat(125));

const missing = rows.filter(isNotFound);
if (missing.length) {
  console.log(
    `\n!! ${missing.length} part(s) NOT FOUND: ${missing.map((p) => p.supplierPartNo).join(", ")}\n` +
      "   LKQ returns Status 0 and a £0.00 row for unknown part numbers — never the\n" +
      "   documented code 107. Anything that prices a job must check isNotFound().",
  );
}

console.log(
  "\nYOURS = ShowPrice (this account's price). RRP = RetailPrice (manufacturer).\n" +
    "A blank stock figure means no number was given, NOT zero.",
);

const surcharged = rows.filter((p) => p.custSur != null);
if (surcharged.length) {
  console.log(
    "Pricing doc §8.2 says ShowPrice INCLUDES the surcharge when CustSur is present —\n" +
      "unconfirmed against the service; check before this figure reaches a customer quote.",
  );
}

const qualities = [...new Set(rows.map((p) => p.quality).filter(Boolean))];
if (qualities.length) {
  console.log(`\nQuality codes seen: ${qualities.map((q) => `${q} = ${LKQ_QUALITY[q] ?? "?"}`).join(", ")}`);
}
