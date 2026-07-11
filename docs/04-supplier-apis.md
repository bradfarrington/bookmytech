# Supplier APIs — HaynesPro (repair times & technical data) + VRM lookup

**Written 2026-07-09.** The owner's customer (Gareth Roberts) has been granted two demo accounts by Infopro Digital Automotive, plus a separate VRM-lookup test account. This doc is the single reference for what those APIs offer, what we verified live, how they slot into the existing pricing/booking flow, and what's still open. Credentials are **NOT in this file** — they live in `.env.local` (gitignored) under the env names below, and in the owner's email thread.

---

## 1. The three accounts

| Account | What it is | Env vars (in `.env.local`) | Expiry |
|---|---|---|---|
| **HaynesPro Data Exchange** (demo) | SOAP + REST JSON API for vehicle identification, repair times, maintenance schedules, adjustments, parts (genart) linkage, technical data. Rights: **Car dataset, "SET" package** (Tech + Electronics + Smart). | `HAYNESPRO_DISTRIBUTOR_USERNAME`, `HAYNESPRO_DISTRIBUTOR_PASSWORD` | **2026-08-09** |
| **HaynesPro Portal-to-Portal (SSO)** (demo) | One-time-link single sign-on into **WorkshopData Touch** (their end-user app) with vehicle + subject pre-selected. For mechanic-facing technical data. userType: `demo` (CarSET). | `HAYNESPRO_SSO_COMPANY_ID`, `HAYNESPRO_SSO_PASSWORD`, `HAYNESPRO_SSO_USERTYPE` | **2026-08-09** |
| **VRM lookup supplier** (test) | Reg → vehicle details + **VIN**. MOT Data / MOT History / VED / Imagery available as paid add-ons (a few pence per lookup, can be toggled). Username `BookMyTech` + a UUID "Web API token". | `VRM_LOOKUP_API_TOKEN` | not stated |
| WorkshopData Touch (browser login) | Comparison/browsing tool, not an API. `Support@bookmytech.co.uk` — password in owner's email. Useful to eyeball what data exists for a vehicle before coding against it. https://www.workshopdata.com/touch/ | — | — |

⚠️ **The VRM supplier email included NO endpoint or documentation** — just username + token. Probed on 2026-07-09: `uk1.ukvehicledata.co.uk` (legacy UKVD), `uk.api.vehicledataglobal.com/r2` (VDG), CarweB VRR, and One Auto API all **rejected the key**. → **Blocked: ask the supplier (via Gareth) for their API base URL + docs** before building the reg→VIN bridge. The supplier is very likely in the Infopro group (CarweB / Infopro Digital Automotive VRM products), since the HaynesPro emails come from the same rep.

---

## 2. HaynesPro Data Exchange — what it offers vs. what BMT needs

Endpoints (verified live 2026-07-09):
- **REST JSON** (use this — no SOAP client needed): `https://www.haynespro-services.com/workshopServices3/rest/jsonendpoint/{operation}?vrid=…&param=…`
- SOAP: `https://www.haynespro-services.com/workshopServices3/services/DataServiceEndpoint` (WSDL at `?wsdl`)
- Swagger: `https://www.haynespro-services.com/workshopServices3/swagger-ui/`

### Catalogue → BMT relevance

| HaynesPro subject | Key operations | BMT relevance |
|---|---|---|
| **Repair Times** (ch. 11) | `getRepairtimeTypesV2`, `getRepairtimeSubnodesByGroupV4`, `getRepairtimeNodesByGenartsV4`, `getRepairtimeSubnodesTextSearchV4`, `getRepairtimeInfosV4`, `processRepairTasksV4` | ⭐ **The core win.** OEM-compiled labour times **per specific vehicle** (per TecDoc-equivalent "repairtimeType"). Time values are integers = hours×100 (`70` = 0.7h). Plugs directly into the Task 15 `duration × hourly-rate` engine. |
| **Maintenance** (ch. 5) | `getMaintenanceSystemsV7` (+`includeServiceTimes`), `getMaintenanceTasksV9`, `getMaintenancePartsForPeriod`, `getWearPartsIntervalsV3` | ⭐ Powers vehicle-specific **"Full service"**: manufacturer schedules, per-interval task lists, **service times** (verified enabled on our demo licence), and required parts as TecDoc genart IDs + mandatory flags. |
| **Identification** (ch. 2) | `decodeVINV4`, `getCarTypesByTecdocNumberV3`, `findCarTypesByDetailsV3`, `getIdentificationTreeV2` | ⭐ The bridge from a UK reg. VIN decode returns car types **with `repairTimeTypes` embedded** + ETK suggestions. Tecdoc-number lookup is exact if the VRM supplier can give us a KTypNr. Text/details search is the manual fallback. |
| Adjustments (ch. 4) | `getAdjustmentsV7` | Nice-to-have for mechanics (torque settings, capacities). Better served via SSO into Touch. |
| Lubricants (ch. 6) | `getLubricantsV5`, `getLubricantCapacitiesV4` | Oil spec + capacity per vehicle — useful later for parts costing of services (right oil, right quantity). |
| Repair Manuals, Technical Drawings, Warning Lights | `getStoryInfoV6`, `getDrawingsV4`, … | Mechanic-facing. **Don't rebuild in BMT — deep-link via SSO.** |
| Electronics/VESA (separate doc), Wiring Diagrams, Fuses, Management | `getSystemsV2`, `getCompleteComponentV10`, … | Mechanic-facing diagnostics (licensed — "Electronics" is in our SET package). Again: **SSO, don't rebuild.** |
| TSB / SmartFIX / SmartCASE / Recalls (ch. 16) | `getTSBCasesRecallsSystemsV4`, `getSmartPackFaultCodes` | "Smart" package is licensed. Mechanic-facing; SSO covers it. Could later surface recalls on the customer vehicle card. |
| ProFit topics (ch. 18) | `getProFitTopics`, `getProFitDataById` | Pre-packaged "fitting instructions" per part topic (battery, key programming…) combining manuals + times + adjustments. Possible shortcut for per-service mechanic briefs. |
| Converter (ch. 13), Data Export (ch. 14), ETK search (ch. 15) | — | Not needed. |

### What HaynesPro is NOT
- **Not a parts *pricing* API.** It tells you *which* parts a job/service needs (TecDoc **genart** category IDs, e.g. `7` = oil filter, `402` = brake pad set, `3224` = engine oil, plus mandatory flags and quantities) — not branded SKUs or trade prices. Actual part prices per vehicle still need a parts distributor API (ECP/GSF/etc., keyed by TecDoc ktype + genart) or our existing manual catalogue. The Task 15 note "deferred with the supplier parts API" is therefore **half-resolved**: durations → solved by HaynesPro (per **vehicle**, which supersedes per-area); part prices → still manual/other supplier.
- **No reg-plate lookup in Data Exchange.** Identification is by VIN / TecDoc / KBA / ETK / tree / text search. (SSO *does* accept a `numberPlate` param "if agreed in contract" — worth asking, but the API path needs the VRM supplier.)

---

## 3. Verified live calls (demo account, 2026-07-09)

All calls REST JSON, all returned real data:

```text
1. getAuthenticationVrid?distributorUsername=…&distributorPassword=…&username=<any ≤32 chars>
   → {"vrid":"1D4D…","statusCode":0}

2. getRepairtimeTypesV2?vrid=…&descriptionLanguage=en&carTypeId=26650      (VW Golf IV 1.4 AKQ)
   → [{make:"VW", model:"GOLF IV (1J1)", repairtimeTypeId:8799, typeCategory:"CAR", rootNodeId:"root"}, …]

3. getRepairtimeNodesByGenartsV4?vrid=…&repairtimeTypeId=8799&typeCategory=CAR&genArtNumbers=402
   → "Renew the front brake pads"  id=1M01510000WV0  value=70   (= 0.70 h)
     "Renew the rear brake pads"                     value=90
     "Renew all the brake pads"                      value=160
   ⭐ genart-keyed lookup is cross-make stable — the same query works for any vehicle.

4. decodeVINV4?vrid=…&vin=WAUZZZ8L63A002427          (doc example, Audi A3 8L)
   → 18 candidate types (one per engine variant), each with engineCode, years,
     capacity and embedded repairTimeTypes. → we must disambiguate using the
     VRM data (engine code / capacity / fuel / year), else ask/fall back.

5. getMaintenanceSystemsV7?vrid=…&carTypeId=26650&includeServiceTimes=true
   → 3 systems; periods each carry times: [(COMMERCIAL_TIME, 160, selected)] = 1.6 h
   ⭐ Service times ARE enabled on the demo licence (they're contract-gated).

6. getIdentificationTreeV2?vrid=…&vehicle_level=ROOT&filter_toVehicleLevel=MAKE&filter_category=PASSENGER
   → root node with subElements = 88 car makes (no images at make level).
   MAKE→MODEL: vehicle_id=<makeId>&vehicle_level=MAKE&filter_toVehicleLevel=MODEL
   → models with name, years and an svgz car image (haynespro-assets.com,
     served image/svg+xml + gzip + CORS * → renders in a plain <img>).
   MODEL→TYPE likewise. ⚠️ vehicle_id is the BARE integer id (no m_/t_ prefix);
   filter_category values: PASSENGER / LCV / TRUCK / MOTORCYCLE.

7. getStoryOverview?vrid=…&carType=26650 → 18 repair manuals (name + storyId).
   getStoryInfoV6?carTypeId=…&storyId=…&smartLinks=false → {name, storyLines[]}
   recursive lines with remark + mimeData.mimeDataName image URLs.
   ⚠️ The "-last versions" variants (getStoryOverviewByGroupV2 etc.) demand a
   carTypeGroup enum that rejects CAR/PASSENGER — use the plain carType ops.

8. getAdjustmentsV7?carType=… and getLubricantCapacitiesV4?carType=…
   → recursive {name, value, unit, remark, subAdjustments} rows.
   getIdLocationV3?carTypeId=…&carTypeLevel=3   (level is an INTEGER; 3 = TYPE)
   → story-shaped ID-plate locations with photos.
   getRepairtimeSubnodesByGroupV4?repairtimeTypeId=…&typeCategory=CAR&nodeId=root
   → one tree level (43 top groups on the Golf IV); omit carTypeGroup.

9. SSO (SOAP 1.2, Stage F): registerVisitByDistributor verified live →
   <code>0</code> + one-time redirectUrl into WorkshopData Touch.
   ⚠️ The WSDL element really is spelled "companyIdentificaton".

API self-documentation: `GET /workshopServices3/swagger-resources` lists the
spec groups; `GET /workshopServices3/v3/api-docs?group=<name>` returns full
OpenAPI (param names/types) per group — fastest way to check an op's signature.
```

### Auth model + the VRID gotcha (matters on Vercel)
- `getAuthenticationVrid(distributorUsername, distributorPassword, username)` → **VRID** token. Valid **8h since last use**. **Minting a new VRID for the same `username` invalidates all previous ones for that username.**
- On serverless (Fluid Compute, many instances), a naive module-level cache per instance → instances mint VRIDs that invalidate each other → auth churn. **Do instead:** persist the current VRID in Supabase (`platform_settings` key, service-role) with the username used; on statusCode `5` (incorrect/expired vrid) re-auth once, update the row, retry the call. Two instances racing converge (last writer wins; the loser gets a 5 and re-auths). Status codes: 0 OK, 1 unknown company, 2 bad password, 3 username not found, 4 no licence, 5 bad/expired vrid, 6 no rights for operation, 7 banned 20 min, −1 unknown.
- Demo accepts **any username ≤32 chars**; production usernames may be contractually restricted — keep it to one configured username (`HAYNESPRO_USERNAME`, default `bookmytech_prod`).

### Data-stability gotcha
`ExtCarType.id` (carTypeId) is **NOT stable across HaynesPro database updates** ("don't store it and expect it to be the same in a few months"). So: cache resolutions keyed by **VIN / reg / TecDoc**, store carTypeId + repairtimeTypeId with a TTL (~30 days), and re-resolve on miss. Never treat a stored carTypeId as permanent.

---

## 4. How it slots into the existing flow

The pricing engine was built for this. **Labour = duration × global hourly rate** (`lib/pricing/calculate.ts`); duration resolution today is `per-(service,area) override → service default`. HaynesPro adds a *vehicle-specific* layer on top:

```
reg (customer types it — UNCHANGED UI)
  └─ VRM supplier: reg → make/model/VIN/engine/fuel/year (+ optional image, MOT, VED)
       └─ HaynesPro decodeVINV4 → candidate car types (+ repairtimeTypeIds)
            └─ disambiguate on engineCode/capacity/fuel/year from the VRM data
                 └─ per selected service:
                      • standard jobs → getRepairtimeNodesByGenartsV4(repairtimeTypeId, genarts)
                        filtered by a per-service mapping rule → duration_hours
                      • full-service  → getMaintenanceSystemsV7 service time for the
                        matched interval → duration_hours
                 └─ computePrice({ durationHours: vehicleSpecific ?? areaOverride ?? serviceDefault, … })
                      → snapshot onto the booking exactly as today
```

**Duration resolution becomes:** `vehicle-specific (HaynesPro) → per-(service,area) override → service default → legacy fallback`. Everything downstream (parts add-on, commission-on-total, payout, snapshots) is untouched.

### The one real design problem: service → repair-time mapping
BMT sells ~10 packaged services; HaynesPro exposes thousands of granular operations per vehicle in a tree. The mapping must be **admin-configurable per service**, using **genart IDs** (cross-make stable) plus a selection rule. Suggested shape (new table `service_time_mappings`): service_id, genart_ids int[], match strategy (`sum` | `max` | text filter on description, e.g. prefer "Renew the front brake pads" over left/right singles), and a `maintenance` flag for full-service (use schedule times instead of repair nodes). `getRepairtimeInfosV4` / `processRepairTasksV4` handle included/overlapping sub-tasks if we ever bundle multiple ops in one booking.

### Fallback ladder (never block the funnel)
VRM lookup fails → manual vehicle form (exists today). VIN decode ambiguous beyond scoring → use service-default duration, price as today, log a `note` event so admin can see the booking priced generically. HaynesPro down → service default. **The customer flow never errors because a supplier did.**

### UI impact — minimal, no redesign
- **Vehicle confirm card**: unchanged structure; optionally add the supplier's vehicle **image** and engine-variant line. Only new UI: a small "which engine?" picker for the rare ambiguous case (or keep it invisible and auto-pick best match).
- **Price hero (`/book/match`)**: unchanged layout; the number simply becomes vehicle-accurate. Optionally add "Estimated time on your {make model}: 1.4h" — reinforces the fairness story.
- **Landing "from £X"** previews: untouched (cached `starting_price_pence` remains the indicative price).
- **Mechanic job detail**: add one "Technical data" button → SSO deep-link (below).
- **Admin**: per-service mapping editor (extends the existing service edit page) + a "duration source" line on the job detail snapshot.

### Mechanic SSO (cheap, high value)
`registerVisitByDistributor(companyIdentificaton, distributorPassword, username, properties)` → one-time `redirectUrl` into WorkshopData Touch. Endpoint: `https://www.haynespro-services.com/reg/services/RegistrationV2` (SOAP only). Pass `userType=demo` (required for our account), `interface=TOUCH`, vehicle (`carTypeId=t_<id>` or `tecdocKTypNr`/`vin`), and a landing `subject` (`repairmanuals`, `drawings`, `electronics`, `smartfix`, `adjustment#engine`, …). Per-mechanic `username` gives each mechanic their own session. Link is one-time and sessions last 8h idle — mint fresh per click. This gives mechanics full manuals/wiring/TSBs for the booked vehicle with ~1 server action + 1 button.

### SmartCart — skip
Push-XML export of a Touch cost estimate to a postback URL. BMT prices in-app; not needed. Revisit only if mechanics ever quote extra work inside Touch.

### Overlap with existing DVLA/DVSA integration
Keep **DVSA MOT History** (free) for MOT expiry (reminders) and **DVLA VES** (free) for tax/MOT status. The VRM supplier earns its pence-per-lookup by providing the **full VIN** (neither gov API gives it) + richer typing (+ optional image). Cache VRM results in Supabase (persistent, keyed by reg) — a few pence per *new* reg, not per page view; the existing 5-min in-memory cache in `lookup-vehicle.ts` stays as the hot layer.

---

## 5. Open questions (owner / supplier)

1. **VRM supplier: endpoint + docs** — the email had credentials only. Also ask: does the response include **TecDoc KTypNr** (would skip VIN-decode ambiguity entirely) and the **full VIN**? What are the exact package names for MOT/VED/Imagery toggles?
2. **HaynesPro production terms** — per-username restrictions, pricing model (per seat vs per call), and whether **numberPlate identification** can be added to the contract (they partner with VRM providers; could collapse two integrations into one).
3. **Owner decision — pricing model**: confirm prices should now vary **per vehicle** (Golf brakes ≠ Range Rover brakes), superseding the per-area duration idea. The engine supports both stacked; per-vehicle should win when available.
4. **Owner decision — time source**: HaynesPro times are OEM book times. Sell at book time, or apply a configurable uplift/rounding (e.g. round up to 0.25h, min 1h call-out)? Suggest a `platform_settings` multiplier + minimum.
5. **Demo expiry 2026-08-09** — request extension or start commercial conversation before building against it heavily.

## 6. Proposed build order (→ becomes Task 16 when approved)

1. **Stage 0 — unblock**: get VRM supplier docs; confirm owner decisions above.
2. **Stage 1 — HaynesPro client** (`lib/haynespro/`): REST JSON fetcher, Supabase-persisted VRID with re-auth-on-5, typed wrappers for the 5 verified ops, `vehicle_type_cache` table (reg/VIN → carTypeId + repairtimeTypeId, TTL).
3. **Stage 2 — reg→vehicle bridge**: VRM client, merge into `lookupVehicleAction` (VIN + richer details + image), candidate scoring against decodeVINV4.
4. **Stage 3 — vehicle-specific durations**: `service_time_mappings` table + admin editor; extend `calculatePrice` duration ladder; snapshot `duration_source` on bookings; price-hero copy tweak.
5. **Stage 4 — mechanic SSO button**: SOAP `registerVisitByDistributor` server action + "Technical data" button on `/mechanic/jobs/[id]` with subject links.
6. **Later**: maintenance-schedule-driven full-service content (show the actual manufacturer task list to customer/mechanic), genart column on `parts` to auto-suggest catalogue parts per booking, recalls surface.
