# Feature Specification: Turn flows off for the change and on again afterwards

**Feature Branch**: `011-flow-state-management`

**Created**: 2026-11-04

**Status**: Implemented

**Part of**: [Product overview](../000-connection-reference-governance/spec.md)

**Input**: A flow that is turned on cannot be re-pointed by the tool alone. With the user's explicit permission the tool turns such flows off, writes, checks and turns them on again, and tells the user everything that this means.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Let the tool turn flows off and on (P1)

When some selected flows are on, the user can allow the tool to turn them off before the change and on again after it. Everything that this means is shown, in a dialog with the steps of the run, before the user agrees.

**Why this priority**: Turning each flow off by hand in the maker portal and on again is slow and easy to forget.

**Independent Test**: with permission an on flow is changed and ends on again; without it the flow stays blocked; nothing is turned off without both the choice and the acknowledgement.

**Acceptance Scenarios**:

1. Given selected flows that are on, Then the summary step of the studio (not each connector step) offers "Turn these flows off for the change and on again afterwards", off by default, with the number of flows.
2. Given the choice is off, Then flows that are on stay blocked as before ("turned on: turn it off first, or let the tool do it").
3. Given the choice is on, Then flows that are on are written and the plan says per row that it will be turned off and on; flows that are suspended or managed stay blocked.
4. Given the confirmation, Then it lists what happens to the flows that are turned off: they do not run until turned on, triggers that fire meanwhile are not handled, runs already started continue, turning on can be refused (connections, policies) and then the flow stays off, the tool must not be closed, and the flows are listed by name.
5. Given the confirmation, Then it needs the general acknowledgement and, when flows will be turned off, a second one that says so; Apply stays disabled until both are ticked.
6. Given the run, Then it has the phases Confirmed, Turn off, Write and verify, Turn on, Refresh, Summary; a flow that could not be turned off is not written and is reported; every flow that was turned off is turned on again, also when its write failed.
7. Given a flow that could not be turned on again, Then the result says so prominently, by name, with the instruction to turn it on in the maker portal.
8. Given a flow that was off before, Then it is never turned on.

---

### Edge Cases

- The tool is closed during the run: flows may stay off; the warning says so and the report and the log name them.
- A flow owned by another user may refuse the change of state: reported as a failed row.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-1101**: The tool MUST NOT change the state of a flow without the choice of the user and a dedicated acknowledgement; the choice MUST be off by default.
- **FR-1102**: Only flows that are on (state 1) MUST be turned off; the state is changed by updating statecode and statuscode (Draft, status 1 to turn off; Activated, status 2 to turn on, from the official option lists) and MUST be read back after each change.
- **FR-1103**: Every flow turned off MUST be turned on again at the end of the run, whatever happened to its write; a flow that was off, suspended or managed MUST never be turned on or off.
- **FR-1104**: A flow that cannot be turned off MUST NOT be written; a flow that cannot be turned on again MUST be reported as failed, by name, with the instruction.
- **FR-1105**: The confirmation MUST list the consequences and the flows concerned, show the phases of the run, and the report MUST record which flows were turned off and whether they are on again.
- **FR-1106**: Each state change MUST be preceded by the check that the stored state is still the expected one.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- SC-1101: in 100% of tested runs every flow turned off is on again at the end or reported by name.
- SC-1102: 0 state changes without the choice and both acknowledgements.

## Assumptions

- Updating statecode and statuscode of a workflow row is the supported way to turn a flow on or off by code; whether the environment accepts it for every flow (owner, connections, policies) is checked per flow and reported (hand check 32).
- Runs that were already started when a flow is turned off continue to completion (Microsoft Learn, Turn a flow on or off).

## Implementation map

- src/model/plans.ts (manageState, turnOff rows)
- src/services/dataverse.ts (applyPlan phases, setFlowState)
- src/model/progress.ts (phases with state steps)
- src/model/report.ts (flows turned off)
- src/views/confirm.ts (consequences, second acknowledgement)
- src/views/studio.ts (the choice)

## Verification

Every requirement above is covered by tests; mutation checks guard the rules that can be broken silently (`npm run test:mutation`). What tests cannot see is in [the manual checks](../000-connection-reference-governance/quickstart.md).

- test/plans.test.ts "manage state"
- test/dataverse.test.ts "flow state"
- test/progress.test.ts
- test/confirm.test.ts
- test/studio.test.ts
- test/result.test.ts
