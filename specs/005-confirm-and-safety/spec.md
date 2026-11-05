# Feature Specification: Confirmation and write safety

**Feature Branch**: `005-confirm-and-safety`

**Created**: 2026-11-04

**Status**: Implemented

**Part of**: [Product overview](../000-connection-reference-governance/spec.md)

**Input**: What stands between the user and a write: the confirmation dialog, the acknowledgement, the backup, the checks before and after each write and the per-row result.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Confirm in a clear dialog before anything is written (P1)

Before any write a dialog opens over the screen with the environment, the scope in four figures, a before-and-after line per row, the warnings, the backup offer and an acknowledgement that enables Apply.

**Why this priority**: Every write changes a production-like environment; the confirmation is the safety gate.

**Independent Test**: opening the dialog writes nothing; Apply stays disabled until the acknowledgement is ticked; Cancel, Escape and the close button end it without a write.

**Acceptance Scenarios**:

1. Given a valid plan, Then the dialog shows the environment, and four figures: rows to change, flows affected, flows turned on, rows not changed.
2. Given each row, Then it shows what it is now, an arrow and what it will be; blocked rows are dashed with their reason and not counted.
3. Given warnings, Then they are in a highlighted block; given none, none is shown.
4. Given the backup offer, Then Save backup writes the old values to a file and the dialog then says "Backup saved".
5. Given the acknowledgement is off, Then Apply is disabled and a Required chip shows; given it is on, Apply writes only the rows that are not blocked.
6. Given Cancel, Escape or the close button, Then nothing is written; focus starts on Cancel, stays inside, and the dialog fits a narrow pane.
7. Given the acknowledgement, Then ticking it never changes the width or the position of anything in the footer (the Required mark has a reserved place and becomes Confirmed), and button labels read in the singular for one (Apply to 1 flow).

---

### User Story 2 - Writes that check themselves (P1)

Each row is read again just before it is written and read back after; a row that changed meanwhile or cannot be confirmed is reported, never silently accepted.

**Why this priority**: It makes a write on a shared environment safe against concurrent edits.

**Independent Test**: a row changed between preview and apply is skipped; a write that is not confirmed is reported as failed.

**Acceptance Scenarios**:

1. Given a row changed by someone else since the preview, Then it is skipped with that message and the others are written.
2. Given a write after which the stored value cannot be confirmed, Then the row is reported as failed.
3. Given one row fails, Then the others are still processed and every row shows its outcome and the environment's message.
4. Given row ids, Then they are validated as ids before they enter a query.

---

### Edge Cases

- A preview opened and then replaced resets the acknowledgement and the backup state.
- The view being rebuilt on each change must keep the dialog, its scroll and its focus.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-007**: Every write MUST be a plan first and confirmed with the environment and scope named.
- **FR-009**: Apply MUST report success or failure per row and never stop silently at the first error.
- **FR-015**: Before each write the stored value MUST be read again and match the preview; after each write it MUST be read back and checked.
- **FR-016**: The confirmation MUST offer a backup of the old values.
- **FR-020**: Every write MUST be confirmed in a dialog with environment, scope, before-and-after per row, warnings, backup and an explicit acknowledgement; Cancel, Escape and the close button write nothing; the controller MUST refuse to write without the acknowledgement whatever the screen did.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- SC-501: in 100% of tested applies no write happens before the acknowledgement.
- SC-502: in 100% of tested concurrent edits the changed row is skipped.
- SC-503: every row of an apply shows an outcome.

## Assumptions

- Undo is not offered for writes to the environment; the backup lists the old values so the user can restore them by hand.

## Implementation map

- `src/views/confirm.ts`
- src/services/dataverse.ts (applyPlan)
- `src/model/backup.ts`
- src/controller.ts (confirm, saveBackup)
- src/state/reducer.ts (planAck, backupSaved)
- src/ui (kit: modal, figures, changeList, callout)

## Verification

Every requirement above is covered by tests; mutation checks guard the rules that can be broken silently (`npm run test:mutation`). What tests cannot see is in [the manual checks](../000-connection-reference-governance/quickstart.md).

- test/confirm.test.ts
- test/dataverse.test.ts "applyPlan"
- test/backup.test.ts
- test/reducer.test.ts "acknowledgement"
- test/ui.kit.test.ts (modal)
