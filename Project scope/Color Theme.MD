# Color Theme

Nice — I pulled the app UI assets you uploaded (example: sandbox:/mnt/data/discoverDASHBOARD DESIGN.png) and used their look/feel to craft matching Light and Dark mode color themes.

Below you’ll find two ready-to-use design palettes (hex + token names), suggested usages, accessibility notes, and a tiny CSS variable snippet you can drop into your app.

## Light Mode — Theme (primary, friendly, warm-modern)

### Palette (hex + brief role)
- `--brand-primary` — `#FF5A7A` — Primary CTA, active states (warm coral)
- `--brand-primary-700` — `#E84B67` — Hover / pressed
- `--brand-secondary` — `#2F80ED` — Secondary actions, links (blue)
- `--accent` — `#FFD166` — Accent / highlights (amber)
- `--surface` — `#FFFFFF` — App background / cards
- `--surface-2` — `#F6F8FB` — Raised cards / panels
- `--muted` — `#F2F4F8` — Subtle backgrounds / dividers
- `--text-primary` — `#0F1724` — Primary text (very dark)
- `--text-secondary` — `#6B7280` — Secondary text / meta
- `--border` — `#E6E9EE` — Borders / separators
- `--success` — `#16A34A` — Success states
- `--error` — `#EF4444` — Error states
- `--info` — `#0EA5E9` — Informational chips/badges
- `--shadow` — `rgba(16,24,40,0.06)` — subtle elevation shadow

### Light-mode usage guidance
- Header / primary CTA: `--brand-primary` with white text.
- Secondary buttons / links: `--brand-secondary`.
- Card background: `--surface-2` with `--text-primary`.
- Page background: `--surface`.
- Dividers/borders: `--border` (1px).
- Muted UI (disabled states, placeholders): `--text-secondary` on `--muted`.
- Icons / badges: `--accent` for attention, `--info` and `--success` for status.

## Dark Mode — Theme (same personality, tuned for contrast)

### Palette (hex + brief role)
- `--brand-primary` — `#FF8AA6` — Primary CTA (lighter coral for dark backgrounds)
- `--brand-primary-700` — `#FF6F8D` — Hover / pressed
- `--brand-secondary` — `#7FB3FF` — Secondary actions / links
- `--accent` — `#FFCF7A` — Accent highlights (warmer amber)
- `--surface` — `#0B1020` — App background (deep navy)
- `--surface-2` — `#0F1724` — Cards / panels (slightly lighter)
- `--muted` — `#0F2133` — Muted panel / inset backgrounds
- `--text-primary` — `#E6EEF8` — Primary text (light)
- `--text-secondary` — `#9AA4B2` — Secondary text
- `--border` — `#163147` — Borders / separators
- `--success` — `#34D399` — Success states (bright green)
- `--error` — `#FF7A7A` — Error states
- `--info` — `#67D3FF` — Informational chips
- `--shadow` — `rgba(2,6,23,0.6)` — soft dark glow for elevation

### Dark-mode usage guidance
- Buttons: Filled primary = `--brand-primary` text `--text-primary`. Outline buttons: transparent bg, `--brand-primary` border.
- Cards: `--surface-2` with subtle inner shadow.
- Page background: `--surface`.
- Dividers: `--border` at 1px, use slightly lighter when you need stronger separation.

## Accessibility & contrast notes

- Primary combos are chosen to meet WCAG AA for normal text on their respective backgrounds in typical UI sizes. For small text (<18px / normal weight) double-check contrast — if below 4.5:1 increase darkness of text or shift primary slightly (e.g., brand-primary → `#E54764` for Light).
- Always test button text on hovered/pressed states. Provide focus ring: `box-shadow: 0 0 0 3px rgba(47,128,237,0.18)` for accessibility (focus visible).

## Tokens + example CSS variables (drop in `:root` / `[data-theme="dark"]`)

```css
:root {
  /* Light Theme */
  --brand-primary: #FF5A7A;
  --brand-primary-700: #E84B67;
  --brand-secondary: #2F80ED;
  --accent: #FFD166;
  --surface: #FFFFFF;
  --surface-2: #F6F8FB;
  --muted: #F2F4F8;
  --text-primary: #0F1724;
  --text-secondary: #6B7280;
  --border: #E6E9EE;
  --success: #16A34A;
  --error: #EF4444;
  --info: #0EA5E9;
  --shadow: rgba(16,24,40,0.06);
  --radius: 12px;
}

/* Dark */
[data-theme="dark"] {
  --brand-primary: #FF8AA6;
  --brand-primary-700: #FF6F8D;
  --brand-secondary: #7FB3FF;
  --accent: #FFCF7A;
  --surface: #0B1020;
  --surface-2: #0F1724;
  --muted: #0F2133;
  --text-primary: #E6EEF8;
  --text-secondary: #9AA4B2;
  --border: #163147;
  --success: #34D399;
  --error: #FF7A7A;
  --info: #67D3FF;
  --shadow: rgba(2,6,23,0.6);
  --radius: 12px;
}
```

## Quick component examples (rules of thumb)

- Primary button (filled): background `--brand-primary`, color: `#fff` (or `--text-primary` in dark if brand is light).
- Secondary button (outline): border `1px solid var(--brand-secondary)`, text `var(--brand-secondary)`, bg transparent.
- Card: background `--surface-2`, border-radius `--radius`, box-shadow `0 6px 20px var(--shadow)`.
- Navbar: background `--surface` (light) or `--surface-2` (dark), text `--text-primary`, active link `--brand-primary`.
- Success / error badges: background `--success` / `--error`, text on badges: dark or light depending on contrast.

## Extra: small token set for designers/devs

Primary / Secondary / Accent / Surface / Surface-2 / Muted / Text-primary / Text-secondary / Border / Shadow / Radius / States (success/error/info)