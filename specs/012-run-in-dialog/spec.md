# Feature Specification: The run happens inside the dialog, with progress and an outcome

**Feature Branch**: `012-run-in-dialog`

**Created**: 2026-11-04

**Status**: Planned

**Part of**: [Product overview](../000-connection-reference-governance/spec.md)

**Input**: After the user agrees, the confirmation dialog does not close: it turns into the run, with a pipeline, an elegant progress bar and the rows as they finish, and then shows the outcome (success or error) before anything else happens. The selection is kept.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Watch the run in the same dialog (P1)

Pressing Apply keeps the dialog open and shows the run: the phases as a pipeline, a progress bar that moves with the rows, the time elapsed and the rows as they finish. When it ends the dialog shows the outcome in plain words and figures.

**Why this priority**: A dialog that vanishes on Apply leaves the user guessing; waiting and then seeing success or error removes doubt and repeated clicks.

**Independent Test**: the dialog stays, shows progress and ends with an outcome; Apply cannot be pressed twice.

**Acceptance Scenarios**:

1. Given Apply, Then the same dialog turns into the run at once: Apply and Cancel are gone, the close button and Escape are disabled and a loading effect shows.
2. Given the run, Then a pipeline shows the phases (with the state steps when flows are turned off and on), a progress bar shows rows done over total with a moving effect, the time elapsed updates every second and each finished row appears with its outcome.
3. Given the run ends, Then the dialog shows a banner (success, partly done, error), the figures, the rows (problems first) and, when flows were turned off, whether each is on again.
4. Given the outcome, Then the buttons are Save report and Close; Close returns to the choose screen with the same rows still selected and fresh data.
5. Given a double click or a repeated Enter on Apply, Then only one run starts.
6. Given the table behind, Then it is not changed while the dialog is open.
7. Given reduced-motion settings, Then the moving effects are calm.

---

### Edge Cases

- The refresh fails: the outcome says the data may be old.
- The tool is closed during the run: see feature 011.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-1201**: The confirmation dialog MUST host the run and the outcome; nothing MUST close it from the start of the run until its outcome is shown, except the user pressing Close on the outcome.
- **FR-1202**: The run view MUST show the pipeline of the phases, a progress bar of rows done over total, the elapsed time and the finished rows; the bar MUST NOT move backwards.
- **FR-1203**: The outcome MUST show a banner whose tone matches the figures, the figures, the rows with problems first and the state of every flow that was turned off.
- **FR-1204**: Pressing Apply MUST start exactly one run, however many times it is pressed.
- **FR-1205**: After the outcome, Close MUST show the choose screen with the same rows selected, refreshed data and no stale choices; Save report MUST remain available.
- **FR-1206**: Moving effects MUST be calm under prefers-reduced-motion and MUST NOT depend on colour alone.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- SC-1201: pressing Apply never makes the dialog disappear before the outcome.
- SC-1202: after Close the selection is the one before the run.

## Assumptions

- The Apply and Result steps of feature 008 are hosted by this dialog over the Preview page; their content and rules are unchanged.

## Implementation map

- src/views/confirm.ts (run and outcome states)
- `src/views/apply.ts`
- `src/views/result.ts`
- src/state/reducer.ts (selection kept, plan kept until Close)
- src/ui (kit: progressBar, modal busy)

## Verification

Every requirement above is covered by tests; mutation checks guard the rules that can be broken silently (`npm run test:mutation`). What tests cannot see is in [the manual checks](../000-connection-reference-governance/quickstart.md).

- test/apply.test.ts
- test/result.test.ts
- test/confirm.test.ts
- test/reducer.test.ts
- test/ui.kit.test.ts (progressBar, busy modal)
