# Fonts & Text Theme

Consistent typography for the web app using the existing Geist font setup and Tailwind defaults. Includes font families, a pragmatic type scale, line heights, weights, letter spacing, usage guidance, and drop‑in CSS variables.

## Font Families
- `--font-sans`: Geist Sans via `next/font`
- `--font-mono`: Geist Mono via `next/font`

## Type Scale (rem + approx px)
- `--fs-xs`: 0.75rem (12px)
- `--fs-sm`: 0.875rem (14px)
- `--fs-base`: 1rem (16px)
- `--fs-lg`: 1.125rem (18px)
- `--fs-xl`: 1.25rem (20px)
- `--fs-2xl`: 1.5rem (24px)
- `--fs-3xl`: 1.875rem (30px)
- `--fs-4xl`: 2.25rem (36px)
- `--fs-5xl`: 3rem (48px)

## Line Heights
- `--lh-tight`: 1.2
- `--lh-snug`: 1.3
- `--lh-normal`: 1.5
- `--lh-relaxed`: 1.65

## Font Weights
- `--fw-light`: 300
- `--fw-regular`: 400
- `--fw-medium`: 500
- `--fw-semibold`: 600
- `--fw-bold`: 700

## Letter Spacing
- `--tracking-tight`: -0.01em
- `--tracking-normal`: 0
- `--tracking-wide`: 0.02em

## CSS Variables (drop in `:root`)

```css
:root {
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);

  --fs-xs: 0.75rem;
  --fs-sm: 0.875rem;
  --fs-base: 1rem;
  --fs-lg: 1.125rem;
  --fs-xl: 1.25rem;
  --fs-2xl: 1.5rem;
  --fs-3xl: 1.875rem;
  --fs-4xl: 2.25rem;
  --fs-5xl: 3rem;

  --lh-tight: 1.2;
  --lh-snug: 1.3;
  --lh-normal: 1.5;
  --lh-relaxed: 1.65;

  --fw-light: 300;
  --fw-regular: 400;
  --fw-medium: 500;
  --fw-semibold: 600;
  --fw-bold: 700;

  --tracking-tight: -0.01em;
  --tracking-normal: 0;
  --tracking-wide: 0.02em;
}
```

## Usage Guidance
- Headings: `--fs-3xl/--fs-4xl`, `--lh-tight`, `--fw-bold`, `--tracking-tight`, `font-sans`.
- Subheads: `--fs-xl/--fs-2xl`, `--lh-snug`, `--fw-semibold`, `font-sans`.
- Body: `--fs-base` (or `--fs-lg` for readability), `--lh-relaxed`, `--fw-regular`, `font-sans`.
- Meta/captions: `--fs-sm` or `--fs-xs`, `--lh-normal`, `--fw-medium` for labels.
- Code/UI monospace: `font-mono`, `--fs-sm` or `--fs-base`, `--lh-normal`.
- Buttons: label `--fs-base`, `--fw-medium` or `--fw-semibold`, `--lh-tight`, slight `--tracking-normal`.

## Tailwind Mapping (existing utilities)
- Families: `font-sans` (Geist Sans), `font-mono` (Geist Mono).
- Sizes: `text-xs` → `text-5xl` align with the scale above.
- Weights: `font-light` → `font-bold`.
- Leading: `leading-tight` / `leading-snug` / `leading-normal` / `leading-relaxed`.
- Tracking: `tracking-tight` / `tracking-normal` / `tracking-wide`.