# Design System

The design language for Book My Tech. Every UI in this codebase — customer, mechanic, admin — uses these tokens and component patterns. No exceptions.

## Brand tokens

### Colours

| Token              | Hex       | Usage                                              |
|--------------------|-----------|----------------------------------------------------|
| `brand-blue`       | `#2563EB` | Primary CTA, active states, brand accents          |
| `brand-blue-dark`  | `#1E3A8A` | Hero gradient start, headings on dark              |
| `brand-blue-light` | `#3B82F6` | Hero gradient end, hover accents                   |
| `surface`          | `#F8FAFC` | Page background                                    |
| `surface-card`     | `#FFFFFF` | Card and panel background                          |
| `border`           | `#E2E8F0` | Default border colour                              |
| `border-subtle`    | `#F1F5F9` | Internal dividers within cards                     |
| `text-primary`     | `#0F172A` | Body text, headings                                |
| `text-secondary`   | `#475569` | Supporting copy                                    |
| `text-muted`       | `#64748B` | Captions, metadata                                 |
| `text-disabled`    | `#CBD5E1` | Disabled, decorative numbers                       |
| `success`          | `#22C55E` | Green check, "available" states                    |
| `warning`          | `#F59E0B` | Pending, surge, attention                          |
| `danger`           | `#EF4444` | Errors, rejected                                   |
| `plate-yellow`     | `#FEF3C7` | UK reg-plate background                            |

### Typography

- **Font family:** Inter on web (`Inter, system-ui, sans-serif`), SF Pro on iOS
- **Heading scale:** 56 / 40 / 32 / 24 / 20 / 18 (font-weight 700–800, letter-spacing -0.025em on display sizes)
- **Body:** 16 / 14 / 13 (line-height 1.5–1.55)
- **Caption / overline:** 11–12 (letter-spacing 0.06em–0.1em, uppercase for overlines)

### Spacing scale

Strict scale, no arbitrary values: **4 / 8 / 12 / 16 / 24 / 32 / 48 / 64** pixels. Maps to Tailwind defaults `1 / 2 / 3 / 4 / 6 / 8 / 12 / 16`.

### Radii

- **Card / panel:** `16px` → `rounded-2xl`
- **Button:** `10px` → `rounded-[10px]` (or extend Tailwind config)
- **Input:** `8px` → `rounded-lg`
- **Pill / tag:** `999px` → `rounded-full`
- **Inner element (icon tile, etc.):** `10–12px`

### Shadows

- **Card:** `0 4px 20px rgba(0,0,0,0.05)` → custom shadow class `shadow-card`
- **Floating hero card:** `0 20px 60px rgba(15,23,42,0.25)` → `shadow-hero`
- **Focused input:** blue border + soft outer shadow

### Layout

- Max content width: `1200px`
- Mobile-first breakpoint: `375px`
- Grid: 12-column with `gap-4` (16px) default

## Tailwind config

The tokens above should be encoded in `tailwind.config.ts` so they're referenced by name throughout the codebase. Use this as the base — extend rather than replace defaults:

```ts
// tailwind.config.ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          blue: "#2563EB",
          "blue-dark": "#1E3A8A",
          "blue-light": "#3B82F6",
        },
        surface: {
          DEFAULT: "#F8FAFC",
          card: "#FFFFFF",
        },
        border: {
          DEFAULT: "#E2E8F0",
          subtle: "#F1F5F9",
        },
        text: {
          primary: "#0F172A",
          secondary: "#475569",
          muted: "#64748B",
          disabled: "#CBD5E1",
        },
        success: "#22C55E",
        warning: "#F59E0B",
        danger: "#EF4444",
        "plate-yellow": "#FEF3C7",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      borderRadius: {
        button: "10px",
      },
      boxShadow: {
        card: "0 4px 20px rgba(0,0,0,0.05)",
        hero: "0 20px 60px rgba(15,23,42,0.25)",
      },
      backgroundImage: {
        "brand-gradient":
          "linear-gradient(135deg, #1E3A8A 0%, #2563EB 60%, #3B82F6 100%)",
      },
      maxWidth: {
        content: "1200px",
      },
    },
  },
  plugins: [],
};

export default config;
```

## Core components

These primitives live in `components/ui/`. They are extracted from the proposal JSX (added to `/proposal/` in the repo) and re-implemented in Tailwind. Every screen composes from these — no screen should ship inline styles or one-off colours.

### `Button`

Variants: `primary` (solid brand blue), `secondary` (outlined brand blue), `ghost` (text-only). Optional `iconLeft` / `iconRight` slot. Padding `12px / 20px`, radius `10px`.

### `Card`

White surface, `16px` radius, `shadow-card`. Default padding `24px`. Accepts children. Optional `padded={false}` for cards that want custom internal layout.

### `Pill` (a.k.a. tag, badge)

`999px` radius, light tinted background, matching coloured text. Tones: `blue` (default/active), `green` (success), `amber` (pending), `red` (error), `dark` (on dark surfaces). Optional `dot` prop for a leading status dot.

### `Input`

`48px` tall, `8px` radius, neutral border. Focused state: blue border + soft outer shadow. Used for postcode, search, free-text fields.

### `RegPlateInput`

UK number plate styling: yellow (`#FEF3C7`) background, dark border, monospace-ish letter-spacing, GB badge on the left (blue square with white "GB" text). Used in the hero and the booking flow step 1.

### `Icon`

Wrapper around `lucide-react`. Takes `name`, `size`, `color` props. Centralises icon usage so every screen renders icons consistently.

### `Avatar`

Circular avatar with initials fallback. Accepts `name`, `size`, `tint` (for varied background colours when stacked).

### `Stars`

Star rating display. Accepts `value` (0–5) and `size`. Used in mechanic cards and reviews.

### `Overline`

Small uppercase eyebrow text above section headings. Brand-blue, letter-spacing `0.1em`, weight 700.

### `TrustBadge`

Used in the trust strip below the hero. Icon + value + label, horizontal layout. Accepts `icon`, `value`, `label`.

### `CustomerNav`

Top navigation for customer pages. Accepts `active` (current page name) and `dark` (boolean — uses light text on dark hero backgrounds).

## UX principles (from the brief)

These shape every screen, not just the components:

- **Booking must feel instant** — no spinners where they can be avoided, optimistic UI where safe
- **One decision per screen** — no overloaded multi-question forms
- **Progress is always shown** — step indicators for any multi-step flow
- **Pricing is surfaced early** — no hidden fees, total visible before commit
- **Mobile-first** — every screen designed for 375px first, then scaled up
- **Short copy, clear hierarchy, generous whitespace** — cognitive load stays low

## Where the components come from

The proposal folder contains JSX mockups of every screen. The components above are extracted from those mockups during the "extract components" task. The mockups use inline styles; the extracted Tailwind versions are the canonical implementations from that point forward.

Original mockup JSX is preserved in `/proposal/` for reference but is not imported by the app. The app only imports from `components/ui/` and the section-specific folders.
