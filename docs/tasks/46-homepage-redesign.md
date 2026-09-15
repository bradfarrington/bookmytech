# Task 46 — Homepage redesign

**Status:** ✅ Complete (2026-09-15). The homepage follows `proposal/homepage-redesign.html`, keeping our nav links, our live dispatch animation in the hero, and our footer content. The new sticky, frosted nav is on every page that shares it (`/`, `/help`, `/mechanics`, the legal pages). The redesign's new styles are **additive** design tokens.

Brad's review the same day added:
- all four areas live and a real UK map
- facts in place of invented figures, and false claims removed site-wide (including "DBS-checked")
- the placeholder reviews replaced with a mechanic recruitment section
- em dashes removed from all user-visible copy
- a distinct look for each section, with a faded logo mark in some corners
- the services grid driven by the admin's products, plus a gateway into booking a specific repair

Deviations from the plan: the nav renders from `page.tsx` rather than inside `hero.tsx`, and the mobile drawer renders outside the `<header>`, because `backdrop-filter` would otherwise clip it to the bar. **One data-only migration, `0068_copy_no_em_dashes.sql`** (rewrites seeded text; no schema change, so no type regen). **No `app/api/mobile/**` shape change** (punctuation in some error sentences only). The mobile app needs to mirror the new tokens (see "Mobile app").

**Still open (Brad):**
- **Apply `0068`.** Until then, the three servicing summaries on the homepage and in the booking funnel still show the em dashes they were seeded with ("… change — every six months …"). So do nine seeded part names in the mechanic's quote picker. Editing the three summaries in `/admin/services` fixes the homepage immediately, without the migration.
- **Admin-edited templates.** Any email or SMS template an admin has already customised in `/admin/emails` or `/admin/sms/templates` keeps the em dashes they typed. Code defaults are already dash-free.
- **Mechanic app install name.** The installed mechanic app is now "Book My Tech | Mechanic". Say if you'd prefer different wording.

## Why

Brad added a static redesign of the homepage to `proposal/`. It is the structure and layout every customer page will now follow, one page at a time. This task ports it to the real homepage with three constraints: the nav links, the hero animation and the footer content stay ours.

## Decisions (Brad, 2026-09-15)

1. **Nav everywhere.** The light sticky nav replaces the dark in-hero nav on every page that shares `CustomerNav`. Only the nav changes on those other pages; their bodies wait for their own redesign.
2. **Keep every section, rewrite the copy.** Nothing the redesign invented survives:
   - live mechanic counts and six live cities
   - repair "from" prices
   - a free MOT offer and brand-name parts
   - a placeholder company number
   - Trustpilot/Google badges
   - a quote card where the customer books a named mechanic. Dispatch is broadcast, first to accept.
3. **Additive tokens.** No existing token value changes.
4. **All four areas are live:** Greater London, Birmingham, Manchester, Bristol.
5. **No reviews section.** The three homepage reviews were placeholders, not real customers; presenting them as genuine would breach the DMCC Act 2024 fake-review ban. The section is replaced with "For mechanics" recruitment. A public reviews feed is **parked** (see below).
6. **Only facts.** The ticker's invented figures (4.9 from 8,400+ reviews, 1,200+ mechanics, "most jobs booked within 4 hrs") are replaced with claims the terms and the product back up.
7. **No em dashes** in any user-visible copy: website, consoles, emails, SMS.

No Claude Design pass was needed. The HTML is the reference, and the pattern is written up in `docs/03-design-system.md` → "Marketing page pattern".

## False claims removed

Research against the brief, the terms and the code found these on live pages:

| Claim | Where it was | Why it's wrong |
|---|---|---|
| "DBS-checked" | ticker, hero, comparison, FAQ, `/help` | DBS checks were removed from the platform (`docs/00-working-brief.md:174`) |
| Documents verified "directly with the issuing bodies" | FAQ, `/help`, `/mechanics` ×2 | Automated file checks plus manual admin verification |
| Charged once "you've confirmed it's been done properly" | FAQ, `/help` | The mechanic's completion captures the payment |
| "Cancelling costs you nothing" | `/help` | Cancellation fees apply within 24 hours and once en route |
| "Most jobs booked within about four hours" | `/help`, ticker | No such data |
| "No fix, no fee" | booking price page | An on-site diagnostic fee can apply (Task 37) |
| "We fit genuine or OE-quality parts as standard" | `/help` | Not a documented commitment |
| Payout "once it's approved" | `/help`, `/mechanics` ×2 | Payout follows the mechanic marking the job complete |
| Unqualified "12-month guarantee … no extra charge" | FAQ, `/help` | Terms: 12 months or 12,000 miles on eligible repairs, with exclusions |

The ticker now carries:
- vetted mechanics
- a 12-month warranty on eligible parts and labour
- nothing charged upfront
- your approval for extra work
- manufacturer repair times
- 2-hour arrival windows, 8am to 8pm

Each has its evidence noted in `trust-ticker.tsx`.

## What shipped

**Tokens:**
- **`app/layout.tsx`:** Inter Tight via `next/font/google` (`--font-inter-tight`).
- **`app/globals.css` `@theme`, new tokens:**
  - `--font-display`
  - `--color-surface-dark` `#0b1220`
  - `--shadow-float`
  - `--background-image-brand-gradient-deep`
  - `--animate-ticker` / `--animate-live-pulse` with their keyframes
- **`app/globals.css`, decorative utilities** (not tokens): `hero-glow`, `final-glow`, `coverage-blobs`. `coverage-blobs` is unused since the real map.

**Shared pieces:**
- **`components/ui/section-heading.tsx` (new):** the eyebrow, h2 and lead above every marketing section.
- **`components/ui/customer-nav.tsx`:**
  - sticky and frosted, 68px, cropped logo
  - same five links; Sign in / My account; Book a mechanic
  - `dark` prop removed; `active` optional
- **`footer.tsx`:** redesign layout on `surface-dark`. Content unchanged, except the "Reviews" link, which went with the section.
- **`components/ui/reg-plate-input.tsx`:** additive `size="lg"`.

**Homepage, in order:**
1. **Hero:** our `LiveDispatchCard` on the right; badge "Live in London, Birmingham, Manchester and Bristol".
2. **Trust ticker:** the facts listed above.
3. **Example quote:** labelled "Example quote", figures that add up, no named mechanic.
4. **How it works:** three steps.
5. **Services** (`repairs-preview.tsx`): a dark band, detailed under "Section rhythm and services from the admin" below.
6. **For mechanics** (`mechanic-join.tsx`, new):
   - benefits and requirements matching `/mechanics`, with "Apply now" and "How it works for mechanics" buttons
   - shown as a contained gradient panel
   - the commission rate is never quoted, because it is admin-editable
7. **Comparison:** old way vs Book My Tech, on a light band.
8. **Coverage:**
   - a real UK outline (`uk-outline.ts`: Natural Earth 1:10m, public domain, simplified and projected)
   - four live cities plotted at their real coordinates, with pulsing pins
9. **FAQ:** native `<details>`, answers aligned with the terms.
10. **Final CTA.**
11. **Mobile sticky bar.**

**`reg-lookup-form.tsx`:**
- New `variant` (`card` / `hero` / `final`) and `inputId`.
- Postcode, tracking, lookup and routing are unchanged.

**Deleted:** `trust-strip.tsx`, `why-bmt.tsx`, `reviews.tsx`.

**Site-wide copy:**
- **False claims:** corrected on `/help`, `/mechanics` and the booking price page (table above).
- **Em dashes:** removed from all user-visible strings in about 170 files: the customer web, legal pages (punctuation only), mechanic and admin consoles, email and SMS defaults, push text, and the mobile API error sentences.
  - Page titles use " | ".
  - Placeholders that showed "—" now use words, and never "0": "n/a", "Not set", "Date not set", "Not answered", "No area".
  - Code comments keep their dashes.

## Section rhythm and services from the admin (Brad, 2026-09-15)

Brad's feedback: the quote, how-it-works and services sections blended into one another and felt overwhelming. Each section should look different and keep the reader engaged.

**Section rhythm.** Neighbouring sections never share a treatment:

| # | Section | Treatment |
|---|---|---|
| 1 | Hero | Deep gradient |
| 2 | Ticker | White |
| 3 | Example quote | Pale blue band, faded mark |
| 4 | How it works | White. A numbered, connected timeline (gradient number discs, dashed connectors), not cards |
| 5 | Services | Dark navy, faded mark |
| 6 | Mechanics | Light band holding a contained gradient panel, faded mark |
| 7 | Comparison | White (was dark: two dark blocks would have run together) |
| 8 | Coverage | Default light background |
| 9 | FAQ | White, faded mark |
| 10 | Final CTA | Deep gradient |

**Faded mark.** `components/ui/section-watermark.tsx` puts a large, washed-out Book My Tech mark (`/favicon.png`, the logo without the wordmark) in a section's bottom-right corner:
- 5% opacity on light sections
- inverted, 7% on dark ones

**Services from the admin.** `repairs-preview.tsx` is an async server component. It reads `catalogue_products` with the service-role client (the table is admin-only under RLS) through `loadCatalogueProducts`, together with the hourly rate. It shows:
- **A gateway card, "Book a specific repair":** links to `/book?node=root`, the HaynesPro repair catalogue.
- **One panel per category with active products:** each product is a compact card with its real price (`productBasePence`), and the panel header shows "From £X".
  - Servicing prices read "+ oil", because oil is priced per vehicle.
  - Products switched off in `/admin/services` disappear. A load failure shows the gateway on its own.

**Freshness.** The admin product actions now also `revalidatePath("/")`. The homepage exports `revalidate = 3600` as a backstop (supported without Cache Components; see `node_modules/next/dist/docs/01-app/02-guides/incremental-static-regeneration.md`).

**Deep links through the funnel.** A card's choice survives the reg step. `lib/bookings/start-node.ts` (unit-tested) accepts only `root` or a product category id and builds the breadcrumb. The link then carries through:
- `/book` forwards it to `BookEntry`, and on reg redirects
- `BookEntry` adds `&node=` to the vehicle URL
- the vehicle step adds `&node=&crumbs=` to `/book/repairs`, and "Try a different reg" keeps it

Verified with DV12 CGU: `/book?node=c:diagnostics` lands on "Start / Diagnostics" with the three products priced, and `/book?node=root` on "Start / Repairs". No mobile API change; the app's own funnel is unaffected.

**Layout details:**
- **Phones:** each product is a compact name-and-price row with no summary, so nine products don't stack into a wall of cards.
- **Desktop:** the gateway card keeps its natural height and sticks under the nav while the category panels scroll past, rather than stretching into an empty block. The section uses `overflow-clip`, not `overflow-hidden`, which would stop the card sticking.

**Seeded data:** product summaries and part names come from the database, and some still carried em dashes from their seed migrations. `0068_copy_no_em_dashes.sql` rewrites them (data only). Internal-only seeded text, such as database comments and duration-rule notes, was left alone.

## Parked: a public reviews feed

Brad asked for new reviews to appear on the website automatically, with an admin switch to take any off. With the placeholder section gone, this waits until there are enough real reviews to show. When it's picked up:
- **Migration:** add `reviews.is_public boolean not null default true`. This means a type regen in the customer app; old builds are unaffected, because they select `booking_id, rating` only.
- **Public read:** server-side with the service-role client (anon can't read `reviews`), selecting an allow-list of columns.
  - only reviews with a comment
  - exclude customers with `profiles.deleted_at`, since `bookings.customer_name` survives account deletion
- **Admin:** a "Shown on website" `Switch` column in the existing `/admin/reviews` table, copying `setPromoCodeActive` / `discounts-table.tsx`.
- **Freshness:** `revalidatePath("/")` in `submitReviewFor` and in the toggle action; the homepage moves to ISR.
- **Consent:** the review form should say the review and first name may appear on the website.
- **Open decisions:**
  - whether hidden reviews still count toward `mechanics.rating`
  - whether low ratings publish automatically
  - a real average rating, shown only above a minimum count

## Acceptance criteria

- [x] Homepage follows the redesign's section order and layout at 375 / 768 / 1280 with no horizontal overflow.
- [x] Nav: our links, logo and session-aware Sign in / My account; sticky on `/`, `/help`, `/mechanics` and `/terms`.
- [x] Nav active item: Help on `/help`, For mechanics on `/mechanics`, none on legal pages.
- [x] Mobile drawer opens full height and closes on Escape.
- [x] Hero right column is our GSAP `LiveDispatchCard`.
- [x] Footer carries our content, including Cookie settings, which reopens the consent banner.
- [x] No invented figures or false claims on the homepage, `/help`, `/mechanics` or the booking price page.
- [x] Coverage shows all four cities live on a real UK outline.
- [x] Reviews section replaced with mechanic recruitment.
- [x] Neighbouring sections have distinct treatments; faded mark in the quote, services, mechanics and FAQ sections.
- [x] Services grid lists the active `/admin/services` products with real prices, plus a gateway card into the repair catalogue; admin changes revalidate the homepage.
- [x] A services or gateway card's choice survives reg entry and opens the repair browser at that category (or Repairs).
- [x] Reg lookup from the hero and the final CTA reaches `/book/vehicle?reg=…&postcode=…`. Verified with the real reg DV12 CGU.
- [x] Sticky bar hidden while a lookup form is on screen, shown mid-page; its button focuses the hero reg input.
- [x] Reduced motion stops the ticker, the pulses, the dispatch card and the Reveal entrances.
- [x] H1 renders in Inter Tight (self-hosted by `next/font`).
- [x] No em dash in user-visible copy. Comments keep theirs. Seeded product and part text is rewritten by `0068`, pending apply; admin-customised DB templates are noted above.
- [x] Existing tokens unchanged; new ones documented in `docs/03-design-system.md`.
- [x] `tsc`, eslint on changed files, unit tests and the production build pass; no browser console errors.

## How to verify

1. **Homepage:** at 375px and 1280px, scroll the page, open and close the drawer, use the sticky bar, and look up a real reg with a postcode through to booking.
2. **Other pages:** check `/help`, `/mechanics` and `/terms` for the new nav, and read `/help`'s answers against the terms.
3. **Dashes:** search the rendered page text for "—" on `/`, `/help`, `/mechanics`, a booking and an admin page.

## Mobile app

New design tokens need mirroring in `bmt-customer-app/src/constants/theme.ts`:
- `font-display`: Inter Tight, which the app would need to load
- `BrandGradientDeep`: `['#0B1F52', '#1E3A8A', '#2563EB']`
- `surface-dark`: `#0B1220`
- `shadow-float`: `0 12px 32px rgba(15,23,42,0.10)`

Some mobile API error sentences changed punctuation only; the app shows them verbatim and needs no change. No schema, shape, status or pricing change.

## When complete

- [x] Update this file's status and acceptance boxes.
- [x] Update `docs/HANDOFF.md`.
- [x] Commit on `task-46-homepage-redesign`.
