# Plan: A fixed frame

## Technical context

Layout only: `views/workflow.ts` (`step-body`), `views/main.ts` (`screen`), `styles.css` (the frame) and `views/result.ts`. The page does not scroll; the list or the body scrolls inside the room left by the fixed parts, and the step footer is fixed at the bottom. Layout is not testable in jsdom, so it has a manual check and structural tests.

## Constitution check

- T8 (UI): theme variables only, no redundant data (the Result banner repeating the operation is removed).

## Note

Written after the implementation (backfilled 2026-11-07) from the spec and the code, to complete the pipeline; the spec is the source.
