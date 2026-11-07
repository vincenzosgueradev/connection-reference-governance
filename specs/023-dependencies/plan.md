# Plan: Dependencies of a reference in the whole environment

## Technical context

`host.dependents(type, id)` calls `RetrieveDependentComponents` (a GET, no header) and returns the dependency records. `services/dependencies.ts` turns them into a report: the names of the types come from `solutioncomponentdefinitions` (cached per host), the names, states, managed flags and owners of flows, agents, agent components and canvas apps from their own tables in chunks, the solutions of every dependent from `solutioncomponent` and `solution`, and the agents from their relationships to the reference; each resolver can fail alone and says so in a note. `model/dependencies.ts` is pure (kinds, grouping, summary, "outside the open solution"). The state keeps one entry per reference (`loading`, `ready`, `failed`), dropped when the solution is read again; the controller reads a few at a time and ignores answers that arrive after the solution changed. `views/dependencies.ts` draws the block once and the three places use it. Delete's refusal reuses the resolver to name its blockers.

## Constitution check

- T5: types and names are read; T7: nothing leaves the device; the output is on screen only. T8: a spinner and a line while reading, an explicit button, states for empty, failed and ready. T2b/T2d unchanged: the dependencies inform, they do not decide. New T2e (1.8.0) records the sources and the limits.

## Decisions

- Explicit action, not automatic: each reference costs several calls and the user asked for visibility, not for a hidden scan.
- Dataverse dependency tracking is the source because it is the one the maker portal uses; a deep scan of every flow's definition is left out (large, and paging is not available through the tool's door).
