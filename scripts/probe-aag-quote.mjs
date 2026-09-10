// Does AAG's sandbox answer us, and what does a quote look like? (Task 40.)
//
// Prices the parts in one TecDoc GenArt product group for one registration
// against the AAG Sales API v2 sandbox (or live, when AAG_BASE_URL says so)
// and prints articles → product options → branch availability. With --save
// the raw reply is written to lib/aag/__fixtures__/ so the parser's unit
// tests run against a real payload.
//
//   node scripts/probe-aag-quote.mjs --vrm FN60KYP --genart 82       # brake discs
//   node scripts/probe-aag-quote.mjs --vrm FN60KYP --genart 402      # brake pads
//   node scripts/probe-aag-quote.mjs --vrm … --genart 82 --classic   # /api/quote/classic instead
//   node scripts/probe-aag-quote.mjs --vrm … --genart 82 --save      # also write the fixture
//   node scripts/probe-aag-quote.mjs --vrm … --genart 82 --json      # dump the raw reply
//
// The first run is the access test. A clean quote proves the key, account and
// header name; HTTP 401/403 or a timeout is either a wrong auth header (try
// AAG_AUTH_HEADER=Authorization AAG_AUTH_SCHEME=ApiKey) or AAG's IP allowlist.
// Read-only against AAG — nothing here orders anything.
//
// Exit 0 = printed, 2 = config/upstream problem.
import { mkdirSync, writeFileSync } from "node:fs";
import { col, createAagRest } from "./lib/aag-rest.mjs";

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const flag = (name) => args.includes(name);

const vrm = arg("--vrm");
const genart = arg("--genart");
if (!vrm || !genart) {
  console.error("Usage: node scripts/probe-aag-quote.mjs --vrm <reg> --genart <TecDoc GenArt id> [--classic] [--save] [--json]");
  process.exit(2);
}

const aag = createAagRest();
console.log(`AAG ${aag.env.baseUrl} · customer ${aag.env.customerId} · auth header "${aag.env.authHeader}"${aag.env.verificationId ? " · verification_id set" : ""}`);

function printQuote(body) {
  const vehicle = body?.VehicleDetails?.[0];
  if (vehicle) {
    console.log(`\nVehicle: ${vehicle.Make ?? "?"} ${vehicle.Model ?? ""} · ${vehicle.EngineSize ?? "?"}cc ${vehicle.Fuel ?? ""} · ${vehicle.YearOfManufacture ?? "?"} · VIN ${vehicle.Vin ?? "?"}`);
  }
  const articles = body?.Articles ?? [];
  console.log(`\n${articles.length} article${articles.length === 1 ? "" : "s"}\n`);
  for (const article of articles) {
    console.log(`▸ ${article.ArticleDescription ?? "(no description)"} — ${article.ArticleProvider ?? "?"} · ${article.FittingPosition || "any"} · groups ${JSON.stringify(article.CustomerProductGroup ?? [])}`);
    console.log(`  ${col("line", 12)}${col("product", 16)}${col("brand", 16)}${col("rating", 9)}${col("£ cost", 9)}${col("min", 4)}${col("lockout", 15)}`);
    for (const option of article.ProductOptions ?? []) {
      console.log(
        `  ${col(option.RequestLineId, 12)}${col(option.ProductId, 16)}${col(option.Brand, 16)}${col(option.BrandRating, 9)}${col(option.CostPrice?.toFixed?.(2), 9)}${col(option.RecMinOrdQty, 4)}${col(option.CustomerLockoutRating, 15)}`,
      );
      for (const stock of option.Availability ?? []) {
        console.log(
          `      P${stock.Priority ?? "?"} ${col(stock.LocationName, 32)}${col(stock.LocationType, 8)}qty ${col(stock.QtyInStock, 5)}eta ${stock.EstDeliveryTime ?? "?"}  (location ${stock.AagLocationId})`,
        );
      }
    }
  }
}

function printClassic(body) {
  console.log(`\nQuoteId ${body?.QuoteId ?? "?"} · ${(body?.Products ?? []).length} products\n`);
  console.log(`${col("product", 16)}${col("description", 34)}${col("supplier", 12)}${col("rating", 9)}${col("£ cost", 9)}${col("fitment", 24)}`);
  for (const p of body?.Products ?? []) {
    console.log(
      `${col(p.ProductId, 16)}${col(p.Description, 34)}${col(p.Supplier?.SupplierName, 12)}${col(p.ProductRating, 9)}${col(p.CostPrice?.toFixed?.(2), 9)}${col(p.Fitment, 24)}`,
    );
    for (const stock of p.Stock ?? []) {
      console.log(`    ${col(stock.BranchName, 24)}qty ${col(stock.Count, 5)}${stock.DeliveryNotes ?? ""}  (location ${stock.AAGLocationId})`);
    }
  }
}

try {
  const classic = flag("--classic");
  const result = classic ? await aag.quoteClassic(vrm, [genart]) : await aag.quote(vrm, genart);
  console.log(`HTTP ${result.status} · SuccessFlag ${result.header?.SuccessFlag ?? "(no Header block)"}${result.header?.Message ? ` · ${result.header.Message}` : ""}`);

  if (flag("--json")) {
    console.log(JSON.stringify(result.raw, null, 2));
  } else if (classic) {
    printClassic(result.body);
  } else {
    printQuote(result.body);
  }

  if (flag("--save")) {
    mkdirSync("lib/aag/__fixtures__", { recursive: true });
    const path = `lib/aag/__fixtures__/quote${classic ? "-classic" : ""}-${genart}.json`;
    writeFileSync(path, JSON.stringify(result.raw, null, 2) + "\n");
    console.log(`\nSaved ${path}`);
  }
} catch (err) {
  console.error("Probe failed:", err instanceof Error ? err.message : err);
  process.exit(2);
}
