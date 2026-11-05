# Feature Specification: Re-point several references to one in a single operation

**Feature Branch**: `009-multi-source-repoint`

**Created**: 2026-11-04

**Status**: Implemented

**Part of**: [Product overview](../000-connection-reference-governance/spec.md)

**Input**: When flows use several references of the same connector (three Outlook references, for example), the user chooses all the references to replace and one reference to use instead, in one operation: n sources, one target.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Replace several references at once (P1)

The user selects flows, then chooses one or more references to replace (all of one connector) and one reference to use instead. Every selected flow has every chosen reference it uses replaced by the new one.

**Why this priority**: A solution often has several references of the same connector; one operation per reference would be n reviews, n confirmations and n runs for one decision.

**Independent Test**: with flows using three references of one connector, one plan replaces all three by the chosen target, and each flow row changes exactly the names it holds.

**Acceptance Scenarios**:

1. Given the selected flows use references of one or more connectors, Then the references to replace are grouped by connector, each with how many of the selected flows use it.
2. Given the user ticks a reference, Then the other connectors are disabled with the reason "one connector at a time"; given none is ticked, Then all groups are available.
3. Given a connector group, Then it offers "Select all" and "Clear" for its references.
4. Given at least one reference to replace, Then the new reference is chosen among the references of the same connector in this solution, including one of the chosen ones (consolidation): that one is then not replaced.
5. Given a chosen new reference, Then the plan has one row per flow that uses at least one chosen reference, and replaces every chosen reference that flow holds.
6. Given a selected flow that uses none of the chosen references, Then its row is blocked "does not use any of the chosen references" and the summary counts it.
7. Given a flow that holds two or more of the chosen references, Then the plan warns that after the change it points to the same reference more than once.
8. Given the chosen references or the selected flows change so that a choice no longer applies, Then the choices that no longer apply are cleared.

---

### Edge Cases

- Sources of two connectors cannot be mixed; the user does it in two operations.
- A target equal to the only source gives nothing to replace and is not offered.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-901**: The chosen references to replace MUST all be of one connector, and the new reference MUST be of that connector and in the solution; the screen MUST NOT offer anything else and the planner MUST block anything else.
- **FR-902**: The new reference MAY be one of the chosen ones; it is then never replaced by itself.
- **FR-903**: Each plan row MUST replace every chosen reference the flow holds, in one in-place edit verified as in feature 004; the row MUST list the old names and the new one.
- **FR-904**: A flow holding two or more chosen references MUST produce a warning that several entries will point to the same reference (to be confirmed by hand check 31).
- **FR-905**: The state MUST keep the choices compatible with the selection after every change.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- SC-901: three references of one connector are replaced by one in one review, one confirmation and one run.
- SC-902: 0 incompatible combinations reachable.

## Assumptions

- Whether a flow definition may hold several connection entries pointing to the same reference is believed valid and must be confirmed on a real flow (quickstart 31).

## Implementation map

- src/model/clientdata.ts (repointClientData with several sources)
- src/model/repoint.ts (sources by connector, targets)
- src/model/plans.ts (planRepoint with several sources)
- src/state/reducer.ts (repointFrom list, compatible)

## Verification

Every requirement above is covered by tests; mutation checks guard the rules that can be broken silently (`npm run test:mutation`). What tests cannot see is in [the manual checks](../000-connection-reference-governance/quickstart.md).

- test/clientdata.test.ts
- test/repoint.test.ts
- test/plans.test.ts
- test/reducer.test.ts
