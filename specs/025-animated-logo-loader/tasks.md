# Tasks: Animated logo loader

Order: tests first (they fail), then code, then wiring, then docs. `[P]` = can run in parallel with the others of the same step.

## T-2501. Loader module (test first)

- [x] T-2501a [P] `test/loader.test.ts` (FR-2501, 2503, 2505, 2506, 2508, 2509, 2511): root has `role=status`, `aria-live=polite`, `aria-busy=true`; the svg is `aria-hidden`; the caption is the text given; no emoji; the drawing has 3 circles and 2 paths equal to those of `src/public/logo.svg`; first call is "new" with `--loader-appear` of about 200 ms; a call 250 ms later is "late" (no fade); `loaderIdle()` makes the next call "new" again; the phase is `-(now mod period)` so two calls with different `now` continue the same cycle; reduced motion doubles the period.
- [x] T-2501b [P] `test/loader.styles.test.ts` (FR-2502, 2503, 2504, 2511): the stylesheet has `.logo-loader` rules, the keyframes for flow, pulse, halo and appear, no `animation: none` and no `animation-play-state: paused` in them, no `#hex` colour and no `rgb(` inside the loader block, uses `var(--color-` tokens.
- [x] T-2501c `src/views/loader.ts`: `logoLoader(caption, opts?)`, `loaderIdle()`, constants `APPEAR_AFTER_MS = 200` and `PERIOD_MS = 1800` named in one place.
- [x] T-2501d `src/styles.css`: the loader block (layout, mark, halo, dashes, nodes, appear), tokens only.

## T-2502. Wiring (FR-2501, 2507, 2510)

- [x] T-2502a Failing test in `test/views.test.ts`: solution busy and no snapshot shows `.logo-loader` with "Reading the solution..."; not busy shows the error text and no loader; solutions busy and none read shows the loader; with rows and busy it shows the table and no loader; the connections area with no rows and `loading` shows the loader with the count; with rows it shows the list and the thin reading line, no big loader.
- [x] T-2502b `src/views/main.ts`: the two places of D-7; call `loaderIdle()` after a draw with no `.logo-loader`.
- [x] T-2502c `src/views/connectionsManager.ts`: the first-read wait of D-7.
- [x] T-2502d Update the one assertion that expected 'Loading solutions...' in `test/views.test.ts` (line 236) to the new text.

## T-2503. Real check

- [x] T-2503a Hand test (quickstart 53 to 57): the animation in both themes, with reduced motion, a narrow pane, an instant read, a failing read.
- [x] T-2503b Screenshot or short GIF of the loader for the README (after the hand test).

## T-2504. Verification

- [x] T-2504a `npx tsc --noEmit`, `npm test`, `npm run build`.
- [ ] T-2504b Mutation check not repeated (no logic in `model/` or `services/` changed); noted in the release run.

## T-2505. Docs and rules

- [x] T-2505a `quickstart.md` with checks 53 to 57.
- [x] T-2505b README Features line (done); the screenshot comes after the hand test (T-2503b); CHANGELOG entry under the open version (0.1.0 is not released yet: add to its Added list).
- [x] T-2505c Constitution T8 amended (1.9.1): a wait of the whole pane uses the logo loader; reduced motion slows it.
- [x] T-2505d Root `PENDING.md`: promote the loader to the template kit (kit changes go through the template).
