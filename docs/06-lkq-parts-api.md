# Supplier APIs — LKQ Euro Car Parts (catalogue, trade pricing, stock and ordering)

**Written 2026-09-11.** Gareth has a trade account with **LKQ Euro Car Parts** and LKQ have issued test credentials. This doc is the single reference for what those APIs offer, what has been **verified live**, how they slot into the booking and parts flows, and what is still open. It is the parts counterpart to `docs/04-supplier-apis.md` (HaynesPro) and sits alongside `docs/05-aag-parts-api.md` (AAG, parked).

Credentials are **NOT in this file** — they live in `.env.local` (gitignored) under the env names below. The supplied documents are deliberately untracked (see `.gitignore`); they carry live passwords.

> **Everything in §3–§6 was executed against LKQ's test service on 2026-09-11 and is real output, not transcription.** Where the supplied documentation contradicts the service, the service wins and the contradiction is recorded in §2.

---

## 1. Two APIs, two credential sets, two protocols

| API | What it is | Env vars | Status |
|---|---|---|---|
| **ADS Vehicle & Parts** | REST/JSON catalogue. VRM or VIN → 56 vehicle attributes → applicable parts per component, with fitment data, images and quantity-of-fit. ASP.NET Web API. | `LKQ_ADS_USERNAME`, `LKQ_ADS_PASSWORD`, `LKQ_ADS_APP_ID`, `LKQ_ADS_API_KEY`, `LKQ_ADS_VEHICLE_URL`, `LKQ_ADS_PARTS_URL`, `LKQ_ADS_AUTH_HEADER` | ✅ Verified working |
| **LKQECP API Plus** | SOAP 1.1. `PutSession` → 20-minute token, `GetPrice` for Gareth's trade price + five-level stock, `CreateSalesOrder` to order with carrier delivery. WCF/IIS. | `LKQ_ECP_SYSID`, `LKQ_ECP_PCID`, `LKQ_ECP_PASSWORD`, `LKQ_ECP_ACCOUNT`, `LKQ_ECP_BRANCH`, `LKQ_ECP_PRICE_URL`, `LKQ_ECP_ORDERS_URL` | ✅ Pricing verified. Ordering **not implemented** |

**No IP allowlist problem.** Both hosts answered from a normal development machine on the first attempt. This is the single biggest practical difference from AAG, whose UAT host is Cloudflare-blocked and still waiting on an allowlist (`docs/05-aag-parts-api.md` §1).

**The ADS catalogue is metered**; the signed-off request was for **500 test credits**. The ECP SOAP calls appear unmetered. Probes therefore lean on ECP and spend ADS credits deliberately, one call per run.

---

## 2. Where the supplied documentation is wrong

Five contradictions, all found by checking the service rather than reading. Each would have cost real debugging time.

### 2.1 The SOAP body namespace

The docx examples use `xmlns="http://lkqcoatings.net/PriceService"`. The live WSDL puts the `PutSession` / `GetPrice` elements in **`http://lkqcoatings.net/ApiPriceService`**. Confusingly the `SOAPAction` header *does* use `.../PriceService/...`. They genuinely differ; neither is a typo to "correct".

```
SOAPAction: "http://lkqcoatings.net/PriceService/IApiPlusPriceSvc/GetPrice"
body element xmlns="http://lkqcoatings.net/ApiPriceService"
```

### 2.2 `<value>` is a string, not nested XML

The docx prints `<PutSession><value><QUERY><SysId>…` as though `QUERY` were child elements. `xsd0` declares `value` as **`xs:string`**, so the whole `QUERY` document must be **XML-escaped into it as text**, and the reply arrives as an escaped `<REPLY>` string inside `PutSessionResult`. It is a WCF string-in/string-out facade. Send real nested elements and nothing comes back.

### 2.3 The response is nested well beyond the documented table

§8.2 lists `Status`, `Details`, `CustPrices`, `Branch`, `Account`, `Name`, `Currency`, `Quality`, `BranchFree`, `ShowPrice`… as if flat. Actually:

| Documented as | Actually at |
|---|---|
| `Status`, `Details`, `CustPrices`, `Branch` | `REPLY > Modes` |
| `Account`, `Name`, `Currency` (+ undocumented `TermsExist`) | `REPLY > Customer` |
| `Quality`, `QualityDesc` | `Part > QualityDetails` |
| `BranchFree`, `NDCFree`, `RDCFree`, `BuddyFree`, `CompanyFree` | `Part > Stock` |
| `ShowPrice`, `CustSur`, `Retail` → **`RetailPrice`**, `Net1` → **`Net1Price`** | `Part > Price` |

`Details` and `CustPrices` are **not** request switches — sending them in `QUERY`, nested or flat, changes nothing.

### 2.4 "104 = Brake Discs" is wrong

The one worked example for component groups. In the real component list (§5) **`000104` is "Distributor Cap"**; Brake Disc is **`000027`**. Component numbers are **six-digit zero-padded strings**, not integers. Anything built on the docx example would have quietly priced the wrong parts.

The help page also names the path segments `{searchString}/{treeSourceId}`, not the docx's `{ComponentGroup}/{SearchIncrement}`.

### 2.5 An unknown part number is NOT an error

**The most dangerous one.** Documented error code **107 "Product not found" is never returned.** `GetPrice` for part `000000000` answers `Status 0` with a row whose description is blank, `ShowPrice` `"0.00"` and `RetailPrice`/`Net1Price` empty.

**Anything that prices a job must test for this explicitly** or a part LKQ has never heard of silently becomes a **£0.00 line on a customer quote**. `isNotFound()` in `scripts/lib/lkq-soap.mjs` is the check: no description **and** no retail **and** no net price.

Related: an **empty** stock figure means *no number given*, **not zero**. `101690288` returns every level blank while `333330020` reports `NDCFree 195`. Do not coerce blank to 0 and render "out of stock".

---

## 3. Verified: the ECP SOAP pricing chain

Host `https://apiplus1test.lkqbodyshop.com/ApiPlusPriceSvc.svc`, SOAP 1.1, `Content-Type: text/xml; charset=utf-8`.

**An undocumented third operation exists — `HelloFromLkq`.** It takes no arguments, needs no credentials, and returns the service version and server time. It is the cleanest way to separate "can we reach LKQ" from "are our credentials right" — the distinction that cost Task 40 a day on AAG.

```
Hello from LKQ API Plus Price Service: : current server time is :
11 September 2026 at 08:09:32 : Version 1.0.1.1. : dated 26 August 2026
```

`PutSession` returns a token **valid 20 minutes** — short enough that a serverless client must mint per call or cache with a wide margin, never hold one for the life of an instance.

`GetPrice` accepts **several parts in one call** (verified with 6) and takes either an ECP part number or `Type` + `Code` where `Type` is `MANUF` / `OEM` / `TECHDOC`. The `MANUF` route resolves a manufacturer code to an ECP part:

```
--manuf "0 986 012 350"  →  402590490 BOSCH STARTER, £216.20 (surcharge £59.95), RRP £290.49
```

### The price ladder — the single most useful finding

**One 8-digit ADS part number expands to many 9-character ECP parts, one per brand/quality.** The ninth character is a brand suffix and may be a digit *or* a letter. Real output for ADS part `10459026` on account `L4040300`:

| ECP part | Brand | Quality | Gareth pays | RRP | Stock br/buddy/rdc/ndc/co |
|---|---|---|---|---|---|
| 104590266 | TEXTAR | OES | £31.67 | £76.42 | –/–/–/–/– |
| 104590267 | BOSCH | OES | £54.87 | £81.86 | –/–/–/35/– |
| 104590268 | PAGID | OES | £47.47 | £81.86 | –/–/–/2844/3610 |
| 104590269 | EICHER-PRM | AMQ | £46.06 | £81.86 | **6**/–/–/–/366 |
| 10459026A | BREMBO | OES | £55.76 | £81.86 | **2**/–/–/130/632 |
| 10459026S | STARLINE | AMQ | — | £0.00 | –/–/–/–/– |
| 10459026W | BREMBO MAX | PQ | £60.93 | £0.00 | –/–/–/–/– |
| 10459026X | BREMBO XTR | PQ | £66.90 | £81.86 | –/–/–/6/32 |

That is a genuine budget→OE ladder with live stock — exactly the shape a quote engine wants. Note some variants have **no price at all** (not sellable on this account), and some have `RetailPrice` `0.00` (no published RRP).

Three price fields, and they are not ordered as you would guess: `ShowPrice` £39.22 < `Net1Price` £42.49 < `RetailPrice` £88.19 on `101690288`. **`ShowPrice` is the account's price** and the only one that should drive costing.

Descriptions carry **supersession markers** in free text — `"S/S TO 104592468"` — which need handling before a description reaches a customer.

**⚠️ Open and important:** §8.2 claims `ShowPrice` *includes* the surcharge when `CustSur` is present. **Unverified**, and it decides whether a surcharged part is over- or under-quoted by the surcharge amount. Confirm before any surcharged figure reaches a customer.

---

## 4. Verified: the ADS catalogue chain

**Vehicle lookup** — `POST https://live.vdslookup.co.uk/vehiclesearch.v4.0/api/v5/GB/details`, one credit.

The docx names the `UserToken` parts without giving the JSON (it is commentary on a Postman collection that was never supplied). The inferred shape was **accepted first time**:

```json
{ "Attributes": [{ "Name": "VRM", "Value": "NV57XGP" }],
  "UserToken": { "Username": "…", "Password": "…", "ApplicationId": "348",
                 "Language": "en-GB", "LoggedInUser": "…",
                 "SessionGuid": "<uuid>", "ApiKey": "…" } }
```

`NV57XGP` returned **56 attributes** — `Make` Volvo, `Model` S40, `EngineCode` B4164S3, `ExactCC` 1596, `Fuel` PETROL, `BodyStyle` 4 DOOR SALOON, `DriveType` Front, `NumberOfDoors` 4, `TransmissionType` Manual, `VIN`, `VehicleGuid`, `VehicleId`, a manufacturer image URL, and a `DerivativeDateRange`. Several names appear **twice with different casings of the value** (`Fuel` = `PETROL` and `Petrol`; `BodyStyle` = `4 DOOR SALOON` and `Saloon`), so the attribute list is a **multimap, not a dictionary** — do not build it into an object keyed by name.

**Part lookup** — `POST …/APIv1.0/api/v2/GB/search/{component}/{treeSourceId}`, one credit. The whole 56-attribute list is posted back verbatim; the vehicle lookup's reply is the source of truth for it.

`000027` (Brake Disc) on the S40 returned **16 parts**, each with `PartNumber`, `ComponentNumber`, **`QuantityOfFit: 2`**, a TecDoc `ImagePath`, and `DynamicProperties` carrying real fitment data — `16"`, `Front`, `Vented`, `300` (mm), `ECP`.

### Authentication differs between the two hosts

The vehicle host reads the key from the `UserToken` body and ignores headers. The parts host **rejects everything with `403 {"Message":"Invalid API Key"}` until the key arrives in an `ApiKey` HTTP header.** Not `Authorization`, not `Ocp-Apim-Subscription-Key`, not a query parameter. Both are now sent on both.

---

## 5. The full component list — obtained, not requested

The docx says a full component list "can be provided". It does not need to be: the parts service is an **ASP.NET Web API with its generated help page live at `/APIv1.0/Help`**, documenting the entire surface, and one of its endpoints *is* the list.

```
GET https://partsearch.adsapplications.co.uk/APIv1.0/api/v2/Components/348/GB/en
    ApiKey: <key>
```

**2,277 components**, checked in at `lib/lkq/__fixtures__/ads-components-GB-en.json`. 69 are brake-related alone. The language segment must be `en` — `en-GB` and numeric values return HTTP 500.

The help page also reveals endpoints the docx never mentions, several of which matter later: `ComponentsByVehicleAttributes` (which components apply to *this* vehicle — the natural way to drive a repair→parts mapping), `GetPartDetails`, `getpartimages`, `partcompare`, `GetPartCrossReferences`, `GetTecDocSuppliers`, `TecDocReferences`, `Suppliers`, and a credential-free `api/ping`.

**`TecDocReferences` is the one to look at next.** Our catalogue already carries TecDoc GenArt ids on repair nodes (`CatalogueNode.genartIds`, Task 40 Stage C). If that endpoint maps GenArt ↔ ADS component, the repair→parts mapping is solved without a hand-built table; if not, `ComponentsByVehicleAttributes` narrows 2,277 components to the handful that fit the car.

---

## 6. The end-to-end chain, proven

```
registration
  → ADS vehicle lookup          56 attributes          (1 credit)
  → ADS part lookup by component 16 brake discs        (1 credit)
  → ECP GetPrice on those numbers → 8 brand variants each, Gareth's price + stock
```

This is the whole commercial loop short of ordering, and it works today on Gareth's real account. **AAG never got past authentication.**

---

## 7. Not built, and deliberately

**`CreateSalesOrder` is not implemented.** It places real orders. The spec is transcribed in the supplied docx and its shape is understood — `OrderType`, `CustOrderRef`, `VehicleReg`, `SupplyStatus` (P/C), and a full carrier `DeliverTo` block: five address lines, postcode, contact name and a **mandatory mobile number**.

That carrier block is why LKQ suits us better than AAG did: **parts can ship to the customer's address or the mechanic's**, which is the mobile-mechanic case. Nothing in the probe scripts can order anything.

Note the two documents disagree on the orders endpoint — the spec says `sysmon.lkqcoatings.com/ApiPlusOrder_Service_Test/…`, the credentials sheet says `apiplus1test.lkqbodyshop.com/ApiPlusOrdersService_Test/…` and labels it "New API". `LKQ_ECP_ORDERS_URL` holds the credentials-sheet value. **Untested.**

---

## 8. Open questions

1. **Does `ShowPrice` include the surcharge?** (§3) Decides whether surcharged parts are mis-quoted. Highest priority — it affects money.
2. **Does `TecDocReferences` map GenArt → ADS component?** (§5) Decides whether repair→parts needs a hand-built mapping table.
3. **Which orders host is live**, and does `CreateSalesOrder` behave on the test account? (§7)
4. **What exactly consumes an ADS credit** — searches only, or metadata calls like `Components` too? 500 on the test account; unknown on production.
5. **Why do some variants have no `ShowPrice`** (Starline throughout)? Not sellable on this account, or not stocked?
6. **Production credentials** — the PROD half of the ADS request form is blank.

---

## 9. Env

All in `.env.local`, never committed. Missing = the feature is simply off.

```
LKQ_ECP_SYSID=ADSSYS          LKQ_ADS_USERNAME=
LKQ_ECP_PCID=                 LKQ_ADS_PASSWORD=
LKQ_ECP_PASSWORD=             LKQ_ADS_APP_ID=
LKQ_ECP_ACCOUNT=              LKQ_ADS_API_KEY=
LKQ_ECP_BRANCH=               LKQ_ADS_AUTH_HEADER=ApiKey
LKQ_ECP_PRICE_URL=            LKQ_ADS_VEHICLE_URL=
LKQ_ECP_ORDERS_URL=           LKQ_ADS_PARTS_URL=
```

## 10. Probes

```bash
node scripts/probe-lkq-hello.mjs                     # no credentials — reachability only
node scripts/probe-lkq-price.mjs --part 10459026     # session + price ladder
node scripts/probe-lkq-price.mjs --manuf "0 986 012 350"
node scripts/probe-ads-vehicle.mjs --vrm NV57XGP --save   # 1 credit; writes attributes
node scripts/probe-ads-parts.mjs --attributes lib/lkq/__fixtures__/ads-attributes-NV57XGP.json --group 000027
```

All four exit 2 with a message naming the missing variables when the env is incomplete. Nothing orders.
