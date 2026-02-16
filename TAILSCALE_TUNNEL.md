# Tailscale Funnel — Remote Testing Guide

## Quick Start

**Client testing URL:** `https://michaels-mac-mini.tail0b12a7.ts.net:8443`

Your client can access this URL from **any device, anywhere** — no Tailscale installation required.

---

## Console Warnings When Using Dev Mode

When accessing the app through the Tailscale URL in **development mode** (`npm run dev`), you may see:

### 1. Image Aspect Ratio Warning (Fixed)
```
Image with src "..." has either width or height modified, but not the other...
```
**Status:** Fixed. All `matchindeed.svg` images now include `style={{ width: "auto", height: "auto" }}` to maintain aspect ratio.

### 2. WebSocket HMR Failures (Expected)
```
WebSocket connection to 'wss://.../_next/webpack-hmr' failed
```

**Cause:** Tailscale Funnel does not proxy WebSocket upgrade requests. The Hot Module Replacement (HMR) connection used by the Next.js dev server cannot complete through the tunnel.

**Impact:** Next.js may fall back to full page reloads when HMR fails. This can cause:
- **Form fields to be wiped** while typing (e.g. on /register, /login)
- Hot reload not working
- Disruptive experience for testers

**Fix:** Use `npm run tunnel:prod` instead of dev mode when testing via Tailscale (see below).

---

## Option: Use Production Build for Cleaner Testing

To avoid WebSocket errors entirely and give your client a production-like experience:

```bash
npm run tunnel:prod
```

This will:
1. Build the app for production
2. Start Tailscale Funnel on port 8443
3. Serve the production build (no HMR, no WebSocket)

**Note:** After running `tunnel:prod`, the app will be available at the same URL. You'll need to run `npm run build` again after making code changes.

---

## Commands Summary

| Command | Use Case |
|---------|----------|
| `npm run dev` | Local dev only (localhost:3001) |
| `npm run dev:tunnel` | Dev server + Tailscale Funnel (for quick iteration) |
| `npm run tunnel:start` | Start Funnel only (dev server already running) |
| `npm run tunnel:stop` | Stop the public Funnel |
| `npm run tunnel:status` | Check Funnel status |
| `npm run tunnel:prod` | Production build + Funnel (no WebSocket errors) |

---

## Supabase Auth

For login/signup to work through the Tailscale URL, add this to **Supabase Dashboard** → **Authentication** → **URL Configuration** → **Redirect URLs**:

```
https://michaels-mac-mini.tail0b12a7.ts.net:8443/**
```
