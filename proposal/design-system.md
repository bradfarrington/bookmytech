# Book My Tech — Design System

Trusted, fast, transparent vehicle repair marketplace.
Tone: Professional, modern, frictionless, trustworthy.

---

## 1. Brand Foundation

| | |
|---|---|
| **Brand** | Book My Tech |
| **Positioning** | Trusted, fast, transparent vehicle repair marketplace |
| **Tone** | Professional, modern, frictionless, trustworthy |

---

## 2. Colour System

### Primary
| Token | Hex | Usage |
|---|---|---|
| `--color-primary` | `#2563EB` | Actions, CTAs, highlights |
| `--color-primary-dark` | `#1E3A8A` | Headers, strong elements |
| `--color-primary-accent` | `#3B82F6` | Hover states, links |

### Neutrals
| Token | Hex | Usage |
|---|---|---|
| `--color-text` | `#0F172A` | Main text |
| `--color-text-secondary` | `#334155` | Secondary text |
| `--color-border` | `#E2E8F0` | Borders, dividers |
| `--color-background` | `#F8FAFC` | Main UI background |
| `--color-surface` | `#FFFFFF` | Cards, surfaces |

### Status
| Token | Hex | Usage |
|---|---|---|
| `--color-success` | `#22C55E` | Confirmation, completed jobs |
| `--color-warning` | `#F59E0B` | Pending, attention needed |
| `--color-error` | `#EF4444` | Failures, destructive actions |

---

## 3. Typography

**Font family:** Inter (web) / SF Pro (iOS) — clean modern sans-serif.

| Style | Size | Weight |
|---|---|---|
| H1 | 48px | Bold (700) |
| H2 | 36px | SemiBold (600) |
| H3 | 28px | SemiBold (600) |
| H4 | 22px | Medium (500) |
| Body Large | 18px | Regular (400) |
| Body | 16px | Regular (400) |
| Small | 14px | Regular (400) |

- **Line height:** 1.4–1.6
- **Letter spacing:** -1% (tight) on headings, normal on body

---

## 4. Layout System

### Grid
- 12-column grid
- Max content width: **1200px**
- Container padding: **24px** desktop / **16px** mobile

### Spacing scale (px)
`4 · 8 · 12 · 16 · 24 · 32 · 48 · 64`

Use only these values. No arbitrary spacing.

---

## 5. UI Components

### Buttons
| Variant | Background | Text | Border |
|---|---|---|---|
| Primary | `#2563EB` | `#FFFFFF` | none |
| Secondary | `#FFFFFF` | `#2563EB` | `1px solid #2563EB` |

- Radius: `10px`
- Padding: `12px 20px`
- Hover: lift to `--color-primary-accent` / subtle shadow

### Inputs (booking flow critical)
- Height: `48px`
- Border: `1px solid #E2E8F0`
- Radius: `8px`
- Focus: blue border (`#2563EB`) + soft outer shadow
- Padding: `12px 16px`

### Cards
- Background: `#FFFFFF`
- Radius: `16px`
- Shadow: `0 4px 20px rgba(0, 0, 0, 0.05)`
- Padding: `24px`

Used for: job listings, mechanic profiles, booking steps.

### Tags / Labels
- Rounded pill (`border-radius: 999px`)
- Light tinted background + matching coloured text
- Padding: `4px 12px`
- Used for: job status, service type, availability

Suggested pairings:
| Type | Background | Text |
|---|---|---|
| Active | `#DBEAFE` | `#1E3A8A` |
| Success | `#DCFCE7` | `#15803D` |
| Pending | `#FEF3C7` | `#B45309` |
| Error | `#FEE2E2` | `#B91C1C` |

---

## 6. UX Principles

1. **Booking must feel instant and effortless.**
2. **No step should feel confusing or overloaded** — one decision per screen where possible.
3. **Always show progress** — step 1 → 2 → 3 indicators.
4. **Pricing must feel transparent and trustworthy** — surface totals early, no hidden fees.
5. **Mobile-first** — design at 375px, scale up.
6. **Reduce cognitive load** — short copy, clear hierarchy, generous whitespace.

---

## 7. Frontend Screens

- Homepage (hero + how it works + trust)
- Booking flow (multi-step, with progress indicator)
- Pricing screen
- Confirmation screen
- Customer dashboard (job tracking)
- Review screen

---

## 8. Backend / System Screens

### Mechanic Dashboard
- Available jobs list
- Accept / decline actions
- Earnings overview
- Job history

### Admin Dashboard
- Job monitoring table
- Mechanic approval system
- Document review interface
- Pricing controls
- Analytics overview

---

## 9. Files in this design system

- [design-system.md](design-system.md) — this document
- [tokens.css](tokens.css) — CSS custom properties, drop into any project
- [tailwind.config.js](tailwind.config.js) — Tailwind preset using the same tokens
