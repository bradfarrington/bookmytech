# Task 46 — Homepage redesign

**Status:** ✅ Complete (2026-09-15). The homepage follows `proposal/homepage-redesign.html`, keeping our nav links, our live dispatch animation in the hero, and our footer content. The new sticky, frosted nav is on every page that shares it (`/`, `/help`, `/mechanics`, the legal pages). The redesign's new styles are **additive** design tokens, and the redesign's invented claims have been rewritten. Deviations from the plan: the nav renders from `page.tsx` rather than inside `hero.tsx`, and the mobile drawer renders outside the `<header>` (backdrop-filter would otherwise clip it to the bar). **No migration. No `app/api/mobile/**` change.** The mobile app needs to mirror the new tokens (see "Mobile app").

**Open before this goes live (Brad):**
- Confirm the areas: Greater London live; Manchester, Birmingham and Bristol coming soon. The Coverage section and the FAQ both say this.
- Confirm the three reviews and the headline figures (1,200+ mechanics, 4.9 from 8,400+ reviews). They are carried over unchanged from the old homepage.

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
3. **Additive tokens.** The redesign's styles become new tokens. No existing token value changes, so the booking flow, dashboard and admin don't move.

No Claude Design pass was needed. The HTML is the reference, and the pattern is written up in `docs/03-design-system.md` → "Marketing page pattern".

## What shipped

**Tokens:**
- **`app/layout.tsx`:** Inter Tight via `next/font/google` (`--font-inter-tight`).
- **`app/globals.css` `@theme`, new tokens:**
  - `--font-display`
  - `--color-surface-dark` `#0b1220`
  - `--shadow-float`
  - `--background-image-brand-gradient-deep`
  - `--animate-ticker` / `--animate-live-pulse` with their keyframes
- **`app/globals.css`, decorative utilities** (not tokens): `hero-glow`, `final-glow`, `coverage-blobs`.

**Shared pieces:**
- **`components/ui/section-heading.tsx` (new):** the eyebrow, h2 and lead above every marketing section.
- **`components/ui/customer-nav.tsx`:**
  - sticky and frosted, 68px, content inside `max-w-content`
  - same five links; Sign in / My account and Book a mechanic
  - the mobile drawer is kept
  - the `dark` prop is removed, and `active` is genuinely optional, so legal pages no longer highlight "Book"
  - `/help`, `/mechanics` and `legal-page.tsx` render it above their hero instead of inside it
- **`app/(customer)/_components/footer.tsx`:**
  - redesign layout on `surface-dark`, inside `max-w-content`
  - **content unchanged:** columns, links, socials, Cookie settings, company line
- **`components/ui/reg-plate-input.tsx`:** additive `size="lg"`, the 60px marketing plate. The default is unchanged for the booking flow and admin.

**Homepage, in the redesign's order:**
1. **`hero.tsx`:** deep gradient, badge, display h1, glass lookup box, and our `LiveDispatchCard` on the right.
2. **`trust-ticker.tsx`:** replaces `trust-strip.tsx`, with the same figures.
3. **`quote-showcase.tsx` (new):**
   - a card labelled "Example quote" whose lines add up
   - pre-authorised, and extra work only with approval
   - "Sent to vetted mechanics near you — the first to accept takes the job"
4. **`how-it-works.tsx`:** three true steps. The `#how-it-works` anchor is kept.
5. **`repairs-preview.tsx`:**
   - "From £59.99" diagnostics and "From £72.99" inspections, the live seed prices in `0060`
   - everything else "Priced for your car"; servicing products are inactive placeholders
   - a scroll-snap carousel below 561px
6. **`reviews.tsx`:** our three reviews in the redesign's cards; no source badges.
7. **`compare.tsx`:** replaces `why-bmt.tsx`. A dark old-way vs Book My Tech comparison, every line true of the product.
8. **`coverage.tsx` (new):** London live, three coming soon, no counts; "Check your postcode" focuses the hero reg input.
9. **`faq.tsx`:** native `<details>` (no client JS). The same six questions, with the areas answer aligned to Coverage.
10. **`final-cta.tsx`:** deep gradient plus the `final` lookup box.
11. **`sticky-book-bar.tsx` (new):** mobile only. It hides while a lookup form or the footer is on screen, and focuses the hero reg input.

**`reg-lookup-form.tsx`:**
- New `variant` (`card` / `hero` / `final`) and `inputId`.
- **The postcode field, `track()` event, server action, modal and routing are unchanged.**

**Deleted:** `trust-strip.tsx`, `why-bmt.tsx`. Only the homepage imported them.

## Acceptance criteria

- [x] Homepage follows the redesign's section order and layout at 375 / 768 / 1280 with no horizontal overflow.
- [x] Nav: our links, logo and session-aware Sign in / My account; sticky while scrolling on `/`, `/help`, `/mechanics` and `/terms`.
- [x] Nav active item: Help on `/help`, For mechanics on `/mechanics`, none on legal pages.
- [x] Mobile drawer opens full height and closes on Escape.
- [x] Hero right column is our GSAP `LiveDispatchCard`.
- [x] Footer carries our full content, including Cookie settings, which reopens the consent banner.
- [x] No invented claims (see Decisions §2); "from" prices only where a live product has one.
- [x] Reg lookup from the hero and the final CTA reaches `/book/vehicle?reg=…&postcode=…`. Verified with the real reg DV12 CGU: both land on `/book/vehicle?reg=DV12%20CGU&postcode=SW1A%201AA`.
- [x] Sticky bar hidden while a lookup form is on screen, shown mid-page; its button focuses the hero reg input.
- [x] Reduced motion stops the ticker, the pulse, the dispatch card and the Reveal entrances.
- [x] H1 renders in Inter Tight (self-hosted by `next/font`).
- [x] Existing tokens unchanged; new ones documented in `docs/03-design-system.md`.
- [x] `tsc`, eslint on changed files, 480 unit tests and the production build pass; no browser console errors.

## How to verify

1. With a dev server running, run the browser script used for this task (screenshots plus 21 checks). Set `REG` to a registration DVLA knows; `.env.local` has a live DVLA key, so the stub plates don't resolve.
2. By hand at 375px:
   - scroll the homepage, open and close the drawer
   - use the sticky bar
   - look up a real reg with a postcode and continue to booking
3. Check `/help`, `/mechanics` and `/terms` for the new nav above an otherwise unchanged page.

## Mobile app

New design tokens need mirroring in `bmt-customer-app/src/constants/theme.ts`:
- `font-display`: Inter Tight, which the app would need to load
- `BrandGradientDeep`: `['#0B1F52', '#1E3A8A', '#2563EB']`
- `surface-dark`: `#0B1220`
- `shadow-float`: `0 12px 32px rgba(15,23,42,0.10)`

No existing token changed; no API, schema, booking status or pricing change.

## When complete

- [x] Update this file's status and acceptance boxes.
- [x] Update `docs/HANDOFF.md`.
- [x] Commit on `task-46-homepage-redesign`.
