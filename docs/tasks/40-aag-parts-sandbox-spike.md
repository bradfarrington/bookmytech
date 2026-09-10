# Task 40 — AAG Sales API v2 sandbox spike: read-only parts pricing by registration, GenArt coverage, admin check page

**Status:** ✅ Code-complete (2026-09-10) — Stages A–E built, unit-tested, typecheck/lint clean, production build compiles. **Owner action required before any of it does anything: put `AAG_API_KEY` + `AAG_CUSTOMER_ID` (+ `AAG_VERIFICATION_ID` if issued) in `.env.local` and Vercel, then run the probes in "How to verify"** — the credentials were not in the environment when this was built, so **nothing has been verified against AAG's sandbox** and `docs/05-aag-parts-api.md` §3/§4 are still waiting for results. Deviations from spec: none. The manual is checked in at `docs/suppliers/aag-sales-api-v2-customer-integration-v1.07.pdf` (the root-level copy is untracked; delete it once happy). **No migration. No mobile API change.**

> **First sandbox run (2026-09-10, credentials now in `.env.local`).** The UAT host is **Cloudflare-IP-allowlisted**: every request, even `GET /`, gets a 403 block page, under all three auth-header variants — so this is exactly the IP AAG's security team asked for, and the one to give them is the **development machine's IP** (`curl -s https://api.ipify.org`). The **live** host is reachable and answered a genuine AAG envelope — `HTTP 200` + `ISE0034 "User is unauthorized"` under every header variant and without `verification_id` — which (a) proves the inverted-status behaviour and the parser against a real reply, and (b) says the credentials are most likely sandbox-only. No quote and no fixture yet; blocked on AAG allowlisting the dev IP. Details and the sharpened questions for AAG in `docs/05-aag-parts-api.md` §1, §3, §5.

Gareth has a trade account with Alliance Automotive Group and AAG have issued Sales API v2 credentials. This task proves access to their sandbox, captures real response shapes, measures how much of our repair catalogue a parts supplier could price without a mapping table, and gives Gareth a page to see real prices on — **before** anyone commits to the full quote → enquiry → order build. Assessment, verified calls, open questions and the proposed full build live in `docs/05-aag-parts-api.md`.

## Owner decisions consumed (2026-09-10)

1. **Sandbox spike, not the full build** (Brad, chosen from three options). Read-only client + coverage check + admin page. Enquiry, ordering, funnel pricing and any write to `job_quote_lines` / `booking_parts` / `parts` are out of scope.
2. **The IP question is answered outside the code.** AAG's "website IP" is the server's outbound IP; Vercel has none fixed. Brad replies to AAG asking to allowlist by API key + account; a static-IP proxy is the follow-up only if they insist. Detail in `docs/05-aag-parts-api.md` §1.
3. **Sandbox by default.** `AAG_BASE_URL` unset = UAT; live must be set explicitly per environment.

## What the manual establishes (Data Contract Customer.pdf v1.07)

- Auth is three headers: an API key (**header name not stated** — configurable via `AAG_AUTH_HEADER` / `AAG_AUTH_SCHEME`, default `x-api-key`), `customer_id` (the account number), optional `verification_id`.
- **HTTP 201 = success, 200 = error.** The client reads `Header.SuccessFlag` / `ErrorCode` from the body and never trusts the status.
- `/api/servicetimeandparts` (a whole service as tasks + parts) is **no longer supported**, so repairs must be mapped to TecDoc GenArt ids by us — hence Stage C.
- Prices are decimal pounds; converted to integer pence at the edge.

## Stage A — CLI probes ✅ built

- `scripts/lib/aag-rest.mjs` — dotenv + `requireEnv` (exit 2 with a message naming the vars), header assembly identical to the app client, `post()` that throws on non-2xx or `SuccessFlag !== true`, `quote` / `quoteClassic` / `productInfo` conveniences.
- `scripts/probe-aag-quote.mjs --vrm <reg> --genart 82 [--classic] [--save] [--json]` — prints articles → product options → branch availability; `--save` writes `lib/aag/__fixtures__/quote[-classic]-<genart>.json`.
- `scripts/probe-aag-product-info.mjs --ids A,B [--save] [--json]` → `lib/aag/__fixtures__/product-info.json`.
- Both verified to exit 2 with a clear message when the env is missing.

## Stage B — app client (`lib/aag/`) ✅ built

- `types.ts` — request/response types transcribed from the manual, everything optional; `AAG_EXAMPLE_GENARTS` (the ids the manual uses) for the admin picker.
- `client.ts` — `getAagConfig()` / `isAagConfigured()` / `isAagSandbox()`; pure, tested `buildAagHeaders`, `parseAagEnvelope`, `isAagAuthFailure` (`ISE0034`, `ISE0101`), `describeAagError`, `aagRegKey`; `aagCall<T>()` (POST, 12 s timeout, `cache: "no-store"`, never throws, logs + returns null, records health); read-only wrappers `aagQuote`, `aagQuoteClassic`, `aagProductInfo`. Service-role client imported dynamically so pure helpers stay testable — same pattern as `lib/haynespro/client.ts`.
- `health.ts` — `platform_settings.aag_health` (`ok` / `auth_failed` / `unreachable`, error code, host); `recordAagHealth` / `readAagHealth`, both swallow failures. An `ok` row is written at most every 5 minutes; failures always.
- `quote.ts` — `poundsToPence`, `isSellable`, `flattenQuote` (nested reply → flat rows with pence prices, min order qty, total stock and AAG's priority-1 location), `cheapestLine`.
- `aag.test.ts` — 15 tests on the manual's example payload (envelope truth, inverted status, missing-Header classic shape, headers, reg key, pence rounding, flattening, quickest-location choice); a fixture-gated suite that runs automatically once `lib/aag/__fixtures__/quote-82.json` exists.

## Stage C — GenArt coverage ✅ built (not yet run)

- `lib/haynespro/genarts.ts` — `genartIdsOf` / `genartExtra`: distinct positive `genarts[].id` off a HaynesPro node, undefined when none.
- `CatalogueNode.genartIds?: number[]` — **additive and optional**; set on `repair` nodes only, in both composition paths (`toCatalogueNode` in `lib/haynespro/catalogue.ts` and `composeLevel` in `lib/catalogue/overlay.ts`). 4 tests in `lib/haynespro/genarts.test.ts`.
- `scripts/probe-genart-coverage.mjs (--vrm <reg> | --type <carTypeId>) [--max N] [--quote] [--json]` — walks the repair tree (capped, metered), reports repairs with ≥1 GenArt, the distinct ids with sample repairs, and the uncovered ones; `--quote` asks AAG for each GenArt seen. `--vrm` reads `haynespro_vehicle_cache`, so the reg must have been looked up in the app first.

## Stage D — admin check page ✅ built

- `/admin/parts/aag-check` — `<AagStatus>` banner (not configured / refusing / unreachable / connected, naming sandbox vs live), then reg + product-group form (the manual's GenArts in the custom `Select`, or a free-text id) → a table of article, product id (cheapest and locked-out badges), brand + rating, cost (+ core charge), min qty, and every location with the priority-1 one bolded. AAG's own vehicle identification is shown when returned.
- `app/actions/aag.ts` `checkAagQuoteAction` — explicit admin-role gate (the credentials are platform secrets), `normaliseReg`, numeric GenArt check, `aagQuote` → `flattenQuote`. Read-only; nothing written.
- "Check AAG prices" button on `/admin/parts`.

## Stage E — docs ✅ built

- `docs/05-aag-parts-api.md` — assessment in the `04-supplier-apis.md` shape; §3 (verified calls) and §4 (coverage table) are placeholders until the probes run.
- `docs/DEPLOYMENT_ENV.md` — "Parts pricing (AAG Sales API v2)" table.
- This file; `docs/HANDOFF.md` current-task entry.

## Acceptance criteria

- [x] `node scripts/probe-aag-quote.mjs` without env exits 2 naming the missing vars; with env it prints a quote or a precise reason (HTTP status vs AAG error code). *(Exercised live: reported the Cloudflare 403 on UAT and the `ISE0034` envelope on live distinctly and correctly.)*
- [ ] Sandbox access **proven**: a 2xx + `SuccessFlag: true` quote for a real reg, with the working auth header recorded in `docs/05-aag-parts-api.md` §3. — **Blocked on AAG allowlisting the development IP on UAT (Cloudflare 403 confirmed 2026-09-10).**
- [ ] Fixtures captured (`--save`) and the fixture-gated tests in `lib/aag/aag.test.ts` green against them. — **Owner, same run.**
- [x] `lib/aag/` client never throws; unconfigured → null; auth failures and unreachability recorded in `platform_settings.aag_health`.
- [x] `CatalogueNode.genartIds` carried through both composition paths, additive, tested; existing catalogue/overlay tests unchanged and green.
- [ ] Coverage numbers for at least one vehicle pasted into `docs/05-aag-parts-api.md` §4. — **Owner: `node scripts/probe-genart-coverage.mjs --vrm <reg> --quote`.**
- [x] `/admin/parts/aag-check` renders the "not configured" banner with no error when the env is missing, and a priced table when AAG answers. *(Table path exercised only against the manual's example shape via unit tests.)*
- [x] `npm test` green (373 tests on `main` after rebasing onto Task 39, 19 new; 1 fixture-gated test skipped until a sandbox reply is captured), `tsc --noEmit` clean, eslint clean on the changed files.
- [x] No migration; no `app/api/mobile/**` change; nothing orders.

## Env (`.env.local`, never committed)

`AAG_API_KEY`, `AAG_CUSTOMER_ID`, `AAG_VERIFICATION_ID` (optional), `AAG_BASE_URL` (optional, default UAT), `AAG_AUTH_HEADER` (optional, default `x-api-key`), `AAG_AUTH_SCHEME` (optional). Missing = feature silently off. Table in `docs/DEPLOYMENT_ENV.md`.

## How to verify

```
# 1. credentials in .env.local, then the access test
node scripts/probe-aag-quote.mjs --vrm <real reg> --genart 82
#    401/403 → AAG_AUTH_HEADER=Authorization AAG_AUTH_SCHEME=ApiKey node scripts/probe-aag-quote.mjs …
#    still refused → the IP allowlist; back to AAG

# 2. fixtures + tests
node scripts/probe-aag-quote.mjs --vrm <reg> --genart 82 --save
node scripts/probe-aag-quote.mjs --vrm <reg> --genart 402 --save
node scripts/probe-aag-quote.mjs --vrm <reg> --genart 82 --classic --save
node scripts/probe-aag-product-info.mjs --ids <two ProductIds> --save
npm test

# 3. coverage (the reg must be in haynespro_vehicle_cache — look it up in the app first)
node scripts/probe-genart-coverage.mjs --vrm <reg> --quote

# 4. admin page
npm run dev → sign in as admin → /admin/parts → "Check AAG prices" → reg + Brake discs → Get prices
#    with AAG_API_KEY unset: amber "isn't configured" banner, form disabled, no error
```

## Mobile app

Nothing to do. The only contract change is the **optional** `genartIds` field on `CatalogueNode`, which old builds ignore. No migration, no new endpoint.

## When complete
- [x] Update this file's status + acceptance boxes.
- [x] Update `docs/HANDOFF.md` (Current task).
- [ ] Owner: credentials into `.env.local` + Vercel; run "How to verify" 1–3; fill `docs/05-aag-parts-api.md` §3/§4; tick the three owner boxes above.
- [ ] Owner: reply to AAG on the IP question (`docs/05-aag-parts-api.md` §1, §5).
- [x] Committed and merged to `main` (2026-09-10).
