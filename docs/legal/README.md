# Legal documents — source of record

The four `.odt` files here are Brad's authoritative legal documents (all "Last updated:
26 August 2026"). The website's policy pages are **hand-converted** from them:

| Document | Published at | Content module |
|---|---|---|
| `customer-terms.odt` | `/terms` | `app/(customer)/terms/content.ts` |
| `mechanic-terms.odt` | `/mechanic-agreement` | `app/(customer)/mechanic-agreement/content.ts` |
| `privacy-policy.odt` | `/privacy` | `app/(customer)/privacy/content.ts` |
| `cookie-policy.odt` | `/cookies` | `app/(customer)/cookies/content.ts` |

Each content module starts with a comment listing every place the published page
deliberately deviates from the document (live fee figures, the dropped "on the day"
cancellation row, the cookie inventory, stripped drafting notes). Keep that comment honest.

## When a document changes

1. Replace the `.odt` here.
2. Extract the text (no pandoc on the Mac; `unzip -p file.odt content.xml` and walk the
   `text:p` / `text:list` / `table:table` elements — the script used for the first conversion
   is described in Task 29).
3. Update the matching `content.ts` section by section, keeping one `LegalSection` per numbered
   section so the on-page numbering matches the document.
4. Re-apply the deviations listed at the top of the module, and update the `lastUpdated`
   string in the route's `page.tsx`.

## Rule that must not be broken

Figures the platform actually charges (cancellation fee tiers, the platform take rate) are
rendered from `platform_settings`, never typed into the content. A published policy that
disagrees with what a customer or mechanic is really charged is worse than no policy page.
