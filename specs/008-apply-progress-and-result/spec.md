# Feature Specification: Apply progress and result

**Feature Branch**: `008-apply-progress-and-result`

**Created**: 2026-11-04

**Status**: Implemented

**Part of**: [Product overview](../000-connection-reference-governance/spec.md)

**Input**: After the confirmation the Apply step shows a timeline of the phases with elapsed time and the rows as they finish; the Result step shows what happened in plain words, in figures and per row, and offers a report.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Watch the write happen (P1)

The Apply step shows four phases (Confirmed, Write and verify, Refresh, Summary) as a timeline, a status line with the row being written and the elapsed time, and a live table of rows with their outcomes.

**Why this priority**: A write on a shared environment can take time; the user must see that it is working and what has been done so far.

**Independent Test**: the timeline, the counter and the live rows follow the real progress and never stop at an error.

**Acceptance Scenarios**:

1. Given the confirmation, Then the Apply step opens with the phase Confirmed done and Write and verify active.
2. Given rows being written, Then the status line reads "writing 3 of 12" with the elapsed time (for example 14 s, then 1 min 05 s) updating every second, and each finished row appears in the live table with a chip: done, failed or skipped, and its message.
3. Given one row fails, Then the others are still processed.
4. Given all rows are written, Then the phase Refresh is active while the solution is read again, then Summary, and the Result step opens by itself.
5. Given the step, Then Back is disabled and the stepper shows Apply as current.
6. Given a narrow pane, Then the timeline wraps its labels under the dots.

---

### User Story 2 - Know what happened (P1)

The Result step states the outcome in one banner (success, partly done, nothing written), the figures (changed, skipped, failed, duration), a facts strip and the per-row table; a report can be saved.

**Why this priority**: The user must be able to tell at once whether to worry, and which rows need a second look.

**Independent Test**: the figures add up to the number of rows and the banner matches them.

**Acceptance Scenarios**:

1. Given all rows done, Then the banner is green and says the changes were written and read back.
2. Given some skipped or failed, Then the banner is amber, says how many and the table lists first the rows that need attention.
3. Given nothing was written, Then the banner is red or neutral and says why.
4. Given the figures, Then changed + skipped + failed equals the number of rows, and the duration is shown.
5. Given a row that was written and read back, Then its chip says done and its message says it was verified.
6. Given Save report, Then a file with the operation, environment, time, duration and every row with its outcome and message is saved; given Back to solution, Then the solution screen opens with fresh data and no selection.
7. Given the refresh after the write failed, Then the Result says the data on screen may be old and offers Refresh.

---

### Edge Cases

- The tool is closed during Apply: rows already written stay written; the backup and the report are the way to know what.
- A very long run: the status line keeps updating.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-036**: The Apply step MUST show a timeline of the phases Confirmed, Write and verify, Refresh and Summary with done, current and upcoming states, and a status line with the progress and the elapsed time.
- **FR-037**: Elapsed time MUST be formatted for people (under a minute as seconds, then minutes and seconds) and MUST update at least every second without moving other elements.
- **FR-038**: Each row MUST appear in a live table as soon as it is finished, with its outcome chip and message; a failure MUST NOT stop the other rows (feature 005).
- **FR-039**: When the rows are done the solution MUST be read again and the Result step MUST open by itself; during Apply Back MUST be disabled.
- **FR-040**: The Result step MUST show a banner whose tone and words match the figures, the figures changed, skipped, failed and duration (changed + skipped + failed = rows), a facts strip and the per-row table with attention rows first.
- **FR-041**: The Result step MUST offer Save report (a file with operation, environment, time, duration and every row with outcome and message) and Back to solution (fresh data, selection cleared).
- **FR-042**: If the refresh after the write fails, the Result MUST say that the data on screen may be old.
- **FR-043**: The progress and result state MUST live in the store so that rebuilding the view keeps them; the timer MUST be stopped when the step ends.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- SC-801: the elapsed time and the counter are correct within one second.
- SC-802: changed + skipped + failed equals the number of rows in 100% of tested runs.
- SC-803: a failed row never stops the run.

## Assumptions

- The time is measured on the user's machine; it is information, not a promise.
- The report is saved where the user chooses; it contains ids and names of the user's own environment and is never sent anywhere.

## Implementation map

- `src/model/progress.ts`
- `src/model/report.ts`
- src/state/reducer.ts (wizard progress)
- src/controller.ts (confirm with progress and timer)
- src/services/dataverse.ts (applyPlan with progress)
- `src/views/apply.ts`
- `src/views/result.ts`
- src/ui (kit: pipeline)

## Verification

Every requirement above is covered by tests; mutation checks guard the rules that can be broken silently (`npm run test:mutation`). What tests cannot see is in [the manual checks](../000-connection-reference-governance/quickstart.md).

- test/progress.test.ts (time, phases, banner, report)
- test/apply.test.ts
- test/result.test.ts
- test/dataverse.test.ts "applyPlan progress"
- test/ui.kit.test.ts (pipeline)
