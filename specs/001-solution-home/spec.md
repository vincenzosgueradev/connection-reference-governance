# Feature Specification: Solution home screen

**Feature Branch**: `001-solution-home`

**Created**: 2026-11-04

**Status**: Implemented

**Part of**: [Product overview](../000-connection-reference-governance/spec.md)

**Input**: The screen the tool opens on: the environment in the header, the number of unmanaged solutions and of flows, and a sortable, searchable table of the unmanaged solutions with their flow count. Choosing a solution opens it.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See the solutions and how many flows each holds (P1)

On opening, the user sees the connected environment in the header, a banner with the number of unmanaged solutions and of flows, and a table of the unmanaged solutions with name, unique name, number of flows, creation date, version and publisher.

**Why this priority**: It is the entry point of everything else and answers "where are my flows" in one glance.

**Independent Test**: with synthetic solutions and counts the hero, the table and the sort order are exactly as specified; counts that cannot be read show a dash.

**Acceptance Scenarios**:

1. Given the tool opens, Then the header shows the connection name with a status dot (green when connected, red on error, grey while connecting).
2. Given unmanaged and managed solutions exist, Then only unmanaged ones are listed, and a disabled Managed tab shows how many managed ones exist and why they are not offered ("cannot be changed").
3. Given flow counts are read, Then each row shows its count as a pill and the table is sorted by flows, most first; unknown counts are shown as a dash and sort last.
4. Given a click on the header of Display name, Flows or Created, Then the table sorts by it (names A-Z first, numbers and dates biggest or newest first) and a second click flips the order; the arrow has a reserved space so the header never moves.
5. Given a creation date, Then recent ones read "3 days ago" and older than five weeks show the local date; the tooltip shows date and time.
6. Given text in the search box, Then solutions are matched by name, unique name and publisher, the empty state names the term, and a clear button empties the box.
7. Given a click or Enter on a row, Then that solution opens and the breadcrumb reads Solutions > name; going back re-reads the list.
8. Given the list is being read, Then "Updating..." with a spinner shows and nothing else on the toolbar moves.

---

### Edge Cases

- A query that returns nothing without an error is treated as a possible wrong filter and said so.
- Dates that cannot be read show nothing instead of an error.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The tool MUST work only on the connected environment and send no data anywhere else, and MUST NOT send custom request headers (they make the host ask the user for consent).
- **FR-003**: The tool MUST offer only unmanaged solutions: managed ones are not listed or opened (a disabled tab shows their count).
- **FR-101**: The home screen MUST show the connection name, the number of unmanaged solutions and the number of distinct modern flows in them (a dash when it cannot be counted).
- **FR-102**: Flow counts MUST come from definition rows of modern flows (category 5, type 1) and workflow components of the solutions; a result that may have been cut by the environment (5000 rows or more) MUST be shown as unknown, never as a wrong number.
- **FR-103**: The table MUST sort by name, flows and created, with a default of flows descending, and MUST keep the order stable (ties by name).
- **FR-104**: The list MUST be re-read on every entry and on Refresh, showing the previous data meanwhile.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- SC-101: a user finds the solution with the most flows without scrolling or sorting by hand.
- SC-102: 0 managed solutions are listed or can be opened.
- SC-103: no element of the toolbar changes width or position while loading.

## Assumptions

- The publisher name is a convenience: if the environment refuses the expand, the solutions are read without it.

## Implementation map

- src/views/main.ts (solutionList)
- `src/model/solutions.ts`
- `src/model/time.ts`
- src/services/dataverse.ts (loadSolutions, loadFlowCounts)
- `src/controller.ts`
- `src/app.ts`
- src/ui (kit: hero, statTile, segmented, searchBox, dataTable sort, connectionBadge)

## Verification

Every requirement above is covered by tests; mutation checks guard the rules that can be broken silently (`npm run test:mutation`). What tests cannot see is in [the manual checks](../000-connection-reference-governance/quickstart.md).

- test/views.test.ts "solutions list and navigation"
- test/home.model.test.ts
- test/dataverse.test.ts (loadSolutions, loadFlowCounts)
- test/reducer.test.ts
- test/noCustomHeaders.test.ts
- test/ui.kit.test.ts
