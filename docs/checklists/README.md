# Checklists — source documents

Gareth's documents from his change-list email of 2026-09-08 (Task 32). These are the
**source of truth** for the seed in `supabase/migrations/0061_checklists.sql`; the admin
editor at `/admin/services/checklists` is where they are changed afterwards.

| File | What | Seeded as |
|---|---|---|
| `interim-service.odt` | "Interim Service Checklist" — 46 lines | `checklists.key = interim_service`, 46 items, one section |
| `full-service.odt` | "Full Service Checklist" — 56 lines | `full_service`, 56 items |
| `major-service.odt` | "Major Service Checklist" — 66 lines | `major_service`, 66 items |
| `pre-purchase-inspection.odt` | The inspection sheet: 10 sections, Bronze / Silver / Gold columns, prices, and the Pass / Advisory / Fail / Not Checked scale | `pre_purchase_inspection`, 173 items — Bronze 64, Silver 116, Gold 173 |
| `gareth-change-list-2026-09-08.odt` | The twelve-item list itself | — (planned as Tasks 30–35) |

## How the seed was generated

1. Extract each `.odt` to text (LibreOffice's `content.xml`, tags stripped, table cells
   joined with ` | `) into a folder of `.txt` files named `Interim_service.txt`,
   `full_service.txt`, `major_service.txt`, `pre_purchase_inspection3.txt`.
2. `node scripts/generate-checklist-seed.mjs <that folder> > seed.sql` — strips the
   numbering, trailing punctuation and the "N point check" footer, fixes the run-together
   words in the documents ("Replaceoil", "Checktread", "modulescan" …), Americanisms
   ("tire" → "tyre", "windshield" → "windscreen"), reads the y / blank tier columns, and
   prints idempotent `insert … on conflict do nothing` statements. It prints the counts to
   stderr so they can be checked against Gareth's.
3. The output was pasted into `0061` under "Seed (generated)".

## Decisions

- **Service items are one flat section** ("Checks"). Gareth's lists mix headings ("Battery
  Check", "Tires and Wheels") with checks and count them all ("46 point check"), so every
  line is an item to match his numbers. The admin can move items into sections in the editor.
- **The inspection's scale is the sheet's** — Pass / Advisory / Fail / Not Checked — not the
  email's "good, fair, poor, na". Flagged to Gareth.
- Wording is Gareth's, spelling fixed; nothing added or removed.
