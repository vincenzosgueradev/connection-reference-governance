# Feature Specification: New connection reference from the re-point dialog

**Feature Branch**: `021-new-reference`

**Created**: 2026-11-07

**Status**: Implemented

**Part of**: [Product overview](../000-connection-reference-governance/spec.md)

**Input**: Idea from the author: while choosing the reference to use instead (re-point), be able to create a new connection reference inside the solution, as the Maker portal does, but with the connector fixed to the category being edited (in the Microsoft Dataverse category the new reference is a Microsoft Dataverse one). Make it complete: validated, previewed, confirmed, verified, with no way to make a reference of the wrong connector.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create a reference of this category and use it at once (P1)

In a category of the re-point dialog the user presses "New reference". The right pane shows a form: the connector (fixed, shown as a tile, not editable), display name, name (the publisher prefix is fixed in front, the rest is suggested from the display name), description and connection. "Review" shows exactly what will be written; "Create in <solution>" writes it. The new reference appears in the list, is selected as the reference to use instead, and the choice made so far (references to replace) is kept.

**Acceptance**:
1. The connector cannot be changed: the form has no connector control, and the written row always carries the connector of the category.
2. The form is available only in an unmanaged solution (the studio is not offered otherwise).
3. After creating, the reference is a member of the solution, read back with the connector, name and connection that were asked.

### User Story 2 - Mistakes are stopped before anything is written (P1)

A missing display name, a name that is not valid, a name that already exists in the environment (any solution, any case), a connection id with odd characters, or a publisher prefix that cannot be found: each is shown under its field and "Review" stays disabled. A display name used by another reference of the same connector in the solution is a warning, not a block.

### User Story 3 - The connection is required and chosen from facts (P2)

The connection is required (changed after a live test, 2026-11-11: the Maker portal does not save a reference without one, and re-pointing flows onto a reference with no connection fails with Dataverse error 0x80060467). It is one of: a connection listed for the connector (a card), a connection already used by a reference of this connector (named by the references that use it), or a pasted connection name. The tool does not list the user's connections: no verified source exists (see research of feature 000).

### User Story 4 - A failure never leaves a half-made reference (P1)

If the row is created but cannot be added to the solution (or the membership cannot be read back), the tool deletes the row it just created and says so; if even that fails the message names the row so it can be removed by hand. The dialog keeps what was typed.

### Edge cases

- The name exists in another solution or with other capitals: blocked. The name appears between the check and the write: the final check refuses, nothing is created.
- The publisher prefix cannot be read and the solution's references disagree: the form says so and Review stays locked.
- The component type cannot be read: nothing is created (never guessed).
- The solution is read again while the form is open: the form is kept; leaving the solution or the category closes it.
- Custom connector: the lookup is bound only when every reference of the connector in the environment shares one.
- The user closes the studio while writing: the close is ignored until the write ends (the form is saving).

## Success Criteria *(mandatory)*

- **SC-2101**: A reference of the wrong connector cannot be produced from the form (no control; the record is built from the category).
- **SC-2102**: Every failure after the row exists ends with no row left behind, or with the row named so it can be deleted by hand.
- **SC-2103**: No flow, and no reference other than the new one, is written by this feature.

## Requirements *(mandatory)*

- **FR-2101**: The connector of a new reference MUST be the connector of the category it was started from (same `connectorid`; the custom connector lookup too when every reference of that connector in the environment shares one).
- **FR-2102**: The write MUST be previewed (the exact record, solution and environment) and started by an explicit button; nothing is written when the form is opened, edited or reviewed (constitution T1, T3).
- **FR-2103**: The logical name is `<publisher prefix>_<name>`; the prefix is the one of the solution's publisher (read), or, when it cannot be read, the prefix shared by the solution's references; with none the form says so and blocks. The name part is letters, digits and underscores, starts with a letter, at most 50 characters. It MUST NOT equal (ignoring case) the logical name of any reference of the environment, and is checked again against the environment just before the write.
- **FR-2104**: The row is created with no custom request header (the tool never needs the consent PPTB asks for them) and then added to the solution with the `AddSolutionComponent` action; the component type is read (members of the solution, any reference of the environment, or `solutioncomponentdefinitions`), never guessed (constitution T5).
- **FR-2105**: After the write the row is read back (logical name, connector, connection) and its membership of the solution is read back; any difference is a failure. A failure after the row exists deletes it (compensation) and reports both facts.
- **FR-2106**: On success the snapshot gains the reference, the re-point group of the category gets it as target, and the figures stay right; the log dock records the creation.
- **FR-2107**: A connection id is accepted when it is letters, digits, `-`, `_`, `.` (at most 200). Empty is allowed with a warning.

## Implementation map

- src/model/newReference.ts (rules: suggested name, validation, record, connection choices), src/services/dataverse.ts (`createReference`, `loadPublisherPrefix` through the solutions query), src/host.ts (`create`, `addToSolution`), src/state/reducer.ts (`newReference`), src/controller.ts, src/views/newReference.ts, src/views/studio.ts.

## Verification

- test/newReference.model.test.ts, test/newReference.service.test.ts, test/newReference.view.test.ts, test/reducer.newref.test.ts; manual check in the quickstart (real environment: create a Dataverse reference in a test solution, see it in the Maker portal).

## Open points

- A live list of the user's connections (Power Apps API) is left out until a verified endpoint and permission are known; the tool already accepts a pasted connection name and offers the ones already in use. Tracked in PENDING.md.

## Amendment 2026-11-07 (hand look: the form in the narrow pane)

The form inside the right pane was cramped: fields cut on the right, a vertical scrollbar inside a small box. It is now a **side panel** that slides in from the right over the studio (as the Maker portal does), with a dimmed scrim behind it.

1. The panel has a fixed header (connector tile, title "New connection reference", the connector and the solution, a close button), a two-step indicator (Details, Review), a body that scrolls vertically only when it must and never horizontally, and a fixed footer with the buttons (Cancel and Review; Back and Create in <solution>).
2. It opens with a short slide-and-fade and closes with the reverse; a redraw caused by typing or a choice does not replay the motion. With "reduce motion" there is no movement.
3. The connection choices are compact cards; the review step shows the record as key-value lines and what will happen in three lines (the name is checked again, the row is created and added to the solution, it is read back).
4. Escape, the close button, Cancel and a click on the scrim close the panel (not the studio); none of them works while the row is being written. Focus moves to Display name when it opens.
5. The list of references on the right is untouched while the panel is open; Review changes stays closed.

FR-2108: The form MUST be a side panel, not content of the choosing pane; every FR above is unchanged.

## Amendment 2026-11-07 (hand look: header and connection facts)

1. **Header**: the title line stays; under it two rows, each with its own logo and a small caption: **Solution** (a yellow folder icon and the solution name) and **Connector** (the connector tile and the connector name). They are no longer one sentence.
2. **Connection choices**: each connection is a card with one fact per line, each with its icon: the connection id (in full), the owner, the owner's email, and how many references and flows use it. The icons are the kit's glyphs, not emoji (constitution T8 and the author's rule: no emoji in the UI).
3. **Used by**: each card has an expandable section ("Used by 2 references, 5 flows") that lists every reference of the environment that holds this connection (display name, logical name, owner) and, under each, the flows of this solution that use that reference. The open or closed state of each section is kept while the panel is open.
4. The owner and email are those of the **reference rows** that hold the connection (Dataverse `systemuser`: full name and `internalemailaddress`), because the tool has no verified source for the account behind a connection itself (feature 000 research; PENDING 18). The card says "Owner of the references" so it is not mistaken for the connection's account. Emails are shown on screen only: never logged, saved or sent (constitution T7).

FR-2109: A connection card MUST show the id, the owners, their emails and the usage, one per line with an icon, and MUST NOT present the reference owner as the connection's own account.
FR-2110: The "Used by" list MUST name every reference that holds the connection and, per reference, the flows of the open solution that use it.

## Amendment 2026-11-07 (hand test 2: a pasted connection must exist; suggestions)

Raised by the author: a pasted connection id that does not exist is a problem; the id must be checked, and only a found one lets the user go on. And: names and descriptions should be filled in a smart way.

### Research (Microsoft Learn, 2026-11-07)

- **Connections**: the Power Platform REST API has *Connectivity, Connections, List connections*: `GET https://api.powerplatform.com/connectivity/environments/{environmentId}/connections?api-version=2024-10-01`, answering `value[]` of connections (`id`, `name`, `properties.displayName`, `properties.createdTime`, ...). PPTB exposes it as `powerplatformAPI.Connectivity`. The environment id is `Detail.EnvironmentId` of `RetrieveCurrentOrganization`. The API needs the Power Platform API enabled on the PPTB connection; when it is not, the list cannot be read.
- **Naming**: *Connection reference naming* (Learn): the display name should be unique so references can be told apart; by default it includes the target connector, the solution name for context and a random suffix. The `connectionreference` table: `connectionreferencelogicalname` "unique name" (max 200), `connectionreferencedisplayname` (max 200), `description` (max 2000), `connectionid` (max 1000). Learn does not say that the display name is enforced to be unique; the tool checks the logical name itself (the whole environment, any solution, any case) and only warns about a repeated display name.

### Behaviour

1. **The connection must exist.** The panel reads the connections of the environment when it opens. The connection choices are those listed for this connector (one card each, with the references that use them). A pasted id has a **Check** button (also Enter) that reads the list again and looks the id up: found (the card is selected and "Found: <name>" is shown), not found, or of another connector. Only a found connection lets Review open (FR-2125: a connection is required). A whole resource id (`.../connections/<name>`) is accepted and reduced to the name; names are not case sensitive.
2. **When the connections cannot be read** (API not enabled, no permission, environment id unknown) nothing can be verified, so no connection can be verified and the reference cannot be created; the panel says why and offers Refresh.
3. **Checked again just before the write**: the list is read once more; a connection that has disappeared, or belongs to another connector, stops the write with nothing created.
4. **Suggestions** (top of Details): up to three ready-made sets of display name, name and description, each one free in the environment: *Maker style* (`Connector Solution-suffix`, `prefix_sharedconnector_suffix`, as the Maker portal names them), *Readable* (`Connector - Solution`), and, when a connection is chosen, *By account* (`Connector (account)`). One click fills the three fields; Auto-fill applies the first. After a suggestion the name stays when the display name is edited.
5. Limits are the Dataverse ones (display name 200, description 2000, connection 1000); our own cap of 50 for the part of the logical name after the prefix stays (conservative, the table allows 200).
6. The owner and the email are now shown only inside "Used by", for each reference (owner of the reference row), and no longer on the face of the card, which shows the connection's own name from the API.
7. The panel opens with one draw (already "reading the connections") and a redraw during the slide continues the motion instead of restarting or snapping it.

FR-2111: A connection MUST be found among the connections listed by the Power Platform API for this connector before Review opens, and again before the write.
FR-2112: When the list cannot be read, no connection can be chosen, so Review stays locked.

FR-2125: A connection is REQUIRED. The form is invalid without one (message "Choose a connection"), the panel offers no "No connection yet" choice, and the creation refuses an empty connection before writing anything.
FR-2113: Every suggestion MUST be free in the environment and MUST pass the form check.
SC-2104: No reference is created with a connection that does not exist.

## Amendment 2026-11-07 (bug: a new reference could not be removed or deleted until a refresh)

Found by hand: after creating a reference from the panel, going back and trying Remove or Delete on it was refused until the solution was refreshed. Cause: the reference joined the local snapshot without its `componenttype`, which Remove sends and Delete needs for its dependency check (constitution T2b, T5), so the planner blocked it ("component type could not be read"); a refresh read the type from the solution.

FR-2114: A reference created by the tool MUST be known to the snapshot with the component type it was added with, so that Remove and Delete treat it like any other member at once. The type is the one that was read to add it, never a guess; when none is given none is stored.

## Amendment 2026-11-07 (hand test 3: room, clicks, feedback)

Found by hand: the panel was narrow and the header took half of its height; a click on a connection card, on "Used by" or on a suggestion made the body jump back to the top (the redraw lost the scroll position, which the page keeps only for the lists it knows), so clicks felt broken; and a suggestion gave no sign that it had been applied.

1. **Wider panel** (up to 680px) and a **lower header**: the title, the two steps and the close button share one row; the solution and the connector sit side by side in one row (each with its logo, caption and name).
2. **The scroll stays**: a redraw of the panel (a click, typing, the list of connections arriving) keeps the scroll position of its body; moving between Details and Review opens the new step at the top.
3. **A suggestion shows that it was applied**: the card is marked "Applied" with a check, derived from the fields (so the mark disappears as soon as a field is edited), and the list of suggestions folds into one line ("Suggestion applied: Maker style", with Show and Hide) so the fields below get the room back. Auto-fill does the same. The suggestions can be opened again at any time.
4. Each suggestion card is shorter: the description is cut to one line.

FR-2115: A redraw of the panel MUST keep the scroll position of its body within the same step.
FR-2116: Applying a suggestion MUST be visibly acknowledged and MUST NOT hide the fields it filled.

## Amendment 2026-11-07 (hand test 4: the search button, and an explicit search)

Found by hand: (1) pressing the search icon threw the panel back to the top. The icon was disabled while the list was read, so it lost the focus; the next redraw found the focus outside the dialog and gave it to the first field (Display name), which sits at the top, and the browser scrolled there. (2) The result of a pasted id appeared by itself while typing; the author wants the search to run only on Enter or on the icon.

1. **Focus**: no button of the panel is disabled while the connections are being read (Check and Refresh stay, a second request while one is running is ignored); the first field takes the focus only when the panel opens, never on a later redraw; a redraw that refocuses an element does it without scrolling.
2. **An explicit search**: a connection can come from a card (listed, so already verified) or be typed. A typed id is looked up **only** when the user presses Enter in the field or the search icon; nothing is looked up, and no verdict is shown, while typing. Until it is searched the panel says "Press Enter or the search icon to check this connection" and Review stays closed. The result (found, not found, another connector, could not be read) is kept for that id and shown until the text changes. A found connection becomes the selected card.
3. Opening the panel still reads the list of connections once (the cards need it): that is not a search for the pasted id.

FR-2117: A pasted connection id MUST be looked up only on Enter or on the search icon, and MUST NOT be accepted before it has been found by that search (a card, being listed, needs none).
FR-2118: Pressing Check or Refresh MUST NOT move the scroll position nor the focus away from the control.

## Amendment 2026-11-07 (hand test 5: "Creating..." says nothing)

Found by hand: while the row is written the button only said "Creating..." and went dim; nothing showed that something was moving, and nothing showed how far it was. Best practice for a wait is a visible, honest signal: a busy control with a spinner, an indeterminate bar for the whole operation, and, when the operation has steps, the steps themselves with their real state.

1. **The three lines of "What happens" become a live timeline** while the row is written: each line is *pending* (muted), *active* (a spinner) or *done* (a green check), following the real steps of the service (the name and the connection are checked again; the row is created and added to the solution; the row and its place in the solution are read back). Nothing is simulated: a step becomes active when the service starts it.
2. **The Create button** shows a spinner next to "Creating..." and a thin **indeterminate bar** runs over the footer; both stop when the write ends. Back, the close button, the scrim and Escape stay refused while it runs.
3. **On success** the timeline shows all three lines done and the button says "Created" with a check for a moment (700 ms) before the panel closes and the new reference is selected, so the result is seen and not only inferred. On failure the lines go back to normal and the error is shown as before.
4. Screen readers: the timeline is a polite live region and the bar is a `progressbar` without a value; with reduced motion the bar and the spinner are static or slow.

FR-2119: While the write runs, each step of the timeline MUST show pending, active or done according to what the service really reached.
FR-2120: A wait MUST show a spinner or a bar, never only a changed label.

## Amendment 2026-11-07 (hand test 6: full width)

The fields of the panel stopped at 380px (the kit's cap on a text input) and cut their text while the panel had room. FR-2121: every field of the panel (display name, name, description, pasted connection id) takes the full width of the panel body.

## Amendment 2026-11-07 (Used by sees the whole environment)

The author: a connection must give all its dependencies, also outside the solution. In the expanded **Used by** of a connection card, each reference now has the dependencies block of feature 023 (Check dependencies: flows, agents, apps and other components of the whole environment, with their solutions, marked Outside this solution), and the connection has **Check every dependency of this connection**, which reads all of them and shows the total. The flows of the open solution listed until now stay.

FR-2122: The Used by of a connection MUST be able to show every dependent of the references that hold it, in any solution.

Note 2026-11-07: FR-2118 (Check and Refresh stay enabled while reading) is superseded by the global rule of constitution 1.8.1: every button is disabled while an action runs; the focus is protected by other means (see feature 022, amendment).
