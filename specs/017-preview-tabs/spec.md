# Feature Specification: One Preview with two tabs: code diff and table

**Feature Branch**: `017-preview-tabs`

**Created**: 2026-11-05

**Status**: Implemented

**Part of**: [Product overview](../000-connection-reference-governance/spec.md)

**Input**: Hand test: the confirmation dialog listed what will change (before and after per row) and the Preview showed the same change as a code diff. Join them in one screen with two tabs: the code diff, and a table.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See the change one way or the other, on one screen (P1)

The Preview has two tabs under its banner. **Code diff** (the default) shows one card per item with the line diff, split or unified. **Table** shows one line per item with what it is now and what it will be (references with their connector, connection ids, or the membership/delete state), and the reason when an item is blocked.

**Independent Test**: `test/preview.test.ts` (the tabs), `test/confirm.test.ts` (the lines are read in the Table tab).

**Acceptance Scenarios**:

1. Given the Preview, Then it has the tabs Code diff and Table, Code diff active; the layout bar (Split, Unified) and the "show more" button belong to Code diff only.
2. Given the Table tab, Then each item is a line with its name, its current and its new value; blocked items say why and are not counted.
3. Given the confirmation dialog, Then it no longer repeats the list: it holds the figures, the warnings, what happens, the backup and the acknowledgements. The list it used to hold is the Table tab, behind it.
4. Given a tab choice, Then it is kept while the Preview is open and applies to all items; the per-item Diff/Table switch is gone.

## Requirements *(mandatory)*

- **FR-1701**: The Preview MUST offer exactly the tabs Code diff and Table over the same plan.
- **FR-1702**: The confirmation MUST NOT list the rows again; nothing that decides a write (acknowledgements, warnings, backup, figures) is removed from it.

## Assumptions

- Amends features 005 (the list of the confirmation), 007 (the per-item Diff/Table switch) and 015.

## Implementation map

- src/state/reducer.ts (`tab`, `setTab`), src/views/preview.ts, src/views/confirm.ts, src/views/main.ts

## Verification

- test/preview.test.ts, test/confirm.test.ts, test/reducer.test.ts

## Amendment 2026-11-05

The tabs and the layout choice (Split, Unified) share one line to save height; the main button of the Preview is a solid primary button (a solid red one for Delete); switches in the whole tool read ON or OFF; the confirmation keeps its buttons at the bottom of the dialog whatever its height.

## Amendment 2026-11-05 (hand look: the banner took the screen)

The banner at the top of the Preview (operation, solution, Items, Changes, Not changed) is removed: it repeated the title and the stepper and pushed the content down. The counts are one muted line next to the tabs ("2 items · 2 changes · 1 not changed"), so the diff or the table starts right under the tabs.
