# Feature Specification: A shorter path: no separate Review step

**Feature Branch**: `015-shorter-path`

**Created**: 2026-11-05

**Status**: Implemented

**Part of**: [Product overview](../000-connection-reference-governance/spec.md)

**Input**: Hand test: the same before and after list appears three times (Review, Preview and the confirmation). Take the Review step away; keep what only it said where it is still needed.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - From the choices straight to the exact preview (P1)

Review changes in the studio opens the Preview. The path is Choose, Preview, Apply, Result. The Preview says when no row can be written and why; the warnings, what is written and the backup offer stay in the confirmation, where the write is decided.

**Why this priority**: One screen less to read and click through, with no loss of safety: the exact change is still shown before anything is written and confirmed in a dialog.

**Independent Test**: from the studio the Preview opens; Back returns to the choices with nothing written; the stepper has four steps.

**Acceptance Scenarios**:

1. Given Review changes in the studio, Then the Preview opens at once; there is no Review step, no "Continue to preview" button and no "Review" crumb.
2. Given the guided path, Then the stepper shows Choose, Preview, Apply, Result.
3. Given the Preview, Then Back returns to the choose screen, discarding the plan, and nothing is written.
4. Given a plan with no row that can be written, Then the Preview opens with a banner "No row can be written" that lists the reasons with their counts and, when flows are turned on, says to allow the tool to turn them off; Apply is closed.
5. Given the confirmation, Then it still shows the warnings, what is written, the backup offer and the acknowledgements, as before.
6. Given the solution is read again while the Preview is open, Then the Preview is closed with the message that the preview was closed.

---

### Edge Cases

- Everything that could be reached from the Review (back to it from the Preview, a crumb to it) is gone; the Preview is the first step of the path.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-1501**: The guided path MUST be Choose, Preview, Apply, Result, with the moves of feature 006 applied to the Preview (leave back to the choices) and unchanged for Apply and Result.
- **FR-1502**: The Preview MUST show the banner of the reasons when no row can be written, and MUST keep Apply closed in that case.
- **FR-1503**: Nothing that decided a write (the acknowledgements, the warnings, the backup offer, the second acknowledgement for flows turned off) MAY be removed from the confirmation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- SC-1501: from the choices to the confirmation there is one screen, not two.

## Assumptions

- Amends features 006 and 007: the Review step of 006 is removed; its facts, table and callouts are covered by the Preview (007) and the confirmation (005).

## Implementation map

- src/model/workflow.ts (steps, moves, crumbs)
- src/state/reducer.ts (the wizard starts at the Preview)
- src/views/preview.ts (the banner), src/views/main.ts (routing); src/views/review.ts removed

## Verification

Every requirement above is covered by tests; mutation checks guard the rules that can be broken silently (`npm run test:mutation`). What tests cannot see is in [the manual checks](../000-connection-reference-governance/quickstart.md).

- test/workflow.test.ts
- test/preview.test.ts
- test/reducer.test.ts
