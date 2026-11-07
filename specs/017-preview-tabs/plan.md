# Plan: One Preview with two tabs

## Technical context

The Preview already draws a plan (`Plan`) as code diffs; this feature adds a state value `tab` (`diff` | `table`, action `setTab`) and a table over the same rows. The confirmation dialog stops listing rows. No new layer: `state/reducer.ts`, `views/preview.ts`, `views/confirm.ts`, `views/main.ts`.

## Constitution check

- T3/T4c: the preview still lists every row that will change and why a row is blocked; nothing that decides a write (acknowledgements, warnings, backup, figures) leaves the confirmation.

## Note

Written after the implementation (backfilled 2026-11-07) from the spec and the code, to complete the pipeline; the spec is the source.
