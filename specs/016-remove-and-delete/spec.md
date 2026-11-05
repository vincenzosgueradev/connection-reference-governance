# Feature Specification: Remove from this solution and Delete

**Feature Branch**: `016-remove-and-delete`

**Created**: 2026-11-05

**Status**: Implemented

**Part of**: [Product overview](../000-connection-reference-governance/spec.md)

**Input**: Two new functions for the selected connection references: take them out of the solution, and delete them. Done properly. (Amended 2026-11-05 after the first hand look: the actions are offered in the Connection references view only; flows are only re-pointed. The planner and the apply still handle flow rows, but no screen offers them.)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Remove rows from this solution (P1)

I select flows or connection references and choose Remove from solution. The rows leave the open unmanaged solution; they stay in the environment (and in any other solution).

**Why this priority**: Tidying a solution is the most common need and is safe: nothing is lost.

**Independent Test**: plan, apply and read-back tests with an in-memory environment (`test/removal.test.ts`); the real call is checked by hand (quickstart 36).

**Acceptance Scenarios**:

1. Given a selection, When I choose Remove from solution, Then the Preview opens at once (no studio: there is nothing to choose) with one item per row and the membership change as a diff and as a table.
2. Given the confirmation, Then it says the rows are not deleted, shows the environment, and needs the acknowledgement.
3. Given the run, Then each row is checked to still be in the solution, removed with the component type stored on its own `solutioncomponent` row, and read back; it is done only when the membership is gone.
4. Given a row no longer in the solution, Then it is skipped and the environment is not called.
5. Given a member whose component type could not be read, Then the row is blocked; the type is never guessed.

### User Story 2 - Delete rows (P1)

I select flows or references and choose Delete. After a red confirmation they are deleted from the environment.

**Acceptance Scenarios**:

1. Given Delete, Then the Preview opens, and the confirmation is in the error tone, titled "Delete ... permanently", says it cannot be undone, and asks for an acknowledgement that names the environment and the number of rows.
2. Given flows that are on, Then the confirmation lists them under "Flows will be turned off, then deleted" and asks for a second acknowledgement; the run turns them off, deletes them, and never turns them on again; a flow whose delete is refused stays off and the result names it as left off.
3. Given a suspended flow, Then it is blocked ("turn it off first").
4. Given the confirmation, Then it offers a copy of every flow definition and reference record that will be deleted, saved to a file the user chooses.
5. Given the run, Then each row is checked to still exist (and a flow to be off) just before, deleted, and read back; it is done only when it no longer exists.

### User Story 3 - Nothing is left broken (P1)

1. Given a reference used by a flow of this solution that is not in the same selection, Then the row is blocked for both operations, with the number of flows and the way out (re-point them or take them out first).
2. Given a managed solution or a managed row, Then the row is blocked, as for every operation.

### Edge Cases

- A failure on one row never stops the others (as for every write).
- Deleting a reference that a flow outside the solution still uses may be refused by the environment: the refusal is shown on the row.
- The connection behind a deleted reference is not deleted; the confirmation says so.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-1601**: Remove and Delete MUST be separate operations with their own plan, preview, confirmation and result, never combined with a re-point or a connection change (constitution T2b).
- **FR-1602**: Remove MUST use the `RemoveSolutionComponent` action with the component type read from the member's `solutioncomponent` row, and MUST block a row whose type was not read.
- **FR-1603**: A row MUST be reported done only when the environment shows the result (membership gone, or row gone).
- **FR-1604**: A reference used by a flow that stays MUST be blocked.
- **FR-1605**: Delete MUST use a danger-tone confirmation with its own acknowledgement, and MUST offer a copy of the definitions and records.
- **FR-1606**: A flow that is on MUST be turned off before it is deleted, with a second acknowledgement, and MUST NOT be turned on again.
- **FR-1608**: The two actions MUST be offered in the Connection references view only, never in the Flows view.
- **FR-1607**: Nothing is written on load; both actions are disabled for managed solutions, with no selection, and while the tool is busy.

## Success Criteria *(mandatory)*

- SC-1601: from the selection to the confirmation there is one screen (the Preview).
- SC-1602: no row is shown as done unless it was read back.

## Assumptions

- Call shape, from Microsoft Learn (checked 2026-11-05): the Web API reference of `RemoveSolutionComponent` lists `SolutionComponent` (a `solutioncomponent`), `ComponentType` (int) and `SolutionUniqueName`; the SDK sample ("Work with solutions") sets `ComponentId` to the id of the **object** (for a table, its metadata id), not to the id of the `solutioncomponent` row, although the property page says the latter. The tool follows the sample: `SolutionComponent.solutioncomponentid` carries the object id (`objectid`), typed with `@odata.type` as Learn does for entity-typed parameters of other actions. A test fixes this exact request; the live check (quickstart 36) remains because the Learn pages disagree. A wrong shape is refused per row and never shown as done, because the membership is read back.
- Amends constitution T1 and T2 (version 1.4.0) and FR-301 of feature 000.

## Implementation map

- src/model/removal.ts (planner), src/model/planDiff.ts, src/model/workflow.ts
- src/services/dataverse.ts (`removalRow`, delete without turning on again), src/host.ts (`remove`, `removeFromSolution`)
- src/controller.ts (`previewRemove`, `previewDelete`), src/views/main.ts (the two buttons), src/views/confirm.ts, src/views/preview.ts, src/views/apply.ts

## Verification

- test/removal.test.ts
- The manual checks 36 and 37 in [the quickstart](../000-connection-reference-governance/quickstart.md).

## Amendment 2026-11-05 (hand look: say why before opening anything)

When every selected reference is used by a flow of the solution, Remove from solution and Delete are closed (with the reason as the tooltip), and the line under the title says so and where to go: re-point those flows first. When only some of the selected references are used, the buttons stay open and the dialog lists the used ones as blocked with their reason.
