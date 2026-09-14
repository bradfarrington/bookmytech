# Task 44 — HaynesPro production accounts: DX ID + DX Content, per-vehicle sessions, demo removed

**Status:** ✅ Complete (2026-09-14). The site runs on HaynesPro's two production Data Exchange accounts, with sessions that follow HaynesPro's licence rules. It is verified live through the site's own client and the scripts. The demo credentials are gone from `.env.local`. Deviation: none from the brief. **Owner action before deploying:** set the four new variables in Vercel and delete the six demo ones (see "Env"); deploying without them leaves HaynesPro "not configured". **No migration. No mobile API change.**

## Why

HaynesPro had been dead since the demo licence expired on 2026-08-09 (auth `statusCode 1`, "unknown company"). The repair catalogue is the whole booking flow, so nobody could price or book. HaynesPro issued production credentials on 2026-09-14 as **two accounts** with new, contractual session rules. The old client broke those rules: one app-wide VRID shared by every vehicle and stored indefinitely.

## HaynesPro's rules (email, 2026-09-14)

- **DX ID** — identification only (manual searches; not invoiced). **DX Content** — data once the HaynesPro type id is known.
- Tokens are **vehicle- and user-specific**; switching vehicle needs a new token. Active 8 hours after last use.
- Content session usernames must be **`<prefix>_<vehicle identifier>`** (e.g. `35sg46_FX73KUA`, `5hg84h_619008017`).
- **Caching tokens is prohibited**, except reuse on the same day by the user who created it, for that same vehicle.

## What shipped

- **`lib/haynespro/client.ts`** rewritten:
  - `haynesProCall(operation, params, session)` — every call names a `HaynesProSession`: `{account: "id", identifier}` or `{account: "content", carTypeId}`.
  - Config needs all four distributor values. `HAYNESPRO_USERNAME_PREFIX` is optional (default `bmt`).
  - Pure, tested helpers: `sessionUsername` (`<prefix>_<identifier>`, alphanumerics, ≤32 chars), `sessionSettingsKey`, `sessionDay` (Europe/London), `parseStoredSession`, `isSessionReusable`.
  - One `platform_settings` row per `(account, username)`: `haynespro_session:<account>:<username>` → `{vrid, username, day}`, reused only the same UK day.
  - On statusCode 5: re-read the row, mint once only if ours was the stored one, retry once.
  - Concurrent mints for the same session within an instance collapse into one. The catalogue search fans out 8 calls per vehicle; parallel mints would invalidate each other.
  - Rows older than 24h are deleted on each mint.
  - Health records name the account ("DX Content account: …").
- **`lib/haynespro/tree.ts`**:
  - The identification tree runs on DX ID: `browse` for makes/models/types, the car type id for a single TYPE.
  - Every per-type read runs on DX Content under that car type's session.
  - `getRepairtimeSubnodes`, `getRepairNodesByIds` and `combineRepairTimes` now take an `HpVehicleRef` (`{carTypeId, repairtimeTypeId}`) instead of a bare `repairtimeTypeId`.
- **`lib/haynespro/vehicle.ts`** — identification (`decodeVINV4`, `findCarTypesByDetailsV3`) runs on DX ID under a session named for the reg. `getRepairtimeTypesV2` runs on DX Content.
- **Callers threaded:**
  - `lib/haynespro/catalogue.ts` (`CatalogueContext extends HpVehicleRef`)
  - `lib/haynespro/repair-booking.ts`
  - `app/(admin)/admin/(shell)/repairs/page.tsx`
  - `app/(admin)/admin/(shell)/vehicles/_components/repair-tree-panel.tsx`
- **Scripts** (`scripts/lib/haynespro-rest.mjs` + `probe-genart-coverage`, `verify-repair-combination`, `verify-repair-node-ids`, `probe-oil-capacity`):
  - same two accounts and session shape;
  - tokens held in memory for the run only;
  - a separate prefix (`HAYNESPRO_PROBE_USERNAME_PREFIX`, default `bmtprobe`), so a probe never invalidates the live site's session for the same car.
- **Removed:**
  - the demo `HAYNESPRO_DISTRIBUTOR_*` / `HAYNESPRO_USERNAME` and the expired SSO demo values from `.env.local`;
  - the dead shared `platform_settings.haynespro_vrid` row.
- **Docs:** `docs/04-supplier-apis.md` §1 + auth model, `docs/DEPLOYMENT_ENV.md`, this file, `docs/HANDOFF.md`.

## Acceptance criteria

- [x] Both production accounts authenticate. *(2026-09-14: DX ID and DX Content each issued a VRID.)*
- [x] Identification runs on DX ID, content on DX Content. *(Verified: `getRepairtimeTypesV2` on DX ID → statusCode 6; on DX Content → repairtime type 126529.)*
- [x] Content session usernames are `<prefix>_<carTypeId>`; tokens are reused only by the same username on the same day. *(Unit-tested; live rows `haynespro_session:content:bmt_402001761`, `…:bmt_619023786`, day `2026-09-14`.)*
- [x] No app-wide shared token remains; the legacy `haynespro_vrid` row is deleted.
- [x] A concurrent fan-out for one vehicle creates one session, not one per call. *(Live: search on an uncached reg produced a single content row, and no errors in the server log.)*
- [x] The public catalogue works end to end on production:
  - `GET /api/mobile/v1/repairs/search?reg=DV12CGU&q=brake pads` identified an uncached reg through DVLA → DX ID ("VAUXHALL Meriva Mk II (S10) 1.4 16V") and priced brake repairs through DX Content (front pads £60, all pads £72, the pads + discs bundles).
  - `GET /api/mobile/v1/repairs/tree?reg=BM19WKO&node=root` → 29 groups.
- [x] `haynespro_health` recovers to `ok` on a successful mint.
- [x] Scripts run on production: `probe-genart-coverage --vrm BM19WKO --quote` walked the repair tree with 8-way concurrency and priced 10 of 15 GenArts on AAG.
- [x] `tsc --noEmit` clean; eslint clean on changed files; `npm test` 456 passed (11 new in `lib/haynespro/session.test.ts`).
- [x] No migration; no `app/api/mobile/**` request or response change.

## Env (`.env.local`, never committed)

| Var | Required |
|---|---|
| `HAYNESPRO_ID_DISTRIBUTOR_USERNAME` / `_PASSWORD` | ✅ |
| `HAYNESPRO_CONTENT_DISTRIBUTOR_USERNAME` / `_PASSWORD` | ✅ |
| `HAYNESPRO_USERNAME_PREFIX` | optional, default `bmt` |
| `HAYNESPRO_PROBE_USERNAME_PREFIX` | scripts only, default `bmtprobe` |

**Vercel:** add the four required values (and the prefix if HaynesPro assign one). Delete `HAYNESPRO_DISTRIBUTOR_USERNAME`, `HAYNESPRO_DISTRIBUTOR_PASSWORD`, `HAYNESPRO_USERNAME`, `HAYNESPRO_SSO_COMPANY_ID`, `HAYNESPRO_SSO_PASSWORD`, `HAYNESPRO_SSO_USERTYPE`.

## Known consequences / open

- **SSO is off.** No production Portal-to-Portal account was issued, so the mechanic's "open manual" link isn't offered until one is. The code is unchanged and keys off the same `HAYNESPRO_SSO_*` names.
- **Questions for HaynesPro:**
  - Do they assign the `<prefix>`?
  - Is one shared `browse` DX ID session for the make/model tree acceptable?
  - Does "the user who created it" mean the session username (our reading) or the end user?
  - Are data caches (the 30-day reg → car type cache, the in-memory tree/data memo) within the licence? The email only addresses tokens.
- **Health flaps between accounts.** `haynespro_health` is one row, so a successful mint on one account overwrites a failure recorded for the other. Acceptable while both work; split per account if it ever misleads.

## Mobile app

Nothing to do. All changes are server-side; no endpoint, request or response shape changed, and there is no migration.

## When complete
- [x] Update this file's status + acceptance boxes.
- [x] Update `docs/HANDOFF.md`.
- [ ] Owner: Vercel env (above), then deploy.
- [ ] Owner: send HaynesPro the open questions above.
- [ ] Commit.
