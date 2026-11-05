# Feature Specification: Change the connection of references

**Feature Branch**: `003-change-connection`

**Created**: 2026-11-04

**Status**: Implemented

**Part of**: [Product overview](../000-connection-reference-governance/spec.md)

**Input**: Bulk change of the connection used by selected connection references: every flow that uses them follows.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Change the connection of references in bulk (P2)

The user selects references, picks an existing connection of the same connector or pastes a connection id, and goes on to review. The count of selected references and affected flows is always visible.

**Why this priority**: The main fix for references left on a default or on the wrong owner.

**Independent Test**: the plan lists exactly the selected rows; a failing row is reported alone.

**Acceptance Scenarios**:

1. Given a selection, Then the block shows how many references are selected and how many flows are affected before anything can be previewed.
2. Given no selection, Then the choice of connection and the button are disabled.
3. Given references of different connectors, Then the choice is disabled and says why (a connection belongs to one connector).
4. Given references of one connector, Then the list offers the connections already used by references of that connector, each named by the references that use it, and a field to paste another id.
5. Given a pasted id, Then it is trimmed, kept, and the list returns to its placeholder; typing never loses the cursor.
6. Given a connection id used by no reference of that connector, Then the plan carries a warning (not a block).

---

### Edge Cases

- A reference already using the chosen connection is blocked as "Already uses this connection".
- A blank id is blocked.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-006**: The tool MUST show the count of selected rows and affected flows before the preview can be opened.
- **FR-011**: The tool MUST NOT create or delete anything; it changes only the connection id of existing references.
- **FR-016**: The plan MUST warn when an affected flow is turned on, when a connection id is not known for the connector, and when a reference belongs to another user; a selection mixing connectors MUST be blocked.
- **FR-019**: The screen MUST NOT offer a connection choice for a selection that mixes connectors.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- SC-301: a change of connection for any number of references needs one review and one confirmation.
- SC-302: 0 writes on managed references or on mixed-connector selections.

## Assumptions

- A connection id is the id of the connection in the connection service; the tool cannot verify that it exists, only that it is used by a reference of the same connector.

## Implementation map

- src/model/plans.ts (planConnectionChange)
- src/views/main.ts (actionBar, knownConnections)
- `src/state/reducer.ts`
- src/controller.ts (previewConnection)

## Verification

Every requirement above is covered by tests; mutation checks guard the rules that can be broken silently (`npm run test:mutation`). What tests cannot see is in [the manual checks](../000-connection-reference-governance/quickstart.md).

- test/plans.test.ts "planConnectionChange"
- test/views.test.ts "change the connection: pick or paste", "re-point: only compatible choices"
- test/reducer.test.ts
