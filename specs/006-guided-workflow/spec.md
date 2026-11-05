# Feature Specification: Guided workflow with stepper

**Feature Branch**: `006-guided-workflow`

**Created**: 2026-11-04

**Status**: Implemented

**Part of**: [Product overview](../000-connection-reference-governance/spec.md)

**Input**: A change runs as a short guided workflow: Choose, Review, Preview, Apply, Result, with a stepper at the top of every step and a breadcrumb that goes back keeping the context. Same look and behaviour as the step screens of the first tool.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Follow a change step by step (P1)

After choosing rows and what to do, the user moves through Review, Preview, Apply and Result. A stepper shows where they are; the breadcrumb lets them go back to any earlier step they can still reach.

**Why this priority**: A write to an environment deserves a path that shows what was seen, what is next and what has already happened.

**Independent Test**: the steps are reached in order, going back keeps the choices, and no step after Apply can be reached backwards.

**Acceptance Scenarios**:

1. Given a valid selection and choices, When the user presses "Review changes", Then the Review step opens with the title, the stepper and the breadcrumb Solutions > solution > Review; nothing is written.
2. Given any step, Then a stepper of five dots shows done steps as green checks, the current step enlarged, glowing and blue, and later steps grey; the line between two steps fills when the left one is done.
3. Given the Review or Preview step, When the user presses Back or a breadcrumb link, Then they return to the earlier step with every choice, selection and scroll position kept.
4. Given the user leaves through the solution or Solutions links, Then the plan is discarded and nothing is written.
5. Given the Apply step has started, Then Back is disabled, the breadcrumb past steps are plain text and the only way out is the Result step.
6. Given a narrow pane, Then the stepper keeps its dots and shows only the label of the current step; the breadcrumb wraps.
7. Given keyboard or assistive technology, Then the stepper is a list with the current item marked, the buttons are reachable in order and Back never moves focus off the screen.

---

### User Story 2 - Review what is about to change (P1)

The Review step summarises the operation before the exact content is shown: a facts strip, the warnings, the backup offer and a table of every item with what it is now, what it will be and its state.

**Why this priority**: It lets the user catch a wrong choice cheaply, before looking at details.

**Independent Test**: the strip numbers add up with the table; blocked rows are listed with their reason and not counted.

**Acceptance Scenarios**:

1. Given a plan, Then a strip shows OPERATION, SOLUTION, ITEMS, FLOWS AFFECTED and TURNED ON in large figures.
2. Given the plan rows, Then a table lists WHAT, BEFORE, AFTER and STATE (a chip: Will change, Blocked with the reason).
3. Given warnings, Then a highlighted block lists them; given the backup offer, Then it can be saved here and shows as saved.
4. Given no row can be written, Then Continue is disabled and the reason is stated.

---

### Edge Cases

- The solution is refreshed while the user is in Review: the plan is discarded with a message because it was built on older data.
- The user switches view or solution: the workflow is discarded.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-021**: A change MUST run through the steps Choose, Review, Preview, Apply, Result in this order; the Apply step MUST only be reached through the confirmation of feature 005.
- **FR-022**: Every step screen MUST show a title with an icon, a stepper and a breadcrumb; the stepper MUST show done, current and upcoming steps without relying on colour alone (check, number, label).
- **FR-023**: Back and the breadcrumb links to earlier steps MUST keep the selection, the choices, the layout choices and the scroll position; they MUST NOT write.
- **FR-024**: After the write has started no earlier step MUST be reachable; leaving the workflow before that discards the plan.
- **FR-025**: The Review step MUST show a facts strip, the warnings, the backup offer and a table of the plan rows; its figures MUST agree with the table.
- **FR-026**: The workflow MUST adapt to a narrow pane and be operable by keyboard; the stepper MUST be marked for assistive technology (list, current step).
- **FR-027**: The state of the workflow MUST be part of the store, so that rebuilding the view on every change keeps the step, the choices and the focus.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- SC-601: a user reaches the end of a change by following the stepper without reading help.
- SC-602: Back never loses a choice.
- SC-603: 0 writes before the Apply step.

## Assumptions

- The Choose step is the existing solution screen; its "Preview" buttons become "Review changes".
- The two operations (change connection, re-point flows) never share a workflow.

## Implementation map

- `src/model/workflow.ts`
- src/state/reducer.ts (wizard)
- `src/views/workflow.ts`
- `src/views/review.ts`
- src/ui (kit: stepper, factStrip)

## Verification

Every requirement above is covered by tests; mutation checks guard the rules that can be broken silently (`npm run test:mutation`). What tests cannot see is in [the manual checks](../000-connection-reference-governance/quickstart.md).

- test/workflow.test.ts
- test/reducer.test.ts "wizard"
- test/review.test.ts
- test/ui.kit.test.ts (stepper, strip)
