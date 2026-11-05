# Feature Specification: The dialog of Remove and Delete, with a code to unlock Delete

**Feature Branch**: `019-removal-dialog`

**Created**: 2026-11-05

**Status**: Implemented

**Part of**: [Product overview](../000-connection-reference-governance/spec.md)

**Input**: Hand test: a Preview step for Remove and Delete is the wrong shape. Make it one engaging, enterprise-looking popup with icons and explanations; for Delete the user must copy and paste a code to unlock it; if something depends on a row it must never be deleted.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - One dialog, no Preview step (P1)

Remove from solution... and Delete... open a dialog over the list at once (no step, no "Preview" crumb). It holds: a lead sentence with its icon (what this does and does not do), three figures (to remove or delete, blocked, flows turned off first), "How it runs" in three steps with icons (each row is checked again, it is removed or deleted, the result is read back), the rows as before-and-after lines with the reason on each blocked row, the warnings, the offer to save a copy, and the acknowledgement. Remove is blue; Delete is red.

**Acceptance Scenarios**:

1. Given Remove or Delete, Then the dialog opens over the list; Cancel, Escape and the close button return to the list with nothing written.
2. Given the confirmed dialog, Then the run and the Result are the usual Apply and Result steps.

### User Story 2 - Delete is unlocked by a code (P1)

For Delete, the dialog shows a code (for example DELETE-7K4Q9X) with a Copy button and a field. The Delete button stays closed until the acknowledgement is ticked and the pasted text equals the code (spaces around it do not count). The code is new every time the dialog is opened. The state itself refuses to start a delete without the code, not only the button.

### User Story 3 - What has dependencies is never deleted (P1)

Before the dialog opens, the tool asks the environment what depends on each row (`RetrieveDependenciesForDelete`). A row that components outside the selection depend on is blocked, naming them; a row whose dependencies could not be read is blocked. The question is asked again just before each delete: a new dependency, or a failed check, skips the row and nothing is deleted. A flow of this solution that uses a reference is such a dependency (feature 016).

## Requirements *(mandatory)*

- **FR-1901**: Remove and Delete MUST open one dialog and no Preview step.
- **FR-1902**: Delete MUST NOT start without the code that was shown, in the button and in the state.
- **FR-1903**: A row with dependencies outside the selection, or whose dependencies could not be read, MUST NOT be deleted, at planning time and again at the moment of the delete.

## Assumptions

- Amends features 016 and 017. `RetrieveDependenciesForDelete(ObjectId, ComponentType)` is a Web API function (Microsoft Learn); it is called as a plain GET and its records are read as `dependentcomponentobjectid` and `dependentcomponenttype`. The live check is in the quickstart (39).

## Implementation map

- src/views/removal.ts, src/views/main.ts (the dialog over the list), src/state/reducer.ts (`confirmCode`, `typedCode`), src/controller.ts, src/host.ts (`dependencies`), src/model/removal.ts, src/services/dataverse.ts

## Verification

- test/removal.test.ts; manual check 39 in [the quickstart](../000-connection-reference-governance/quickstart.md).

## Amendment 2026-11-05 (hand look: only what the function needs)

The dialog no longer carries the three-step explainer, the three figures or the generic warnings: they restated the title or counted nothing useful. It holds one line on what the operation does, the rows (each blocked row with its reason), a short note only when something is blocked, the copy of what will be deleted (Delete only: removing loses nothing), the code gate (Delete only) and the acknowledgement.
