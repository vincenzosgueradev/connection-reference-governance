# Feature Specification: Preview of exactly what will be stored

**Feature Branch**: `007-change-diff-preview`

**Created**: 2026-11-04

**Status**: Implemented

**Part of**: [Product overview](../000-connection-reference-governance/spec.md)

**Input**: The Preview step shows, for every item to change, the exact before and after as a line diff like an IDE (split or unified) or as a table of the changed fields, with unchanged lines collapsed.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See exactly what will be written (P1)

For each item the user sees the content as it is stored and as it will be stored, with removed lines in red, added lines in green, changed words highlighted, line numbers and unchanged stretches collapsed.

**Why this priority**: The most reliable way to trust a write is to see the bytes that will change.

**Independent Test**: the diff of every writable row reconstructs exactly the value that will be written.

**Acceptance Scenarios**:

1. Given a flow to re-point, Then its definition is shown formatted, before and after, with the changed lines marked - and + (not by colour alone) and three lines of context around each change.
2. Given a reference whose connection changes, Then the record (id, logical name, connection id) is shown before and after in the same way.
3. Given a stretch of unchanged lines, Then it is collapsed to one band "N unchanged lines".
4. Given a changed line, Then the part that differs is highlighted inside the line.
5. Given the layout switch, Then Split shows two columns and Unified one column, for all items at once.
6. Given an item, Then it can be collapsed with its chevron; its header shows the name, the id, the number of changes and a Diff / Table switch.
7. Given Table, Then the item shows WHAT, BEFORE, AFTER and STATE for each changed field, with the old value, the new value and a chip.
8. Given a blocked item, Then it is listed with its reason, without a diff, and is not counted.
9. Given more than twenty items, Then twenty are shown and a button shows twenty more.
10. Given long lines or large definitions, Then the diff scrolls inside its frame, the page does not, and a definition too large to compare line by line says so instead of failing.

---

### Edge Cases

- Identical before and after (nothing to change) cannot be a writable row; it is blocked by the planner.
- A definition that is not JSON is shown as plain lines.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-028**: The Preview step MUST show, for every writable item, a diff of the stored value and the value that will be stored; the "after" side MUST be exactly the payload of the plan.
- **FR-029**: The diff MUST be computed by a pure function over lines, with a fixed number of context lines (3), collapsing longer unchanged stretches, and MUST mark changed words inside a changed line.
- **FR-030**: Added and removed lines MUST carry a + or - sign and line numbers; colour MUST NOT be the only signal.
- **FR-031**: The layout (Split or Unified) MUST apply to all items; each item MUST be collapsible and have a Diff / Table switch whose Table lists every changed field with before, after and a state chip.
- **FR-032**: Blocked items MUST appear with their reason and no diff, and MUST NOT be counted in the changes.
- **FR-033**: More than twenty items MUST be shown in pages of twenty; a diff that is too large to compute MUST be reported as such.
- **FR-034**: The Preview step MUST offer Back (to Review) and Apply, which opens the confirmation of feature 005 and writes nothing by itself.
- **FR-035**: Colours MUST come from the tokens of the UI kit; the diff MUST be readable in both themes and scroll inside its frame.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- SC-701: for every writable row the diff of before and after, rebuilt, equals the payload.
- SC-702: a one-name change in a 3000-line definition shows as three lines of context, one removed, one added and two collapsed bands.
- SC-703: no page-level horizontal scroll with long lines.

## Assumptions

- A flow definition is shown formatted (indented JSON); the formatting is only for reading, the stored text is not reformatted by the write.
- The record shown for a reference holds only its identifying fields and the connection id.

## Implementation map

- `src/model/diff.ts`
- `src/model/planDiff.ts`
- `src/views/preview.ts`
- src/ui (kit: diffView, collapsible item head)

## Verification

Every requirement above is covered by tests; mutation checks guard the rules that can be broken silently (`npm run test:mutation`). What tests cannot see is in [the manual checks](../000-connection-reference-governance/quickstart.md).

- test/diff.test.ts
- test/planDiff.test.ts
- test/preview.test.ts
- test/ui.kit.test.ts (diff)

## Amendment 2026-11-05 (hand look: one kind of header)

The grey strip of figures at the top of the Preview and the strip of facts at the top of the Result are replaced by the same banner as the home screen (title, one line, stat tiles with icons): the Preview names the operation and the solution and shows Items, Changes and Not changed; the Result names the operation, the solution and the environment and shows the number of rows. Wherever a screen has a header of this kind it uses this banner.
