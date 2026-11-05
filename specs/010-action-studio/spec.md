# Feature Specification: Action studio: a roomy, expandable dialog for choosing what to change

**Feature Branch**: `010-action-studio`

**Created**: 2026-11-04

**Status**: Implemented

**Part of**: [Product overview](../000-connection-reference-governance/spec.md)

**Input**: The choices of a change are made in a dialog of their own that can be expanded to the whole window, instead of a block that takes the room of the table. The choose screen keeps only a selection bar.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Choose in a roomy dialog (P1)

On the choose screen a bar shows how many rows are selected and one button per operation. The button opens the studio: a wide dialog with the references to replace on the left, the new reference on the right, the impact below, and a button that makes it fill the window.

**Why this priority**: The table needs the room; the choosing needs a clear, spacious place of its own.

**Independent Test**: the studio shows exactly what the choices are and what they will affect, and leaves the table untouched behind it.

**Acceptance Scenarios**:

1. Given rows are selected, Then a bar over the table shows the count (fixed width) and the button of the operation; with nothing selected the button is disabled.
2. Given the button, Then the studio opens with the title, the environment, and two columns that become one under 760 px.
3. Given the expand button, Then the studio fills the window and the button shows it is pressed; given it again, Then it returns; the choice is kept while the tool is open.
4. Given a re-point, Then the left column lists the references to replace grouped by connector with the glyph, the official name, "Select all" and "Clear", and, for each reference, its name, logical name and how many of the selected flows use it.
5. Given a re-point, Then the right column lists the possible new references as a single choice with name, logical name, connection id in full and owner, disabled with a reason until a reference to replace is chosen.
6. Given a change of connection, Then the left column lists the selected references and the right column the connections already used by references of that connector, with the references that use each, and a field to paste another id.
7. Given the impact strip, Then it shows the flows affected, the flows turned on, and the selected flows that use none of the chosen references, updating as choices change and never moving anything else.
8. Given Review changes, Then the studio closes and the review opens with these choices; given Cancel, Escape or the close button, Then nothing changes except that the studio closes and the choices are kept.
9. Given the studio, Then focus stays inside it and starts on its first control, and it works by keyboard.

---

### Edge Cases

- A selection that changes while the studio is open (it cannot: the studio is modal).
- No reference to replace is used by the selected flows: the studio says so.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-1001**: The choose screen MUST show a selection bar with the count in a fixed width and the operation button, and MUST NOT hold the choosing controls.
- **FR-1002**: The studio MUST be a dialog of the kit with an expand button (to the whole window and back), two columns that stack on a narrow pane, and a footer with Cancel and Review changes.
- **FR-1003**: The studio MUST offer only choices the planner accepts (features 003, 004, 009) and say why a control is disabled.
- **FR-1004**: The impact strip MUST be computed by pure functions from the choices and the selection.
- **FR-1005**: Opening, expanding, closing and choosing MUST write nothing, and the choices MUST survive closing and reopening.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- SC-1001: the table keeps the full height of the pane; choosing never moves it.
- SC-1002: a re-point of three references of one connector is set up in under a minute without scrolling in the expanded studio.

## Assumptions

- The studio replaces the action block of the choose screen for both operations.

## Implementation map

- `src/views/studio.ts`
- `src/model/impact.ts`
- src/state/reducer.ts (studio)
- src/views/main.ts (selection bar)
- src/ui (kit: modal, figures; the expand button and the choice list live in the studio and styles.css until the template adopts them)

## Verification

Every requirement above is covered by tests; mutation checks guard the rules that can be broken silently (`npm run test:mutation`). What tests cannot see is in [the manual checks](../000-connection-reference-governance/quickstart.md).

- test/impact.test.ts
- test/studio.test.ts
- test/reducer.test.ts "studio"
- test/ui.kit.test.ts (modal expand)
