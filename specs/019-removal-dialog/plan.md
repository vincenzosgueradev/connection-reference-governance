# Plan: The dialog of Remove and Delete

## Technical context

No Preview step for taking away: the controller builds the plan (`model/removal.ts`) and opens the confirmation at once (`openPlan` then `openConfirm`). Delete adds `confirmCode`/`typedCode` to the state, which itself refuses `applyStarted` without the code. Dependencies are read first (`host.dependencies`, `RetrieveDependenciesForDelete`) and asked again just before each delete in `services/dataverse.ts`.

## Constitution check

- T2b: dependencies block a delete; the row is done only when the environment shows it. Root destructive-operation rules: named environment, backup offered, acknowledgement, plus the code.

## Note

Written after the implementation (backfilled 2026-11-07) from the spec and the code, to complete the pipeline; the spec is the source.
