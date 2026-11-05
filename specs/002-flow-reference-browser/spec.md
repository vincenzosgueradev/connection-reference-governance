# Feature Specification: Flows and connection references browser

**Feature Branch**: `002-flow-reference-browser`

**Created**: 2026-11-04

**Status**: Implemented

**Part of**: [Product overview](../000-connection-reference-governance/spec.md)

**Input**: Inside a solution: one table of flows and one of connection references, each row opening a details panel; flags for what can be proven; connector names and glyphs; search; consistent between the two views.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See which connection every flow really uses (P1)

Choosing a solution shows one row per flow with its type, state, connections in brief and last modified date. Opening a row shows key-value details and a table of its connections with reference, connector and connection in full.

**Why this priority**: It answers "what does this flow run on" without opening flows one by one.

**Independent Test**: with synthetic flows of every type and state the rows, tiles and details are as specified.

**Acceptance Scenarios**:

1. Given a flow, Then its type is Instant (Request trigger), Scheduled (Recurrence trigger), Automated (any event trigger) or Unknown (no readable trigger), each with its own icon and colour and a tooltip.
2. Given a flow with connections, Then the row shows one small tile per connection (tinted by kind of service, with the connector and reference name as tooltip) and how many there are.
3. Given a click on a row or its chevron, Then a full-width details row opens with key-value pairs (type, state, trigger, actions, owner, created, modified, flow id, description) and a table of connections; a click on the check does not open it.
4. Given a long value, Then it wraps in full: nothing is truncated; on a narrow pane secondary columns drop out step by step and the details keep everything.
5. Given the search box, Then flows are matched by name, description, type, owner and reference names.
6. Given a long description, Then it is cut to one line with the full text as tooltip, and the Modified column never wraps its text, so rows stay short and the space goes to the flow name.
7. Given the page or the table was scrolled, Then selecting or opening rows keeps the scroll position and the focus.

---

### User Story 2 - Spot what needs attention (P1)

Rows with a provable problem carry a short warning chip; the full sentence is its tooltip. Nothing is flagged that the data does not prove.

**Why this priority**: It turns the list into governance.

**Independent Test**: fixtures with each condition give exactly the expected flags and fixtures without it none.

**Acceptance Scenarios**:

1. Given a reference without a connection, Then it is flagged "No connection".
2. Given a flow that declares a reference missing from the environment, Then it is flagged "Missing reference" with the name.
3. Given an expected owner and connection owner and state data (not available today), Then owner and state flags exist in the model and are tested, and stay off until a verified source exists.
4. Given no row has a flag, Then there is no attention column; given some, Then the panel says how many need attention.

---

### User Story 3 - View grouped by reference (P2)

A second view lists the connection references of the solution: glyph, name and logical name, connector (custom connectors marked), connection in full, owner of the reference and how many flows use it; opening a row shows the details and the flows that use it.

**Why this priority**: It is the entry point for changing a connection and for judging impact.

**Independent Test**: both views agree on every reference-to-flow relation.

**Acceptance Scenarios**:

1. Given a reference used by three flows, Then it shows "3 flows" and the details list them with type and state.
2. Given an unused reference, Then it shows "No flow".
3. Given a reference with a custom connector id, Then a "Custom connector" chip marks it; given none, no chip.
4. Given the owner column, Then its tooltip says it is the owner of the reference row, not of the connection.

---

### Edge Cases

- A flow that uses no reference says so.
- A flow whose definition cannot be read says so and is never guessed at.
- A solution without flows or references has an empty state naming it and the filter.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-002**: The tool MUST list, for the chosen solution, its modern flows with their connection references; desktop flows are out of scope.
- **FR-004**: The tool MUST flag only proven conditions: reference without connection, flow declaring a missing reference (and, when a verified source exists, connection owner and state); each flag MUST state its data.
- **FR-005**: The two views MUST be consistent with each other and re-read on entry.
- **FR-012**: Solution membership MUST be resolved by object id, never by a hard-coded component type for connection references (none is documented); the workflow component type (29) is from the official list.
- **FR-018**: Each flow row MUST show type, state, connections in brief and last modified date; opening it MUST show key-value details and a table of its connections; nothing is truncated and the layout adapts to a narrow pane.
- **FR-201**: The flow type MUST be derived only from the first trigger of the definition (Recurrence is scheduled, Request is instant, any other is automated, none is unknown).
- **FR-202**: Connector names MUST be the official display names; an unknown connector MUST get a readable name made from its id; icons MUST be original category glyphs, never third-party logos, and need no network.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- SC-201: every flow of a solution is visible with its connections without opening any flow.
- SC-202: 100% of provable problems are flagged and 0 unproven ones.
- SC-203: the flow and reference views agree on every relation.

## Assumptions

- Connection owner and connection state are not readable from the connected environment; the owner shown is the owner of the reference row.
- Official connector icons are not published as SVG (research.md); category glyphs are used.

## Implementation map

- `src/model/analysis.ts`
- `src/model/flowinfo.ts`
- `src/model/connectors.ts`
- src/model/clientdata.ts (readReferenceNames)
- `src/views/connections.ts`
- `src/views/detail.ts`
- src/views/main.ts (flowsTable, referencesTable)
- src/services/dataverse.ts (loadSnapshotInput, owner names)
- src/ui (kit: selectableTable detail rows, keyValues, detailBlock, chips, icons)

## Verification

Every requirement above is covered by tests; mutation checks guard the rules that can be broken silently (`npm run test:mutation`). What tests cannot see is in [the manual checks](../000-connection-reference-governance/quickstart.md).

- test/analysis.test.ts
- test/flowinfo.test.ts
- test/connectors.test.ts
- test/views.test.ts "records", "references table", "icons", "long values", "stable layout"
- test/dataverse.test.ts
- test/ui.kit.test.ts
