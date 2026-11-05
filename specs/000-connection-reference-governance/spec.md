# Product overview: Connection Reference Governance

**Created**: 2026-11-04

**Status**: In development

**Input**: In the connected Dataverse environment, show which connection references every flow of an unmanaged solution uses, flag what can be proven, and change the connection of references or re-point flows to another reference in bulk, with a guided, confirmed and verified write.

Every function of the tool is its own feature with its own specification, plan, tasks and checklist, so that each one can be understood, tested and changed alone. This file is the index and holds what is shared: the research, the manual checks, the assumptions and the success criteria of the product.

## Features

| # | Feature | Status | What it is |
|---|---|---|---|
| 001 | [Solution home screen](../001-solution-home/spec.md) | Implemented | The screen the tool opens on: the environment in the header, the number of unmanaged solutions and of flows, and a sortable, searchable table of the unmanaged solutions with their flow count. Choosing a solution opens it. |
| 002 | [Flows and connection references browser](../002-flow-reference-browser/spec.md) | Implemented | Inside a solution: one table of flows and one of connection references, each row opening a details panel; flags for what can be proven; connector names and glyphs; search; consistent between the two views. |
| 003 | [Change the connection of references](../003-change-connection/spec.md) | Implemented | Bulk change of the connection used by selected connection references: every flow that uses them follows. |
| 004 | [Re-point flows to another reference](../004-repoint-flows/spec.md) | Implemented | Bulk re-point of selected flows from one connection reference to another reference of the same connector in the same solution, rewriting only the reference name in the flow definition. |
| 005 | [Confirmation and write safety](../005-confirm-and-safety/spec.md) | Implemented | What stands between the user and a write: the confirmation dialog, the acknowledgement, the backup, the checks before and after each write and the per-row result. |
| 006 | [Guided workflow with stepper](../006-guided-workflow/spec.md) | Implemented | A change runs as a short guided workflow: Choose, Review, Preview, Apply, Result, with a stepper at the top of every step and a breadcrumb that goes back keeping the context. Same look and behaviour as the step screens of the first tool. |
| 007 | [Preview of exactly what will be stored](../007-change-diff-preview/spec.md) | Implemented | The Preview step shows, for every item to change, the exact before and after as a line diff like an IDE (split or unified) or as a table of the changed fields, with unchanged lines collapsed. |
| 008 | [Apply progress and result](../008-apply-progress-and-result/spec.md) | Implemented | After the confirmation the Apply step shows a timeline of the phases with elapsed time and the rows as they finish; the Result step shows what happened in plain words, in figures and per row, and offers a report. |
| 009 | [Re-point several references to one in a single operation](../009-multi-source-repoint/spec.md) | Implemented | When flows use several references of the same connector (three Outlook references, for example), the user chooses all the references to replace and one reference to use instead, in one operation: n sources, one target. |
| 010 | [Action studio: a roomy, expandable dialog for choosing what to change](../010-action-studio/spec.md) | Implemented | The choices of a change are made in a dialog of their own that can be expanded to the whole window, instead of a block that takes the room of the table. The choose screen keeps only a selection bar. |
| 011 | [Turn flows off for the change and on again afterwards](../011-flow-state-management/spec.md) | Implemented | A flow that is turned on cannot be re-pointed by the tool alone. With the user's explicit permission the tool turns such flows off, writes, checks and turns them on again, and tells the user everything that this means. |
| 012 | [The run happens inside the dialog, with progress and an outcome](../012-run-in-dialog/spec.md) | Planned | After the user agrees, the confirmation dialog does not close: it turns into the run, with a pipeline, an elegant progress bar and the rows as they finish, and then shows the outcome (success or error) before anything else happens. The selection is kept. |
| 013 | [Re-point by category: every connector in one operation](../013-grouped-repoint/spec.md) | Implemented | The references to replace are grouped by connector; for each category one or all are ticked and a new reference is chosen; every category is changed in one operation, with bars, percentages, icons and colours. |
| 014 | [Guided choosing, one category at a time](../014-guided-categories/spec.md) | Implemented | The studio of a re-point shows one connector at a time in a pipeline with Next and Back, animated, with the overview of every choice always underneath. |
| 015 | [A shorter path: no separate Review step](../015-shorter-path/spec.md) | Implemented | The Review step repeated what the Preview and the confirmation show; the path is Choose, Preview, Apply, Result. |

Order of dependence: 001 and 002 read; 003 and 004 plan changes; 005 confirms and checks every write; 006, 007 and 008 are the guided path through a change (steps, exact preview, progress and result) and build on 003 to 005. 009 to 012 came from hand tests: 009 re-points several references at once, 010 gives the choosing a roomy expandable dialog (and replaces the action block of the choose screen), 011 lets the tool turn flows off and on with permission, 012 hosts the run and its outcome inside the confirmation dialog (and keeps the selection).

## Shared requirements

- **FR-013**: Tests and fixtures MUST contain no tenant data.
- **FR-014**: The README MUST state what is read, what is written, that an environment is touched, and carry the credits section required by the constitution.
- **FR-301**: The tool MUST NOT create anything, and MUST NOT delete or remove anything except through the confirmed operations of [feature 016](../016-remove-and-delete/spec.md); it MUST NOT change anything other than the connection id of existing references and the reference name inside the definition of existing flows.

## Product success criteria

- **SC-001**: A user sees every flow of a solution with its connections, type and state without opening any flow.
- **SC-002**: 100% of provable problems are flagged and 0 unproven ones.
- **SC-003**: Every write is planned, previewed exactly, confirmed with an acknowledgement, checked before and after each row and reported per row.
- **SC-004**: 0 writes are offered on managed solutions, blocked rows or incompatible choices.

## Shared assumptions

- The user has the Dataverse privileges to read solutions, flows, references and connections, and to update the ones they change.
- Connection owner and connection state are not readable from the connected environment (research.md); the tool shows the owner of the reference row and says so.
- Whether a flow that is on accepts a definition update is unverified; such flows are blocked until a hand test is recorded (constitution T4).
- Single environment at a time; no cross-environment comparison.

## Where things are

- [research.md](research.md): verified metadata, sources, decisions, defects found.
- [quickstart.md](quickstart.md): manual checks that tests cannot see.
- [plan.md](plan.md) and [tasks.md](tasks.md): the product plan (original) and the product-level tasks.
