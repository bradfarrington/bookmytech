// What does AAG's /api/product/info return for known part numbers? (Task 40.)
//
//   node scripts/probe-aag-product-info.mjs --ids NPAPBD8077,APEDSK2647
//   node scripts/probe-aag-product-info.mjs --ids … --save     # write lib/aag/__fixtures__/product-info.json
//   node scripts/probe-aag-product-info.mjs --ids … --json     # dump the raw reply
//
// Read-only against AAG. Exit 0 = printed, 2 = config/upstream problem.
import { mkdirSync, writeFileSync } from "node:fs";
import { col, createAagRest } from "./lib/aag-rest.mjs";

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const flag = (name) => args.includes(name);

const ids = (arg("--ids") ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
if (ids.length === 0) {
  console.error("Usage: node scripts/probe-aag-product-info.mjs --ids <ProductId,ProductId,…> [--save] [--json]");
  process.exit(2);
}

const aag = createAagRest();
console.log(`AAG ${aag.env.baseUrl} · customer ${aag.env.customerId}`);

try {
  const result = await aag.productInfo(ids);
  console.log(`HTTP ${result.status} · SuccessFlag ${result.header?.SuccessFlag ?? "(no Header block)"}`);

  if (flag("--json")) {
    console.log(JSON.stringify(result.raw, null, 2));
  } else {
    const products = result.body?.Products ?? [];
    console.log(`\n${products.length} found\n`);
    console.log(`${col("product", 16)}${col("description", 28)}${col("brand", 16)}${col("rating", 9)}${col("£ cost", 9)}${col("min", 4)}${col("groups", 12)}`);
    for (const p of products) {
      console.log(
        `${col(p.ProductId, 16)}${col(p.ProductDescription, 28)}${col(p.Brand, 16)}${col(p.BrandRating, 9)}${col(p.CostPrice?.toFixed?.(2), 9)}${col(p.RecMinOrdQty, 4)}${col(JSON.stringify(p.CustomerProductGroup ?? []), 12)}`,
      );
    }
    const missing = result.body?.ProductsNotFound ?? [];
    if (missing.length) {
      console.log(`\n${missing.length} not found: ${missing.map((m) => `${m.ProductId} (${m.Message ?? m.message ?? "?"})`).join(", ")}`);
    }
  }

  if (flag("--save")) {
    mkdirSync("lib/aag/__fixtures__", { recursive: true });
    const path = "lib/aag/__fixtures__/product-info.json";
    writeFileSync(path, JSON.stringify(result.raw, null, 2) + "\n");
    console.log(`\nSaved ${path}`);
  }
} catch (err) {
  console.error("Probe failed:", err instanceof Error ? err.message : err);
  process.exit(2);
}
