# Plan: Clean up

## Technical context

A pure module `model/cleanup.ts` (unused, duplicate groups, keeper, merge input, figures, pruning of stale choices) over the existing `Snapshot`; no new data is read. The dialog is a view (`views/cleanup.ts`) over the state `cleanup` (tab, ticked unused ids, keeper per group). It writes nothing: Remove and Delete hand the ticked ids to the existing planners (`planRemoval`) and dialogs; a merge hands the flows and the chosen group to the existing re-point (`setGroups`, `previewRepoint`). `cleanupFollowUp` keeps the duplicates of the merge in progress so that its Result can offer the second step.

## Constitution check

- T2: re-point and take-away stay two operations with their own preview and confirmation; the follow-up only opens a dialog. T2b: Remove and Delete rules unchanged, including the dependency check. T3: nothing is written without a preview. T8: dialogs, waits and states follow the visible-wait rule; no emoji. T2d added (1.7.0): the definitions and the merge rule.

## Decisions

- Duplicates are judged by the connection id because that is what makes two references interchangeable; names are not compared.
- A merge is one group at a time because the re-point holds one group per connector.
- Unused is "in this solution": flows of other solutions and agents are not read; the Delete dependency check and the warning cover them. Reading agents (`bot` relationship) is left as a later idea.
