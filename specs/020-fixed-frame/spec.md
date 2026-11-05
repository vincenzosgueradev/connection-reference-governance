# Feature Specification: A fixed frame: only the list scrolls, the buttons stay at the bottom

**Feature Branch**: `020-fixed-frame`

**Created**: 2026-11-05

**Status**: Implemented

**Part of**: [Product overview](../000-connection-reference-governance/spec.md)

**Input**: Hand test: on every page the upper part (header of the page, banner, title, stepper) scrolled away with the content, and the buttons of a step were at the end of the content, out of sight. Make the upper section stay, scroll only what needs it, and keep the buttons at the bottom of the page.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The top stays, the list scrolls (P1)

On the list of solutions the banner, the filter and the tabs stay; the table scrolls inside the remaining height with its own header. On a solution the panel header, toolbar, hint and action bar stay; the table scrolls. On a step (Preview, Apply, Result) the breadcrumb, the title and the stepper stay; the body scrolls.

### User Story 2 - The buttons of a step are always in view (P1)

The buttons of a step (Back, Apply..., Save report, Back to solution) sit in a bar at the bottom of the page, over the log dock, whatever the length of the content.

### User Story 3 - The Result has no banner repeating the operation (P2)

The Result shows the banner of the outcome, the figures and the rows; the grey banner with the name of the operation and the number of rows is removed (the breadcrumb and the report already say it).

## Requirements *(mandatory)*

- **FR-2001**: The page itself MUST NOT scroll; the list or the body of a step scrolls inside the room left by the fixed parts.
- **FR-2002**: The footer of a step MUST be fixed at the bottom of the page.

## Implementation map

- src/views/workflow.ts (`step-body`), src/views/main.ts (`screen`), src/styles.css (the frame), src/views/result.ts

## Verification

- test/result.test.ts; manual check 40 in [the quickstart](../000-connection-reference-governance/quickstart.md) (layout is not testable in jsdom).

## Amendment 2026-11-05 (hand look: scroll)

1. A table that is the main content of a step (the rows of the Result) takes the room that is left and scrolls by itself; the page and the body of the step do not scroll as well, so there is never a second scrollbar around it.
2. Moving from one page to another always opens the new page at the top: another solution, the other view (flows or references), another step (Preview, Apply, Result), the other tab of the Preview, or the removal dialog. A redraw of the same page (selecting a row, a result arriving) keeps its place. Test: test/views.test.ts "scroll when the page changes".

## Amendment 2026-11-05 (review)

The breadcrumb of a step names only where you are (Solutions / the solution / Result): the stepper beside the title already shows the steps that were done, and repeating them cost a line of attention for nothing.
