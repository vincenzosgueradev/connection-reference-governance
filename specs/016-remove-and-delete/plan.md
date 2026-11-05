# Plan: Remove from this solution and Delete

## Technical context

Same layers as the rest of the tool: a pure planner (`model/removal.ts`) builds a `Plan` of kind `remove` or `delete`; the existing reducer, Preview, confirmation, Apply and Result carry it; `services/dataverse.ts` applies it row by row; `host.ts` is the only door (`remove`, `removeFromSolution`).

## Constitution check

- T1/T2 amended to 1.4.0 (T2b). T3: plan, preview, confirm, apply. T4b: re-read before, read back after. T5: component type read, not guessed. Root destructive-operation rules: preview, named environment, backup offered, README lists the change.

## Structure

The studio is not used: there is nothing to choose, so the buttons build the plan and open the Preview. The wizard, confirmation and result are reused with kind-aware wording; the rows reuse `PlanRow` (`field` `membership` or `row`, optional `entity` and `componentType`).
