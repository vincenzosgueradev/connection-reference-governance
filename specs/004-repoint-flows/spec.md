# Feature Specification: Re-point flows to another reference

**Feature Branch**: `004-repoint-flows`

**Created**: 2026-11-04

**Status**: Implemented

**Part of**: [Product overview](../000-connection-reference-governance/spec.md)

**Input**: Bulk re-point of selected flows from one connection reference to another reference of the same connector in the same solution, rewriting only the reference name in the flow definition.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Re-point flows to another reference (P3)

The user selects flows, chooses the reference they use now and the one they should use instead, and goes on to review. Only compatible choices exist on screen.

**Why this priority**: It moves flows between references without opening each flow, the riskiest write of the tool.

**Independent Test**: for every definition shape the new definition equals the old one with exactly one reference name replaced; each refusal gives a blocked row with its reason.

**Acceptance Scenarios**:

1. Given no reference to replace is chosen, Then the new reference is disabled and a line says what to do first.
2. Given a reference to replace, Then the new reference offers only the other references of the same connector in this solution; if there is none the screen says so.
3. Given the reference to replace changes to another connector, Then the new reference is cleared; given the selected flows change so none uses the reference to replace, Then both choices are cleared.
4. Given several selected flows, Then each reference to replace shows how many of them use it ("Ref 1 (2 of 3 flows)").
5. Given a flow that is not off (on or suspended), Then its row is blocked with "turn it off first".
6. Given a managed flow or solution, a target outside the solution or of another connector, or a definition that cannot be edited safely, Then the row is blocked with its reason.
7. Given a valid row, Then only the connection reference name changes and the rest of the definition is kept byte for byte.

---

### Edge Cases

- A definition with an escaped reference name is refused rather than guessed.
- A flow that does not declare the chosen reference is blocked.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-010**: Re-pointing MUST change only the reference name, and MUST block a missing target, a target outside the solution or of another connector.
- **FR-017**: Only flows that are off MUST be re-pointed; the new definition MUST be made by an in-place text edit and verified against the same change on the parsed document before it is offered for writing.
- **FR-019**: The screen MUST offer only choices the planner would accept; the reducer MUST keep the choices compatible; the planner stays as a second guard.
- **FR-401**: Fields Microsoft does not document (authentication, host reference name) MUST NOT be written into a definition until a recorded hand test shows they are needed.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- SC-401: 0 flows rewritten while turned on.
- SC-402: for every tested definition shape the result differs from the original in exactly one reference name.
- SC-403: 0 incompatible choices reachable from the screen.

## Assumptions

- Whether a flow that is on accepts a definition update is unverified; such flows are blocked until a hand test is recorded.
- The definition shape (connectionReferences entries with connection.connectionReferenceLogicalName) is from documentation and must be confirmed on a real flow.

## Implementation map

- src/model/clientdata.ts (repointClientData)
- `src/model/repoint.ts`
- src/model/plans.ts (planRepoint)
- src/state/reducer.ts (compatible)
- src/views/main.ts (actionBar)

## Verification

Every requirement above is covered by tests; mutation checks guard the rules that can be broken silently (`npm run test:mutation`). What tests cannot see is in [the manual checks](../000-connection-reference-governance/quickstart.md).

- test/clientdata.test.ts
- test/repoint.test.ts
- test/plans.test.ts "planRepoint"
- test/reducer.test.ts "re-point choices"
- test/views.test.ts "re-point: only compatible choices"
