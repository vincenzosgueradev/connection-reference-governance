# Implementation Plan: Flow Connection Governance

**Spec**: [spec.md](spec.md) | **Research**: [research.md](research.md) | **Date**: 2026-11-04

## Technical context

Vanilla TypeScript, Vite IIFE bundle, Vitest (jsdom for views). `features.connections = 1`. Layers per
`docs/architecture.md`; framework choice: vanilla (no React).

## Constitution check

| Rule | How it is met |
|---|---|
| I independence | no other tool named anywhere |
| V honest | plan/preview/confirm/apply; owner/state flags only from a verified source (research.md) |
| VI layers | `types` -> `model` (pure) -> `services` (Host) -> `host.ts` -> `views` |
| T2 | two plan types, two previews, two confirmations |
| T4 | rewrite = parse, replace entries, serialise; blocks: other connector, target missing/other solution, active flow |
| T5 | membership by `objectid` intersection; no hard-coded reference component type |
| VII UI | dense tables, theme variables, no emoji, re-read on entry |

## Structure

```
src/types.ts                 data contracts
src/model/clientdata.ts      readReferenceNames, repointClientData (pure)
src/model/analysis.ts        buildSnapshot: rows, flags, grouping (pure)
src/model/plans.ts           planConnectionChange, planRepoint (pure)
src/services/dataverse.ts    loadSolutions, loadSnapshotInput, applyPlan (via Host)
src/host.ts                  query / update / notify (only door to PPTB)
src/state/reducer.ts         selection, view, filters, preview, results (pure)
src/views/*                  toolbar, tables, preview dialog, results
test/                        model + services + reducer + views + metadata
```

## Data reads (per solution)

1. `solutioncomponents?$filter=_solutionid_value eq {id}&$select=objectid,componenttype`
2. `connectionreferences?$select=...` (all in environment, to detect missing references and same-solution targets)
3. `workflows?$filter=category eq 5 and (workflowid eq .. or ..)` in chunks of 25, with `clientdata`.

## Writes

`update('connectionreference', id, { connectionid })`, `update('workflow', id, { clientdata })`, one call per row,
sequential, each result collected.

## Amendment 2026-11-04: compatible choices and the confirmation dialog

Reported in a hand test: the new reference of a re-point could be chosen with no reference to replace, and from another
connector (the planner blocked it only afterwards). Rules now live in a pure model (`src/model/repoint.ts`):
`repointSources(snapshot, flowIds)` (references used by the selected flows, with how many) and
`repointTargets(snapshot, fromLogicalName)` (other references of the same connector in the solution). The reducer clears
a target that is not compatible with the chosen source, the view disables "With" until a source is chosen and lists
only `repointTargets`, and a connection choice is disabled for a mixed-connector selection.

Confirmation: a modal (`modal` helper in the shared UI kit) opened by both previews. It shows the environment pill,
three figure tiles (rows, flows affected, flows turned on), one before-and-after line per row, a warning callout, a
backup row with its saved state, an acknowledgement switch (kept in state, because the view is rebuilt on every change)
and Cancel / Apply. Escape and the close button cancel, focus is trapped and starts on Cancel. Test first: the
defects were reproduced by failing tests before the fix.
