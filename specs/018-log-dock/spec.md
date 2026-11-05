# Feature Specification: The log dock

**Feature Branch**: `018-log-dock`

**Created**: 2026-11-05

**Status**: Implemented

**Part of**: [Product overview](../000-connection-reference-governance/spec.md)

**Input**: Hand test: the log was two plain lines under the page. Make it a section always at the bottom of the window that can be opened and closed.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A log that is always there and never in the way (P1)

A bar at the bottom of the window, over every screen. Closed, it shows the number of entries, how many are warnings or errors ("n to check"), and the last message. Open, it shows the whole list, newest at the bottom, each entry with an icon for its level, the time and the text. The list follows the newest entry until you scroll up.

**Acceptance Scenarios**:

1. Given the tool starts, Then the dock is closed (or as the user left it: the choice is remembered in the browser when it can be).
2. Given a new entry, Then the count, the last message and an open list update at once.
3. Given Clear, Then the log is emptied; given Save, Then the entries are written as JSON to a file the user chooses; both are closed when the log is empty.
4. Given more than 500 entries, Then the oldest go first.
5. Given blocked browser storage, Then the dock still works.

## Requirements *(mandatory)*

- **FR-1801**: The dock MUST stay at the bottom of the window whatever the screen, and MUST NOT truncate messages.
- **FR-1802**: Nothing sensitive is logged (constitution T7); the log never leaves the device except through Save.

## Implementation map

- src/services/log.ts (entries, `subscribeLog`), src/views/logDock.ts, src/index.html, src/app.ts, src/styles.css

## Verification

- test/logdock.test.ts
