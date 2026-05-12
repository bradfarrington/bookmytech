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

## Tailwind v4 setup (CSS-first)

This project uses Tailwind v4, which reads design tokens from CSS variables under an `@theme` block in `app/globals.css`. There is NO `tailwind.config.ts` — adding one is a no-op.

The variable prefix determines the utility namespace:

| Variable prefix | Utility shape |
|---|---|
| `--color-<name>` | `bg-<name>`, `text-<name>`, `border-<name>` |
| `--font-<name>` | `font-<name>` |
| `--radius-<name>` | `rounded-<name>` |
| `--shadow-<name>` | `shadow-<name>` |
| `--background-image-<name>` | `bg-<name>` |
| `--container-<name>` | `max-w-<name>` (and the `container` queries) |

The current `app/globals.css` defines:

```css
@import "tailwindcss";

@theme {
  /* Brand */
  --color-brand-blue: #2563eb;
  --color-brand-blue-dark: #1e3a8a;
  --color-brand-blue-light: #3b82f6;

  /* Surfaces */
  --color-surface: #f8fafc;
  --color-surface-card: #ffffff;

  /* Borders */
  --color-border: #e2e8f0;
  --color-border-subtle: #f1f5f9;

  /* Text */
  --color-text-primary: #0f172a;
  --color-text-secondary: #475569;
  --color-text-muted: #64748b;
  --color-text-disabled: #cbd5e1;

  /* Status */
  --color-success: #22c55e;
  --color-warning: #f59e0b;
  --color-danger: #ef4444;

  /* Plate */
  --color-plate-yellow: #fef3c7;

  /* Typography — Inter is bound to --font-inter in app/layout.tsx */
  --font-sans: var(--font-inter), Inter, ui-sans-serif, system-ui, sans-serif;

  /* Radii */
  --radius-button: 10px;

  /* Shadows */
  --shadow-card: 0 4px 20px rgba(15, 23, 42, 0.05);
  --shadow-hero: 0 20px 60px rgba(15, 23, 42, 0.25);

  /* Gradients */
  --background-image-brand-gradient: linear-gradient(
    135deg, #1e3a8a 0%, #2563eb 60%, #3b82f6 100%
  );

  /* Layout */
  --container-content: 1200px;
}
```

Adding a new token? Add a CSS variable inside `@theme`. The corresponding Tailwind utility is generated on next build.

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

Small uppercase eyebrow text above section headings. Defaults to `text-muted` slate (matches the proposal); section-specific overlines (e.g. "How it works") apply `className="text-brand-blue"` to override. Letter-spacing `0.1em`, weight 700.

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
