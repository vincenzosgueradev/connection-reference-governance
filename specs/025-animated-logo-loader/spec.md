# Feature Specification: Animated logo loader

**Feature Branch**: `025-animated-logo-loader`

**Created**: 2026-11-13

**Status**: Built and hand-tested (2026-11-13)

**Part of**: [Product overview](../000-connection-reference-governance/spec.md)

**Input**: The author, while testing on 2026-11-13: when the tool loads, the screen is almost empty with a plain line of text ("Reading the solution..."), nothing moves, and it looks broken or unfinished. The author asks for the tool's own logo, animated, with a "super effect", in every wait of this kind.

## Why

A tool that is sold from a marketplace is judged in its first seconds. Today a wait that fills the whole pane (reading a solution, the first read of the connections, the first read of the solutions list) shows a dim sentence on a blank page: the person cannot tell whether the tool is working, stuck or crashed, and the first impression is "unfinished". The tool already says what it is doing in words (Principle VII, T8: every wait is visible and honest); what is missing is a wait that **looks alive** and carries the tool's identity.

This feature replaces the blank wait with the tool's own logo drawn large and animated, with the caption underneath. It changes how a wait looks, never what the tool reads or writes.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A wait that looks alive (P1)

When the whole pane has nothing to show yet because the tool is reading, the pane shows the tool's logo, large and centred: the dashed line runs from the two left nodes to the right node, as a reference being re-pointed, and the nodes pulse in turn. Under it a short caption says what is being read ("Reading the solution...", "Reading the connections of the environment... 12 read so far"). The movement never stops while the wait lasts, and the caption keeps changing with the real progress where the tool has it.

**Why this priority**: it is the whole request, and it is the first thing a buyer sees on every open.

**Independent Test**: open a solution with many flows (or throttle the network); while the pane is empty the logo animates with the caption; when the data arrives the view replaces it with no jump.

**Acceptance Scenarios**:

1. **Given** the home screen with no solutions read yet, **When** the tool opens, **Then** the animated logo and the caption "Reading the solutions..." fill the area under the header.
2. **Given** a solution was chosen, **When** its flows and references are being read, **Then** the animated logo and "Reading the solution..." are shown, with the breadcrumb and the tabs of the header kept.
3. **Given** the Connections area with no list yet, **When** it opens, **Then** the animated logo is shown with the count of connections read so far as it grows.
4. **Given** the data arrived, **When** the view draws, **Then** the logo is gone, and the list is where the logo was, with no flash of an empty page between them.

---

### User Story 2 - It respects the person's settings and the theme (P1)

The logo uses the colours of the theme (light and dark), so it is readable on both. A person who asked their system for reduced motion sees the same logo moving slowly (the wait stays visibly alive, the speed is the only change). A person using a screen reader hears one calm announcement of what is being read, not a stream of changes.

**Why this priority**: constitution VII and the marketplace policy require both themes and accessibility; a loader that fails there would be a regression, not a feature.

**Independent Test**: switch the theme and the system reduced-motion setting; the logo stays readable and keeps moving, slower under reduced motion; a screen reader announces the caption once and again only when it changes in words.

**Acceptance Scenarios**:

1. **Given** the dark theme, **When** the loader shows, **Then** the logo is light on dark; **Given** the light theme, **Then** it is dark on light; neither uses a fixed colour.
2. **Given** reduced motion is requested, **When** the loader shows, **Then** the movement is slow and gentle, not removed and not static.
3. **Given** a screen reader, **When** the loader appears, **Then** it is announced as a status with the caption; the animation itself is hidden from assistive technology.

---

### User Story 3 - It never lies and never flashes (P2)

The animation only runs while the tool is really waiting: when the read ends the logo is removed, and when the read fails it is replaced at once by the error and the way to try again (it never keeps spinning over a failure). A wait too short to notice does not flash the logo for a blink: the logo appears only if the wait lasts longer than a short moment.

**Why this priority**: it protects the honesty rule (T8) and avoids the flicker that makes a fast tool look slow.

**Independent Test**: with an instant read nothing flashes; with a failing read the error replaces the logo; with a slow read the logo appears after the short moment and stays until the end.

**Acceptance Scenarios**:

1. **Given** a read that ends in under a short moment, **When** it ends, **Then** the logo was never drawn.
2. **Given** a read that fails, **When** the failure arrives, **Then** the logo disappears and the message with Try again is shown.
3. **Given** a long read, **When** it ends, **Then** the logo is replaced by the content, with no stale logo left behind.

---

### Edge Cases

- A very narrow pane: the logo shrinks to fit and the caption wraps; nothing scrolls horizontally.
- A wait that happens inside a dialog, a button or a list that already has rows (refresh, Check, Apply): they keep the small spinner and their own progress; the large logo is only for a pane with nothing else to show.
- Two waits at once (for example the list and the usage counts): one logo, one caption, the most important one.
- A redraw while the logo is showing (the state changes): the animation continues without restarting, so it does not stutter.
- The theme changes while the logo shows: the colours follow at once.
- The logo file of the marketplace icon and the one drawn in the loader are the same drawing, so a change of icon never leaves the loader behind.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-2501**: Every wait that fills the whole content area because nothing can be shown yet MUST show the tool's logo, large and centred, animated, with a caption saying what is being read. The waits are: the first read of the solutions list, the read of a chosen solution, and the first read of the connections.
- **FR-2502**: The animation MUST show the dashed line flowing from the left nodes to the right node and the three nodes pulsing in turn, continuously, for as long as the wait lasts.
- **FR-2503**: The logo MUST be drawn with the theme's colours (no fixed colour, no external file, no image request) and MUST be readable in both themes.
- **FR-2504**: When the person requests reduced motion the animation MUST continue at a slower, gentler pace; it MUST NOT be removed or frozen.
- **FR-2505**: The loader MUST be a status region announced politely by assistive technology, with the caption as its text; the drawing itself MUST be hidden from assistive technology.
- **FR-2506**: The caption MUST come from what the tool is really doing and MUST follow real progress where the tool has a count (for example the connections read so far); it MUST NOT be driven by a timer.
- **FR-2507**: The loader MUST disappear in the same draw as the data or the error arrives; a failed read MUST show the error and Try again, never the loader.
- **FR-2508**: A wait shorter than a short fixed moment MUST NOT show the loader at all.
- **FR-2509**: A redraw of the state while the loader shows MUST NOT restart the animation.
- **FR-2510**: Waits inside buttons, dialogs, rows and lists that already have content MUST keep the small spinner and their own progress display; this feature MUST NOT change them.
- **FR-2511**: The loader MUST adapt to a narrow pane (the logo scales, the caption wraps, no horizontal scroll) and MUST use no emoji.
- **FR-2512**: The tool's Features list and screenshots in the README MUST mention the animated wait once released, and the constitution rule T8 MUST be amended to say that a wait of the whole pane uses the logo loader.

- **FR-2513**: While the tool is reading, the area tabs (Solutions, Connections) are disabled by the global rule and MUST look and say so (dimmed, progress cursor, a title that says the tool is still reading); a control that ignores a click MUST NOT look clickable. Found by the author on 2026-11-13: clicking Connections during the list's refresh did nothing and nothing showed why.

- **FR-2514**: Inside a solution (its flows and references, before any write path starts) the two area tabs MUST be offered above the solution, so the Connections area is one click away and the Solutions tab returns to the same solution; during a write path (choose, preview, apply, result) they MUST NOT be offered, so a write is never left by a tab. Found by the author on 2026-11-13: from inside a solution the only way to reach Connections was to go back to the list first.

### Key Entities

- **Loader**: the large animated logo with its caption; shown for one wait of the whole pane, with the text of what is being read and an optional count.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In every whole-pane wait listed in FR-2501 the person sees the moving logo and a caption within a fraction of a second after the wait passes the short moment, and never a blank page.
- **SC-002**: The logo is readable and moving in both themes, and under reduced motion it is still moving, at a visibly slower pace.
- **SC-003**: A screen reader announces the wait once with the caption, and the drawing adds nothing to what it reads.
- **SC-004**: With an instant read no loader is drawn; with a failed read the loader is gone and the error is shown; with a long read the loader is gone the moment the content is drawn.
- **SC-005**: No wait inside a button, dialog or list changes its look.
- **SC-006**: Opening a solution of the author's test environment, the author confirms by eye that the first seconds look finished and alive (hand test, quickstart).

## Assumptions

- The "short moment" before the loader appears is a fraction of a second (about 200 ms); the exact value is a plan decision and is kept in one named place.
- The loader is a new element of the shared kit's grammar (spinner family); it is first built here and proposed to the template afterwards (root PENDING), since the root rules say kit changes go through the template.
- The marketplace icon (`logo.svg`) stays as it is; the loader reuses the same drawing as an inline graphic so it can take the theme colours.
- No new network request, no dependency and no setting is added.
