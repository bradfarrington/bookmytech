# Task 29 — Publish Brad's legal documents; cookie consent; acceptance links

**Status:** ✅ Complete (2026-09-07) — merged to `main` 2026-09-07 (branch `task-29-legal-documents`). No migration, no mobile API change. `tsc` clean, 259 unit tests (unchanged), lint clean on every touched file, rendered pages word-diffed against the source documents. Deviations from the spec: none beyond the owner decisions listed below.

## Why this exists

Brad supplied four authoritative legal documents (all "Last updated: 26 August 2026"): Customer
Terms & Conditions, Mechanic Terms & Conditions, Privacy Policy and Cookie Policy. They replace
the hand-written policy pages from Task 12. The source `.odt` files now live in
[`docs/legal/`](../legal/README.md).

## Owner decisions (Brad, 2026-09-07)

- **Cancellation fees on `/terms` are the three live tiers, not the document's four.** The
  document lists "on the day £50"; the platform has no such tier (a same-day cancel not yet en
  route is charged the within-24-hours fee). The table and summary render from `cancelFeeTiers()`
  exactly as `/cancellation-policy` does, and the "on the day" row is omitted. §22 now says
  rescheduling is free, matching the code.
- **Marketing copy stays "12-month guarantee".** Only the legal pages carry the document's
  "12 months / 12,000 miles, whichever occurs first".
- **`/mechanic-agreement` is replaced outright by the Mechanic T&Cs.** The previous page's
  operational rules (Stripe Connect payouts, payout snapshot at booking, negative-balance
  recovery, first-to-accept dispatch, document-lapse suspension, resolution centre) are no
  longer published anywhere. The document's "Entire Agreement" clause allows separate commercial
  terms if they are wanted back later.
- **In scope as extras:** cookie consent banner, "you agree to" links at signup / mechanic apply /
  booking confirm, company number and registered office in the footer.

## What shipped

### Legal pages

- `app/(customer)/_components/legal-page.tsx` — `LegalSection` gains `blocks?: LegalBlock[]`
  (`p`, `h3`, `bullets`, `numbered`, `table`, `address`, `promise`) and the page an optional
  `preamble`. Existing `body` / `bullets` still work, so `/cancellation-policy` is untouched. The
  contents list collapses into a `<details>` on phones (60-section documents would otherwise push
  the copy below the fold) and runs three columns on desktop.
- One `content.ts` per route, one `LegalSection` per numbered document section so the on-page
  numbers match the documents. Each module's header comment lists its deviations from the source.
  - `/terms` — `buildSections(tiers)`, page `force-dynamic`. Title "Customer Terms & Conditions".
  - `/mechanic-agreement` — `buildSections(takeRate)`, page `force-dynamic`: the §25 worked
    example (£200 booking) is computed from `platform_settings.take_rate_base` via
    `getTakeRateBase()`. One added sentence says a different agreed rate applies where Book My
    Tech has agreed one (Pro tier). Title "Mechanic Terms & Conditions". URL unchanged.
  - `/privacy`, `/cookies` — static. The cookie policy's §7 and §9 describe the real banner and
    §17 lists the cookies actually in use (Supabase auth, `bmt_consent`, `bmt_sid`, Stripe).
- Drafting notes in the documents are not published: the "Important: …" preamble notes in the
  cookie and privacy policies, and the "should be reviewed / should list" lines in cookie §15 and
  §17.

### Cookie consent

- `components/cookie-consent.tsx` — bottom banner, "Accept all" / "Reject non-essential", mounted
  once in `app/layout.tsx`. Reads the cookie client-side via `useSyncExternalStore` (calling
  `cookies()` in the root layout would have made every route dynamic). `CookieSettingsLink` in the
  footer re-opens it.
- `app/actions/cookie-consent.ts` — writes `bmt_consent` (12 months, not httpOnly) and, on
  "rejected", deletes the httpOnly `bmt_sid`. The banner also writes the cookie client-side as a
  fallback so it stays dismissed if the action fails.
- `app/actions/track-event.ts` — `bmt_sid` is only minted, and an existing one only honoured, when
  `bmt_consent=accepted`. Otherwise each event gets a throwaway id, so it still lands but visits are
  not linked. Shared constants in `lib/cookie-consent.ts`.

### Links and footer

- Footer: "Mechanic terms" label, "Cookie settings" link, and a full-width line with the company
  number and registered office under the bottom bar.
- Help page link labels match the new titles.
- Agreement lines (links only, no checkbox, no column): under "Create account" on customer signup,
  under "Submit application" on the mechanic apply review step, and appended to the pre-auth
  microcopy on the booking confirm step.

## Acceptance criteria

- [x] `/terms`, `/privacy`, `/cookies`, `/mechanic-agreement` render every numbered section of the
      matching document, in order, with matching numbers
- [x] No drafting notes visible on any page
- [x] Cancellation figures on `/terms` come from `platform_settings` (same source as
      `/cancellation-policy` and `cancelBooking`)
- [x] Platform-fee worked example on `/mechanic-agreement` comes from `take_rate_base`
- [x] Existing URLs unchanged; footer, help page and checkout links resolve
- [x] Cookie banner shows on first visit, stores the choice for 12 months, can be re-opened from
      the footer
- [x] `bmt_sid` is never set without "Accept all"; "Reject non-essential" deletes an existing one
- [x] Agreement lines with working links at signup, mechanic apply and booking confirm
- [x] Footer shows company number and registered office
- [x] Source documents stored in `docs/legal/` with a README on how to update
- [x] `tsc` clean, tests pass, lint clean on touched files

## How to verify

1. `npm run dev`; open the four pages. Compare the "On this page" list against the document's
   numbered sections. Check the tables scroll at 375px and the contents list is collapsed there.
2. `/admin/pricing`: change the within-24h cancellation fee, reload `/terms` §20 and §58; change the
   base take rate, reload `/mechanic-agreement` §25.
3. Incognito: banner appears. "Reject non-essential", then walk `/book`: no `bmt_sid` in DevTools →
   Application → Cookies; `funnel_events` rows for the visit have differing `session_id`s. Clear
   cookies, "Accept all", repeat: one `bmt_sid`, one `session_id`. Footer "Cookie settings"
   re-opens the banner.
4. `/signup`, `/mechanics/apply/review`, booking confirm step: agreement lines present, links open
   in a new tab.

## Mobile app impact

None on any contract: no migration, no change under `app/api/mobile`. Legal URLs unchanged.
`bmt_sid` gating is a web server action only. If the app's own screens quote the mechanic
operational rules that were on the old `/mechanic-agreement` (negative balances, payout timing),
they no longer have a public page to link to.

## When complete

- [x] `docs/HANDOFF.md` updated, current task set
- [x] `docs/tasks/12-disputes-polish-launch.md` GDPR line split; privacy policy ticked
- [x] Commit on `task-29-legal-documents`
