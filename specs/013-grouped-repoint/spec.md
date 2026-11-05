# Feature Specification: Re-point by category: every connector in one operation

**Feature Branch**: `013-grouped-repoint`

**Created**: 2026-11-04

**Status**: Implemented

**Part of**: [Product overview](../000-connection-reference-governance/spec.md)

**Input**: Hand test: the references to replace are grouped by category (connector); for each category the user ticks one reference or all of them and chooses the reference to use instead; all the categories are changed together, in one operation, with visual indicators (icons, colours, percentages).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - One operation for every category (P1)

A solution has flows that use three Outlook references and three SharePoint references. In the studio the references to replace are grouped by connector. For each group the user ticks one, some or all references and, right next to it, chooses the reference of that connector to use instead. One Review changes rewrites every flow once, for all the categories.

**Why this priority**: Without it a re-point of two connectors is two operations, two reviews, two confirmations and two runs.

**Independent Test**: choose two categories, review, apply: each flow holds the new reference of each category, nothing else changed.

**Acceptance Scenarios**:

1. Given selected flows, Then the left column shows one card per connector with its glyph and colour, the connector name, how many of its references are chosen, and a bar with the share of the selected flows that use it.
2. Given a card, Then each reference shows a usage bar and a percentage of the selected flows, and the card offers "Select all" and "Clear" for that category only.
3. Given the top of the column, Then "Select every category" ticks all references of all categories and "Clear all" unticks them.
4. Given a category with at least one reference ticked, Then the right column shows a card for the same connector with the references that can be used instead (the ticked ones included), as a single choice.
5. Given categories that have no reference ticked, Then they are neither asked for a new reference nor changed.
6. Given categories with references ticked, Then Review changes stays disabled until every one of them has a new reference, and says which are missing.
7. Given the review, Then each flow is one row that shows every reference it will lose and every one it will gain, and is written once.
8. Given a flow that holds none of the chosen references, Then its row is blocked with the reason and is not counted.
9. (Replaced by feature 014: the pipeline and the Summary show what is chosen, and the overview was removed.) An overview under the choices lists, as they are made, one line per category (connector, references to replace, an arrow, the new reference or a "Choose one" mark) and says "Nothing chosen yet" when empty; for a change of connection it lists the references and the connection.
10. Given the impact strip, Then it shows the categories, the flows affected, the flows turned on and the flows without any chosen reference, and keeps its shape.

---

### Edge Cases

- A category whose only reference is the one the flows use: nothing to offer, the card says so and the category cannot be changed.
- A flow that holds two references of one category and one of another: still one row, one write.
- Closing the studio keeps the choices of every category.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-1301**: The choices of a re-point MUST be a list of groups, one per connector, each with the references to replace and the reference to use instead; features 003, 004 and 009 remain the rules inside a group.
- **FR-1302**: The planner MUST apply every group to each flow in one rewrite, each step verified as in feature 003, and MUST NOT write a flow more than once.
- **FR-1303**: A group without a new reference MUST block Review changes; a connector with no reference ticked MUST be left alone.
- **FR-1304**: The state MUST keep every group compatible with the selected flows and the solution: unknown or unused references, a new reference of another connector or one not in the solution are dropped.
- **FR-1305**: The shares and counts shown MUST come from pure functions of the selection and the choices.
- **FR-1306**: Colours and icons MUST come from the connector catalog and the theme tokens, never from fixed colours.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- SC-1301: a re-point of three categories is one review, one confirmation and one run.
- SC-1302: every share shown equals the count it is computed from.

## Assumptions

- The studio of feature 010 hosts it; the single-category flow of feature 009 is the same screen with one group.

## Implementation map

- src/model/plans.ts (planRepoint with groups)
- src/model/impact.ts (impact of groups, usage shares)
- src/model/repoint.ts (RepointGroup)
- src/state/reducer.ts (repointGroups)
- src/views/studio.ts, src/styles.css

## Verification

Every requirement above is covered by tests; mutation checks guard the rules that can be broken silently (`npm run test:mutation`). What tests cannot see is in [the manual checks](../000-connection-reference-governance/quickstart.md).

- test/groups.test.ts
- test/studio.test.ts "by category"
- test/reducer.test.ts "groups"
