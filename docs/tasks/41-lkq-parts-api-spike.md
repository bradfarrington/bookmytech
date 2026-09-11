# Task 41 — LKQ Euro Car Parts: catalogue + trade pricing spike (CLI probes)

**Status:** ✅ Complete (2026-09-11) — the full chain **registration → ADS catalogue → ECP trade price** is verified working against LKQ's test service on Gareth's real account `L4040300`. Scripts only: no `lib/`, no app code, no migration, no `app/api/mobile/**` change. Findings in `docs/06-lkq-parts-api.md`. Deviations from the original sketch: none, except that the "chase LKQ for the component list" step proved unnecessary — the list was fetchable from their own API (§5).

Gareth has an LKQ Euro Car Parts trade account and LKQ issued test credentials for two separate APIs. This task proves access, captures the real response shapes, and records where the supplied documentation is wrong — **before** anyone commits to a quoting or ordering build. AAG (Task 40) stays parked.

## Owner decisions consumed (2026-09-11)

1. **Do not chase LKQ** for the missing Postman collection or the component list (Brad). Both were worked around: the `UserToken` shape was inferred correctly first time, and the component list was fetched from the API's own `Components` endpoint.
2. **Credentials supplied by Brad into `.env.local`**; the source documents stay untracked.
3. **Read-only.** `CreateSalesOrder` deliberately not implemented.

## What shipped

### Probe library
- `scripts/lib/lkq-soap.mjs` — dotenv + `requireEnv` (exit 2 naming missing vars), SOAP 1.1 envelope builder handling the **escaped-string `value`** facade, a dependency-free `parseXml`, `putSession`, `getPrice`, `flattenPart` (real nesting), **`isNotFound`**, error/quality code tables, and the undocumented `helloFromLkq`.
- `scripts/lib/ads-rest.mjs` — `requireEnv`, `buildUserToken`, `ApiKey`-header assembly, `redact()` so payloads can be printed safely, single-POST `post()` that never retries (credits are metered).

### Probes
- `scripts/probe-lkq-hello.mjs` — reachability, **no credentials needed**.
- `scripts/probe-lkq-price.mjs` — `--part` / `--manuf` / `--type`+`--code`, `--json`, `--save`; prints the brand/quality price ladder with five-level stock and flags not-found rows.
- `scripts/probe-ads-vehicle.mjs` — `--vrm` / `--vin`, `--dump`, `--save`; saves the attribute list for reuse so a part lookup need not re-buy a vehicle lookup.
- `scripts/probe-ads-parts.mjs` — `--attributes` + `--group` + `--increment`, `--dump`, `--save`.

### Fixtures
`lib/lkq/__fixtures__/` — `ads-components-GB-en.json` (**2,277 components**), `ads-vehicle-NV57XGP.json`, `ads-attributes-NV57XGP.json`, `ads-parts-000027-1.json`.

### Docs
`docs/06-lkq-parts-api.md` (this integration, in the `04-supplier-apis.md` shape), this file, `docs/HANDOFF.md`.

## What was verified live

- **Both hosts reachable with no IP allowlist** — the blocker AAG is still stuck behind.
- `HelloFromLkq` → service version 1.0.1.1; `PutSession` → 20-minute token; `GetPrice` → real prices on account `L4040300`.
- One 8-digit ADS part expands to **8 branded ECP variants** — a genuine £31.67 Textar → £66.90 Brembo XTR ladder with live stock.
- ADS VRM lookup → **56 attributes**; part lookup by component `000027` → **16 brake discs** with `QuantityOfFit`, images and fitment data.
- `MANUF` lookup resolves a Bosch code to an ECP part with a £59.95 surcharge.

## Documentation errors found (all in `docs/06-lkq-parts-api.md` §2)

1. Wrong SOAP body namespace (`ApiPriceService`, not `PriceService`).
2. `<value>` is an **escaped string**, not nested XML.
3. Response nesting (`Modes` / `Customer` / `Price` / `Stock` / `QualityDetails`) absent from the documented table; `Retail`→`RetailPrice`, `Net1`→`Net1Price`.
4. **"104 = Brake Discs" is wrong** — `000104` is Distributor Cap; Brake Disc is `000027`.
5. **An unknown part is not an error** — `Status 0` and a **£0.00 row**, never code 107.

## Acceptance criteria

- [x] Probes exit 2 with a named-variable message when env is missing.
- [x] ECP session + price proven against a real account, output recorded in `docs/06-lkq-parts-api.md` §3.
- [x] ADS vehicle + part lookup proven, output recorded in §4.
- [x] The end-to-end reg → catalogue → trade price chain demonstrated (§6).
- [x] Fixtures captured, including the full component list.
- [x] Every documentation contradiction recorded with the verified behaviour (§2).
- [x] The £0.00 not-found trap has a named guard (`isNotFound`) and is called out wherever pricing is discussed.
- [x] eslint clean on all six new files; no existing file touched except `.gitignore`, `.env.local` and the docs.
- [x] No migration; no `app/api/mobile/**` change; nothing orders.
- [ ] `ShowPrice` vs surcharge confirmed — **deferred to the build task**, see §8 Q1. It affects money and must be settled before a surcharged figure reaches a customer.
- [ ] GenArt → ADS component mapping route decided — **deferred**, see §8 Q2.

## Mobile app impact

**None.** Scripts and docs only: no schema change, no change to any response shape under `app/api/mobile/**`, no change to booking status values, displayed pricing, or auth. A phone running last month's build is unaffected.

**This stops being true the moment supplier part costs feed a customer-facing quote** — that is a pricing change under the AGENTS.md rules and must be flagged when the build task lands.

## How to verify

```bash
node scripts/probe-lkq-hello.mjs
node scripts/probe-lkq-price.mjs --part 10459026,000000000    # ladder + the not-found trap
node scripts/probe-ads-vehicle.mjs --vrm NV57XGP --save       # 1 credit
node scripts/probe-ads-parts.mjs --attributes lib/lkq/__fixtures__/ads-attributes-NV57XGP.json --group 000027
```

## Next task, if LKQ is chosen over AAG

1. Settle the surcharge question (§8 Q1) — money.
2. Try `TecDocReferences` / `ComponentsByVehicleAttributes` for GenArt → component (§8 Q2).
3. `lib/lkq/` app client in the `lib/aag/` shape — never throws, unconfigured → null, health in `platform_settings`, token cached with a margin inside the 20-minute window.
4. `/admin/parts/lkq-check` alongside the AAG page.
5. Only then: ordering, with the carrier delivery block.
