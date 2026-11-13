# Implementation Plan: Animated logo loader

**Branch**: `025-animated-logo-loader` | **Date**: 2026-11-13 | **Spec**: [spec.md](spec.md)

## Summary

A whole-pane wait shows the tool's logo, large, animated with CSS only, with a caption. One small view module draws it; three places use it instead of a plain sentence. No state, no service, no host change: this is a view-level feature (architecture: `views/` only).

## Technical Context

- **Language**: TypeScript strict, DOM built with the shared kit's `el`; styles in `src/styles.css` (tool-specific, tokens only).
- **Dependencies**: none added. No image, no font, no network.
- **Testing**: vitest + jsdom (view tests), plus a stylesheet guard test (the kit already has this pattern).
- **Constraints**: constitution VII (themes, narrow pane, reduced motion), T8 (every wait visible and honest, reduced motion slow not removed), no emoji, theme variables only.

## Constitution Check

- **T8 wait rule**: satisfied and extended: amend T8 (1.9.1) with "a wait of the whole pane uses the logo loader; small waits keep the spinner". Amendment is part of this feature (task T-2506).
- **Independence rule**: nothing here names another tool.
- **Architecture** (`docs/architecture.md`): view only, `views/loader.ts`; `app.ts` untouched.
- **Marketplace rules**: no external asset, no new CSP entry, no `features` change.

## Design decisions

### D-1. The drawing

The loader draws the same marks as `logo.svg` (two nodes on the left, one on the right, two curves) as an **inline SVG** built with `createElementNS`, so it takes `currentColor` from the theme. The marketplace icon file is not touched. A test compares the circle and path data of the loader with `src/public/logo.svg` so a change of icon cannot leave the loader behind (spec edge case).

### D-2. The motion (CSS only)

- The two curves become dashed and **flow** left to right: `stroke-dashoffset` from 0 to minus two dash periods, linear, infinite. This reads as "references being re-pointed".
- The three nodes **pulse in turn** (scale up and a soft fill from the primary token), offset by a third of the period each.
- A soft **halo** behind the mark breathes with the same period (radial gradient from the primary token, transparent at the edge).
- One period variable `--loader-period` (1800 ms) drives everything, so the pieces stay in step.

### D-3. Reduced motion is slow, not off (FR-2504)

The period is set in script: `1800 ms`, or twice that when `(prefers-reduced-motion: reduce)` matches. No `animation: none` anywhere in the loader rules (a guard test checks it). The kit's spinner already follows the same idea (3 s).

### D-4. A redraw never restarts the animation (FR-2509)

The view is rebuilt on every state change, and a CSS animation restarts when its element is recreated. So the animation is tied to a **global clock**, not to the element: every new loader element is created with `--loader-phase: -(now mod period)` ms used as a negative `animation-delay`, so it continues exactly where the previous element was. No timers, no element reuse.

### D-5. No flash for a short wait (FR-2508)

A module variable keeps the time the current wait started (`since`). The first loader of a wait is created fading in with a delay of `APPEAR_AFTER_MS` (200 ms, one named constant) minus the time already waited; a redraw after that moment creates it already visible (no fade, so no flicker). When a draw shows no loader, `loaderIdle()` clears `since` (called once, after each draw in `mountMain`). Pure CSS does the delay; no `setTimeout`.

### D-6. Honest caption and accessibility (FR-2505, FR-2506)

The root is `role="status"`, `aria-live="polite"`, `aria-busy="true"`; the drawing is `aria-hidden`. The caption is passed by the caller from real data (the count of connections read so far already exists in state); there is no timer and no rotating tips.

### D-7. Where it is used (FR-2501, FR-2510)

| Wait | File | Before | After |
|------|------|--------|-------|
| Solution being read | `views/main.ts` (`!s.snapshot` and busy) | `emptyState('Reading the solution...')` | `logoLoader('Reading the solution...')` |
| First read of the solutions | `views/main.ts` (`solutionList`, no solutions yet and busy) | `emptyState('Loading solutions...')` | `logoLoader('Reading the solutions...')` |
| First read of the connections | `views/connectionsManager.ts` (idle or loading, no rows) | `readingLine(...)` | `logoLoader(...)` with the count |
| Re-read with rows on screen, dependencies, buttons, dialogs | unchanged | spinner | spinner |

### D-8. Layout (FR-2511)

Centred flex column, mark `min(96px, 40vw)`, caption wraps and is capped in width; no fixed page width. The loader keeps the tabs of the area switch and the header (it replaces only the content below them), so the person can still leave.

## Files

- New: `src/views/loader.ts`, `test/loader.test.ts`, `test/loader.styles.test.ts`.
- Changed: `src/views/main.ts`, `src/views/connectionsManager.ts`, `src/styles.css`, `test/views.test.ts` (the one assertion on the old text), `.specify/memory/constitution.md` (T8, 1.9.1), `README.md` (Features, a screenshot after hand test), `CHANGELOG.md`, `specs/000-connection-reference-governance/spec.md` link if it lists features.
- Root: add a PENDING item to promote the loader to the template kit.

## Risks

- **Fill interpolation** (`transparent` to a `color-mix`) is supported by current Chromium (the host is Electron); the dash movement does not depend on it, so the worst case is nodes that scale without the soft fill.
- **jsdom has no `matchMedia`**: the helper guards it, tests inject the flag.
