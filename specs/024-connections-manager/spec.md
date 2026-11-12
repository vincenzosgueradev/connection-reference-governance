# Feature Specification: Connections manager (environment level)

**Feature Branch**: `024-connections-manager`

**Created**: 2026-11-11

**Status**: Draft

**Part of**: [Product overview](../000-connection-reference-governance/spec.md)

**Input**: The author, after the live tests of 2026-11-11: connection references live in a solution, but the connections behind them live in the environment and can only be deleted one at a time in the Maker portal. A manager of the connections of the environment (the ones the signed-in user can see) is wanted: a rich list, the dependencies of each connection, and the deletion of many connections at once when none depends on them. "Use the official APIs, find them all."

## Why

The tool governs connection references inside one solution. A reference, however, only points at a connection; the connection itself is an environment resource that nobody governs: connections pile up (test ones, broken ones after a password change, ones left by people who moved on), the portal shows them one by one, and its own delete dialog is the only place that says which apps and flows still need a connection. A maker cannot see at a glance which connections are broken, which nothing seems to use, or delete a dozen of them safely.

This feature adds a second area to the tool: **Connections**, outside the open solution. It is read only first: the list, the dependencies and the choice of what looks unused all work without a single write. The deletion is built, previewed and tested, but ships behind a switch that stays off until a live test proves the route (see Open points).

## Research (Microsoft Learn, 2026-11-11)

- **List connections**: Power Platform API, Connectivity, `GET connectivity/environments/{environmentId}/connections?api-version=2024-10-01`. The only operation of the Connections group. Already used by the tool (feature 021) and proved live.
- **Apps that use a connection**: Power Platform API, Power Apps, `GET powerapps/environments/{environmentId}/apps?api-version=2024-10-01` ("Get AdminApps"). Each app carries `properties.connectionReferences[]`, each with `sharedConnectionId`, `dependencies` and `dependents`. Paged with `$top` and `$skiptoken` (`nextLink`).
- **Flows and agents**: Dataverse, as in features 022 and 023: `connectionreferences.connectionid`, the connection references inside the `clientdata` of flows, `bot.providerconnectionreferenceid`, and `botcomponent_connectionreference`.
- **Deleting a connection**: the official operation is Remove Connection as Admin (`Remove-AdminConnection`, Power Apps for Admins; PowerShell `Remove-AdminPowerAppConnection`: "permanently deletes the connection"). The Power Platform API reference lists no delete for connections. A DSR-compliance delete exists in another namespace, for another purpose; it is not used here.
- **Inventory API** (`resourcequery`): tells which **connectors** a resource uses, not which **connection**. It does not answer "what uses this connection" and is not used.
- **The portal** (seen by the author): the connection page lists "Apps using this connection" and "Flows using this connection", and its delete dialog lists them again ("you'll need a new connection to use them again").

## Open points (not guesses: each has a default and a live check)

- **OP-1, the deletion route.** The toolbox exposes the categories of `api.powerplatform.com`. Whether the delete route of the Power Apps administration API can be reached through it is unknown. Default: the deletion ships behind a switch that is OFF; while it is off, each connection offers **Copy portal address**. A live test on a test connection decides (quickstart 45).
- **OP-2, flows outside a solution.** Dataverse stores cloud flows in `workflows`; a flow outside any solution is believed to keep the connection name inside its `clientdata` instead of a connection reference. Default: read it when present, and say in the coverage note which flows could not be read. A live check confirms it (quickstart 45).
- **OP-3, what the list shows.** The list of connections of an environment may show only the connections the signed-in user can see. Default: the view says "the connections you can see"; it never claims to be the whole tenant.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See every connection you can see in the environment (P1)

A new entry **Connections** sits beside the solutions list on the home screen. It opens a rich list of every connection of the connected environment that the signed-in user can see (the view says so next to the total, OP-3): the connector (icon and name), the display name, the status as a coloured chip (Connected, Needs reconnect, Error), when it was created and last modified, who created it, and its id. Above the list a strip of figures: total, broken, with no dependency found, in use. A search box, filters (All, Broken, No dependency found, In use, and by connector) and sorting (name, connector, status, last modified).

**Why this priority**: it is the base of everything else, and it is already worth having: the portal has no overview that answers "which of my connections are broken".

**Independent Test**: open Connections in an environment with a mix of healthy and broken connections; the figures and the list match the Maker portal's list.

**Acceptance Scenarios**:

1. **Given** an environment with connections, **When** Connections opens, **Then** the list is read anew, a wait with a spinner shows how many were read so far, and the figures appear when it ends.
2. **Given** the list, **When** the Broken filter is chosen, **Then** only connections whose status is not Connected are listed and the filter shows its count.
3. **Given** the list is open, **When** Refresh is pressed, **Then** the list is read again and the scroll position and the filter are kept.
4. **Given** the connections cannot be read (no access, environment id unknown), **When** Connections opens, **Then** the view says why and offers to try again; nothing else is offered.

---

### User Story 2 - See what depends on a connection (P1)

Opening a row (chevron, row, or the dependencies figure) reads, at once and by itself, what depends on that connection and shows it grouped as **Apps**, **Flows**, **Connection references** and **Agents**, each item with its name, state, owner and where it lives (the solutions that hold it). A connection that nothing was found for says **No dependency found**, never "unused", and under it a coverage note says what was and was not looked at: which sources answered, and that components the signed-in user cannot read may use it.

**Why this priority**: it is the reason the manager exists; without it, deleting a connection is a guess.

**Independent Test**: open a connection that a known flow, a known reference and a known app use; all three appear; open one nothing uses; it says No dependency found with its coverage note.

**Acceptance Scenarios**:

1. **Given** a connection held by a connection reference that two flows use, **When** its row opens, **Then** the reference and the two flows are listed, in their groups.
2. **Given** one source fails (the apps list is refused), **When** the row opens, **Then** the other sources are shown and the failed one is named in a note with a retry; the connection is never shown as free on the strength of a failed source.
3. **Given** a row was already read, **When** it is closed and opened again, **Then** nothing is read again; Check again re-reads.
4. **Given** the list was refreshed, **When** a row opens, **Then** its dependencies are read anew (an old answer is dropped).

---

### User Story 3 - Find the connections nothing uses (P1)

A button **Check all** reads the dependencies of every connection, four at a time, with a progress bar and a count (read of total), and can be cancelled. When it ends, each row says **In use (N)**, **No dependency found** or **Could not be checked**, the figures update, and **Select the ones with no dependency found** ticks them. Only connections whose dependencies were read, with all sources answering, and that found none, can be ticked.

**Why this priority**: the author asked for it: "the ones without dependencies must be deletable in multiple selection".

**Independent Test**: Check all in an environment with known used and unused connections; the figures and ticks match.

**Acceptance Scenarios**:

1. **Given** Check all is running, **When** it is cancelled, **Then** what was read is kept, the rest stays unchecked and nothing is ticked on its own.
2. **Given** a connection whose apps source failed, **When** Check all ends, **Then** it shows Could not be checked and cannot be ticked.
3. **Given** a broken connection with no dependency found, **When** Select the ones with no dependency found is used, **Then** it is ticked too (a broken connection nobody uses is the clearest candidate).

---

### User Story 4 - Delete many connections at once (P2)

With connections ticked, **Delete...** opens the same guided dialog as the deletion of references: a Preview listing each connection (name, connector, creator, "Exists" then "Deleted"), a strong warning (permanent; the references that still point at a deleted connection will show it as missing), **Save backup** (the records of the connections, which hold no secrets), a one-time code to type and an acknowledgement toggle; then Apply with a progress per row, and a Result that reads each row back (the list is read again and the connection must be gone). Each row is checked just before it is written: if something now depends on it, or it is already gone, it is skipped and says why.

**Why this priority**: the second half of the author's request, but it depends on an open point (OP-1), so it comes after the read-only stories and ships switched off.

**Independent Test**: with the switch on, in a test environment, delete two test connections; both disappear from the Maker portal and the Result says Deleted and read back; with the switch off, Delete is not offered and the reason is shown.

**Acceptance Scenarios**:

1. **Given** the switch is off, **When** a row is open, **Then** **Copy portal address** is offered and no Delete exists anywhere.
2. **Given** the switch is on and three connections are ticked, **When** Delete... is pressed, **Then** the Preview lists the three, the backup is offered, and Apply stays locked until the code is typed and the toggle is on.
3. **Given** a connection gained a dependency between the check and the Apply, **When** its row is written, **Then** it is skipped with the reason and the others go on.
4. **Given** the route is refused by the toolbox, **When** the first row is written, **Then** the run stops with the refusal named, nothing else is attempted, and the Result says so.

---

### User Story 5 - From a reference to its connection (P3)

In the Connection references table the connection chip opens the Connections view on that connection (its row open, dependencies read). In the details of a connection, every reference that holds it links back to the solution view when it is a member of the open solution.

**Why this priority**: it ties the two areas together; useful, not essential.

**Independent Test**: click a connection chip in the references table; Connections opens with that connection open.

**Acceptance Scenarios**:

1. **Given** a reference with a connection, **When** its chip is clicked, **Then** the Connections view opens on that connection.
2. **Given** a reference with no connection, **When** it is shown, **Then** its chip does nothing and says why.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-2401**: The connections of the connected environment are read from the Power Platform API (list connections), page by page until the end, and shown as the connections the signed-in user can see (OP-3). Reading them is read only, shows a visible wait with a count, and a failure is a value with its reason and a retry.
- **FR-2402**: Each connection shows its connector (icon and name, the custom connector's own name when it is one), display name, status, created and last modified time, creator, and id. The status comes from the connection's reported statuses: Connected when every status says so, Error when one reports an error, Needs reconnect when the service says the connection must be re-authenticated.
- **FR-2403**: The counts (total, broken, no dependency found, in use) are shown once, as the counts of the filters, with no separate header and no row of figures: the list gets the room (the author, 2026-11-11, after the first live look). The list has a search over name, connector, creator and id, filters (All, Broken, No dependency found, In use, by connector) and sorting; "no dependency found" and "in use" count only connections whose dependencies were read.
- **FR-2404**: The dependencies of one connection are read when its row opens, by itself and once, from: the connection references whose `connectionid` is that connection (any solution), the flows that use those references or hold the connection by name, the apps whose connection references name it, and the Copilot Studio agents that use those references. A source that cannot be read is named and never hides the others.
- **FR-2405**: Every dependent is named, typed and located: name, kind, state, owner and the solutions that hold it; a dependent that cannot be named is shown by its id and type, never dropped.
- **FR-2421**: Check selected (the author, 2026-11-12): while connections are ticked, the Check button reads Check selected (N) and reads again only the ticked ones (the rest is left as it was); the figure on the right then says Selected N and how many of them are checked, and goes back to Checked X of Y when nothing is ticked. Check all drives the same run view as a change: ring, the three phases, the counters and the connector being read, with its logo and name inside the same block.
- **FR-2422**: The deletion run is alive (the author, 2026-11-12: it was static): a ring with the percentage, the connection in hand and what is being done to it (check, find, delete, read back), time elapsed and an estimate of the time left, counters, every connection with its state, and a log with the time of each line. Nothing in it is a light-filled button; a dangerous button is dark with a red edge, everywhere.
- **FR-2423**: Confirmation in the portal (the author, 2026-11-12, after a flow outside any solution was found that the tool cannot see): the tool reads only Dataverse and the apps, so a flow that lives only in the flow service (no row in the workflow table) is invisible to it, and No dependency found cannot prove there is none. Before a deletion runs, each connection of the plan is confirmed one by one in the Maker portal (Flows using this connection, Apps using this connection), with a Copy portal address button for each; Delete unlocks only when every one is confirmed, besides the code and the acknowledgement. The state refuses Apply otherwise. A Select all button in that step (Clear all once all are ticked) confirms every connection of the list in one go, for a run of many connections (the author, 2026-11-12); it is the author's own act after looking, never done by the tool.
- **FR-2424**: The list holds only connections (the author, 2026-11-12): connections that belong to a flow (the Logic flows connector) are not listed, because they go with their flow and the environment refuses to delete them alone.
- **FR-2425**: Inventory (the author, 2026-11-12: the portal listed flows the tool did not, and asked for every call needed to cross the data): the tool asks the Power Platform inventory (Resource Query, read only) for the flows, apps and agents of the environment with the connectors each uses, and shows beside the verdict "In this environment N flows, M apps use the X connector". For the flows it names, it goes further: it reads each one's definition from Dataverse by the id the inventory gives (once per run, ten at a time) and tells them apart: one that names this connection, directly or through a reference that holds it, is a dependency (found through the inventory); one whose references all hold another connection does not use it; any other (no row in the workflow table, a reference with no connection, nothing to tell) is listed by name as not tied to a connection, the flows source then counts as not read, and a connection nothing else was found for is Could not be checked and cannot be selected until the author confirms it in the portal. When the inventory is refused nothing changes: the hint is absent, the verdict is the one of the other sources, and the log says so once.
- **FR-2426**: What the portal lists is not always what exists (the author, 2026-11-12, live: two flows listed by the portal under a connection were not in the environment at all, not even in the Default Solution). The portal's Flows using this connection comes from the flow service and can hold permissions of flows that were deleted or moved, so it is a comparison aid and not the truth. The tool reports what it can read in the environment, names the flows of the same connector that it read and found on another connection, and the acceptance rule is: the portal may list more than the tool only for flows that cannot be found in the environment; a flow that exists and uses the connection must always be in the tool's list.
- **FR-2427**: Connector filter with drawings (the author, 2026-11-12): next to every connector in the filter there is its drawing, the same professional SVG glyph tile that the rows show (original drawings of the shared kit, never third-party logos), its name and how many connections it has; the closed filter shows the drawing and the name of the chosen connector. A native select cannot hold a drawing, so the filter is a small listbox: it opens on click, closes on a click outside, on Escape and after a choice, and works with the keyboard (arrows, Enter, Escape).
- **FR-2428**: The filter bar is one row (the author, 2026-11-12: the menu was not engaging): the four filters each wear an SVG icon and a count in the colour of its meaning (red for Broken, green for No dependency found, blue for In use), the active filter is a filled pill, the search takes the room that is left, then the connector filter with its drawings and Refresh, all in a rounded bar. On a narrow window the row wraps instead of squeezing.
- **FR-2429**: The deletion dialog, Preview, is one calm layout (the author, 2026-11-12: colours out of tune, bad arrangement, hard to use): a summary of what happens and why it cannot be undone, the connections to delete as a compact list of one line each (drawing, name, connector, creator, short id), then Before you delete as three numbered steps that become a tick when done, each with its state on the right: 1 Save a backup, 2 Confirm each one in the Maker portal (n of N), 3 Paste the code. The acknowledgement sits in the footer beside Cancel and Delete. The dialog badge is a quiet tile with a coloured drawing, never a gradient, in every dialog. One surface, colour only where it means something (a red edge on the summary, green ticks). The list of the portal confirmation keeps its scroll on every tick.
- **FR-2430**: While a deletion runs the dialog cannot be closed (the author, 2026-11-12): no Cancel, no cross, and the state refuses a close whatever asks for it (Escape, a click outside); the cross and the buttons come back on the Result.
- **FR-2420**: The tool cannot see everything the portal's "Flows using this connection" shows: the portal reads the records of the flow service, which are not among the APIs the toolbox exposes. Seen live (2026-11-11): a connection with 8 flows in the portal had none that Dataverse tied to it. The Power Automate API (List Cloud Flows) was tried as a source and the toolbox is refused it (`ClientScopeAuthorizationFailed`, its application has no permission for it), so it is not used. So (a) nothing is claimed that the tool cannot see; (b) the coverage note says how much each source read ("11 apps, 57 connection references (0 hold it), flows, agents"), each problem is said once, and a permission refusal is said in words; (c) next to a verdict of No dependency found, in the text and not only in a tooltip, the detail says that the portal can list flows this tool cannot see and tells the user to check "Flows using this connection" there before deleting; (d) the Preview of a deletion says the same. A refusal of the cloud flows list is not scanned, never a silent "free".
- **FR-2406**: A connection with nothing found says **No dependency found**, never "unused" or "free"; the coverage note names the sources that answered, the ones that failed, and says that components the signed-in user cannot read may still use it. A connection is never offered for selection when any source failed. A source is `ok`, `failed` (it could not be read; this includes a flow whose definition could not be read) or `not scanned` (the environment refuses that search, OP-2). A connection counts as **No dependency found** only when no source failed and nothing was found; a `not scanned` source never blocks that verdict but is printed in the coverage note and repeated in the deletion Preview.
- **FR-2407**: **Check all** reads the dependencies of every connection, a few at a time, with progress (read of total, time left), cancellable; what was read is kept; a new refresh of the list drops the answers.
- **FR-2408**: **Select the ones with no dependency found** ticks exactly the connections whose dependencies were read with every source answering and found none; the user can tick or untick any eligible connection by hand; a connection with a dependency, with a failed source or unchecked can be neither ticked nor selected by the button.
- **FR-2409**: Deletion follows the plan/apply split of the deletion of references: the plan lists the connections (name, connector, creator, id, what will happen), the apply writes one row at a time, each row is checked just before (still exists, still no dependency found when the check is repeated) and read back after (the list is read again and the connection is gone); a row that cannot be written is reported and the run goes on, except when the route itself is refused.
- **FR-2410**: Before a deletion the dialog offers a backup file with the records of the connections (id, connector, display name, creator name, created time, status); no secret and no email is ever read into it or written; the user chooses where the file is saved. Apply is locked until a one-time code is typed and the acknowledgement toggle is on, as for the deletion of references (T2b).
- **FR-2411**: The deletion ships behind a switch that is OFF (OP-1). While it is off nothing in the tool can delete a connection, and each connection offers **Copy portal address**: the address of the connections page of the environment, built from the environment id (never from a stored URL), copied through the host (the toolbox cannot open an address outside the tool). Since the author's live look (2026-11-11) the address is that connection's own page in the form the portal uses, `.../connections/shared_<connector>/<name>/details`; the connections page of the environment is the fallback. The switch is a declared flag in the tool, turned on in code only after the live test passes; there is no user toggle for it.
- **FR-2412**: The area is read only except for the deletion: no connection is ever created, shared, re-authenticated, renamed or has its owner changed (out of scope, constitution).
- **FR-2413**: Entering Connections reads the list anew; Refresh reads it again; the scroll position, the filter, the search and the open rows are kept across a refresh and across a dependency read; a row removed from the list closes.
- **FR-2414**: Every wait is visible and honest (T8): a spinner and the real step, a progress bar for Check all and for the apply, a done state; while any action runs every button of the view is disabled by the one rule in one place, the control that works keeps its spinner.
- **FR-2415**: The view follows the shared kit: theme variables only, no emoji, the kit's icons, status as chips with an icon and a label (never colour alone), keyboard reachable, labels for assistive technology, reduced motion respected, and it stays usable down to a window 640 pixels wide, with no horizontal scroll of the page.
- **FR-2416**: The connection chip in the Connection references table opens the Connections view on that connection with its row open; a reference with no connection has no link.
- **FR-2419**: Layout (the author, 2026-11-11, after the first live look: "ugly and confusing"): the two areas are tabs, not a segmented control, so they never look like the filters; there is one toolbar row (filters with their counts, search, connector, refresh) and one row of actions (Check all, select, delete, how many were checked with an info mark that carries the sentence on what No dependency found means); a row is short (the name, then the connector and a short code of the id: the first eight hex digits of its unique part; nothing is truncated with an ellipsis, as the tool's standing rule says, and the whole id is in the tooltip and in the details; status, dependencies, modified); the dependencies of a row not yet read show a quiet word, not a chip; the sort is the header of the column; the list is the only region that scrolls and its header stays.
- **FR-2418**: When only connection references hold a connection (no flow, app or agent was found using them), the row says **Held by N reference(s)** instead of In use, with the reason as its title, and the detail says so. It is still a dependency: such a connection counts as In use, cannot be ticked and is blocked in a deletion, because the reference would be left without its connection. Added after the author's first live look (2026-11-11), when the portal showed no app and no flow for a connection that one reference held.
- **FR-2417**: Errors are values with a reason the user can read; nothing is ever swallowed; the log dock records each read and each write with the name of the connection.

### Key Entities

- **Connection**: an environment-level credential for one connector: id, connector, display name, status, created and modified time, creator.
- **Connection dependent**: something that needs a connection: an app, a flow, a connection reference or an agent, with its name, state, owner and the solutions that hold it.
- **Dependency report**: for one connection, the dependents found, which sources answered or failed, and the coverage note; dropped when the list is read again.
- **Connection deletion plan**: the ticked connections, the checks made, the backup offered, the code and acknowledgement, and for each row what happened.

## Edge Cases

- No connections: an empty state that says so and offers Refresh.
- Thousands of connections: the list pages while reading, shows the count so far, and the view stays usable once the first page is in; the list draws 100 rows at a time with **Show more**.
- A connection of a custom connector: shown with the custom connector's name.
- A connection shared with others: shown as such when the service says so; deleting it affects them, and the Preview says "shared" when known.
- A reference still holds the id of a connection that was deleted: it is a reference that needs attention in the solution view; this feature does not repair it.
- The apps list needs administrator rights: refused, the apps source is named as failed and no connection becomes selectable until it answers; the user can still read everything else.
- A connection deleted elsewhere between the list and the Apply: skipped with "already gone".
- A flow that cannot be read (privilege, damaged definition): counted in the coverage note and, since it might use any connection, it blocks selection like a failed source.
- The environment is managed or protected against deletion: the refusal of the service is shown as it is.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A maker can see every connection they can reach in the environment, with its status, in one screen and one step, and the figures match the Maker portal's list.
- **SC-002**: A maker finds every broken connection in two clicks (open Connections, choose Broken).
- **SC-003**: For any connection, what depends on it is shown within one click of opening it, with the sources named; a connection with a dependency is never shown as free.
- **SC-004**: A maker can identify all the connections with no dependency found in one operation (Check all) and see how many there are, without opening each one.
- **SC-005**: A maker deletes a dozen connections with no dependency found in one guided run instead of twelve separate portal visits, and the result says for each one whether it is really gone.
- **SC-006**: Nothing is written to the environment before a confirmation that names the connections; with the switch off nothing in the area can write at all.
- **SC-007**: Every wait longer than a second shows what is happening, with real progress for the long ones; no control seems dead.

## Assumptions

- The author's tool already has the connections list (feature 021), the dependency reading (feature 023), the guided deletion dialog (features 016, 019) and the plan/apply split; this feature reuses them and adds an environment-level area.
- The signed-in user can see the connections they own or share; broader visibility depends on their role (OP-3).
- The route for deleting a connection is not known to be reachable from the toolbox (OP-1); the area is useful read only.
- Out of scope: changing the owner of a connection, creating, sharing or re-authenticating connections, editing credentials, and repairing references that point at a deleted connection.
- Version target 0.2.0, after the release of 0.1.0. The constitution is amended (new scope: environment-level connections, new version) as part of this feature.
