# Feature Specification: Guided choosing, one category at a time

**Feature Branch**: `014-guided-categories`

**Created**: 2026-11-05

**Status**: Implemented

**Part of**: [Product overview](../000-connection-reference-governance/spec.md)

**Input**: Hand test of the studio: all the categories at once are crowded and ugly. Show one connector at a time, animated, with a pipeline to go forward and back through the connectors, and always, underneath, everything chosen so far with the possibility to remove it.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A pipeline of categories (P1)

The studio of a re-point shows a pipeline along the top: one step for each connector used by the selected flows, then a Summary step. Only the current step is shown in full. The user ticks the references to replace and chooses the reference to use instead for that connector, goes on with Next, can go back with Back or by clicking a step, and ends on the Summary. Under the step there are always the figures of what the choices touch.

**Why this priority**: One connector at a time is calm and clear; the crowd of cards was not.

**Independent Test**: go through two categories with Next, choose in each, come back with Back and find the choices, end on the Summary and press Review changes.

**Acceptance Scenarios**:

1. Given a re-point, Then the pipeline has one step per connector, in the order of the references, with its glyph and name, followed by a Summary step; the first step is current.
2. Given a step, Then it shows the references of that connector only: left the references to replace (check, name, logical name, bar and percentage, Select all and Clear), right the references to use instead as a single choice with name, logical name, connection in full and owner.
3. Given a step with nothing chosen, Then Next leaves that category unchanged and the pipeline marks it "not changed".
4. Given a step with references ticked and no new reference chosen, Then Next is disabled with the reason, and the pipeline marks the step as incomplete.
5. Given a step with both choices, Then the pipeline marks it done with a check.
6. Given Back, Next or a click on a step, Then the new step slides in from the side it lies on (right for forward, left for back); redrawing the same step by a choice does not replay the motion; with reduced motion there is none.
7. Given any step, Then the figures stay under it in the same place; Back and Next are in the bar at the bottom with Cancel and Review changes; the step has no bar of its own with the connector name (the pipeline shows it) and there is no overview (the pipeline marks and the Summary say what is chosen).
8. Given the Summary, Then it lists every category with its state (done, incomplete, not changed) and an Edit link to its step, and says that nothing is written yet; Review changes is enabled only when at least one category is done and none is incomplete.
9. Given Select every category, Then every reference of every category is ticked (the new references are still chosen step by step); Clear all removes every choice.
10. Given a change of connection, Then there is one step only and the screen is the one of feature 010, without the pipeline.

---

### Edge Cases

- Only one connector in use: the pipeline has that step and the Summary.
- A category whose only reference is the one in use: the step says there is nothing to offer; the category cannot be changed and Next is allowed.
- The step shown is always one that exists: after the selection or the data change it is brought back into range.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-1401**: The categories of a re-point MUST be computed by a pure function from the snapshot and the selection, one per connector, each with its references.
- **FR-1402**: The state MUST keep the current step; moving to a step MUST never change the choices.
- **FR-1403**: Next MUST be refused (disabled with a reason) while the step has references ticked and no new reference; nothing else limits moving.
- **FR-1404**: The motion MUST play only when the step changes, and MUST respect reduced motion.
- **FR-1405**: The figures MUST be visible on every step, with the layout unchanged from step to step.
- **FR-1406**: Review changes MUST follow the rules of feature 013 for what is ready.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- SC-1401: a re-point of three categories is set up by pressing Next three times, with no scrolling in the expanded studio.
- SC-1402: going back never loses a choice.

## Assumptions

- Replaces the two-column all-categories screen of feature 013 for a re-point; the rules of 013 (groups, one write per flow) are unchanged.

## Implementation map

- src/model/repoint.ts (categories of a selection)
- src/state/reducer.ts (studioStep)
- src/views/studio.ts, src/styles.css

## Verification

Every requirement above is covered by tests; mutation checks guard the rules that can be broken silently (`npm run test:mutation`). What tests cannot see is in [the manual checks](../000-connection-reference-governance/quickstart.md).

- test/categories.test.ts
- test/studio.test.ts "pipeline"
- test/reducer.test.ts "studio step"
