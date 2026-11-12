# Contract: state actions

Pure reducer actions of the Connections area. They live in `src/state/connectionsState.ts` (a slice of the state, reached through `State.connections`) and are tested in `test/reducer.connections.test.ts`. Every one of them starts with `cm`, so the main reducer hands them over with one check. `setArea` is in `src/state/reducer.ts`.

| Action | Effect |
|---|---|
| `setArea { area }` | Switches `solutions` and `connections`; the Connections area cannot be left while Check all or a deletion run is going |
| `cmLoading` | list `loading`, `read` 0; drops deps, selection and the check; keeps filter, search, sort |
| `cmPage { count }` | `read` grows while the pages arrive (only while loading) |
| `cmLoaded { items, environmentId }` | list `ready`; open rows that no longer exist close; selection, deps and check dropped |
| `cmFailed { error }` | list `failed` with the reason; what was on the screen stays |
| `cmFilter`, `cmConnector`, `cmSearch`, `cmSort`, `cmShowMore` | Filter, connector, search, sort and page size; the selection keeps only the rows still shown and still eligible |
| `cmToggleOpen { name }` | Opens or closes a row |
| `cmDepsLoading { names }`, `cmDepsLoaded { name, report }`, `cmDepsFailed { name, error }` | Per-connection dependency state; an answer for a name that left the list is ignored; a loaded answer prunes the selection |
| `cmCheckAllStarted { total, now }`, `cmCheckAllStep { step }`, `cmCheckAllProgress { done, now }`, `cmCheckAllFinished`, `cmCheckAllCancel` | Progress of Check all; a cancel keeps what was read |
| `cmToggle { name }`, `cmSelectEligible`, `cmClearSelection` | Selection; `cmToggle` refuses an ineligible row, `cmSelectEligible` ticks exactly the eligible rows that are shown |
| `cmDeletionOpen { plan, code }` | Opens the dialog; refused when the flag is off, when one is open, or when the plan has nothing to write |
| `cmDeletionTyped { text }`, `cmDeletionAck { on }`, `cmDeletionBackupSaved` | The unlock steps (typed and acknowledgement only in the Preview) |
| `cmDeletionApply { now }`, `cmDeletionRow { outcome, now }`, `cmDeletionDone { results, refreshFailed, now }` | The run; `cmDeletionApply` only from a Preview with the exact code and the acknowledgement |
| `cmDeletionClose` | Closes the dialog; refused during the run; from the Result it also clears the selection |

`state/running.ts` counts as running: `list.status === 'loading'`, any dependency read `loading`, `checkAll !== null`, and `deletion.step === 'apply'`. The one place that disables buttons (`views/main.ts`, after each draw) is unchanged, with one exception: the Cancel of Check all, marked `data-allow-running` in its own view.
