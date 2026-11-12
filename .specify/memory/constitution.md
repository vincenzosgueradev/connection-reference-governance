# Connection Reference Governance Constitution

**Inherits the root constitution** (`../../../../.specify/memory/constitution.md`, Principles I-X). Everything below
only adds to it. The `custom-*` skills come from the root template and are not edited in this tool.

## Purpose

Makers and ALM owners need to know which connection reference every flow of a solution really uses, and to fix the
ones left on a default or owned by the wrong person, without opening flows one by one. This tool lists the flows of an
unmanaged solution in the connected environment, shows the connection references each flow uses and who owns the
connection behind each one, flags the ones that need attention, and re-points them in bulk after a preview. Since 1.9.0
a second area, **Connections**, outside any solution, lists the connections of the environment that the signed-in user
can see, shows what depends on each, and finds the ones nothing was found for (T11).

## Tool-specific rules

### T1. Scope: read, then change only what the user confirmed
- Works on the connected environment only, through the Dataverse Web API (`dataverseAPI`). It never calls
  `api.flow.microsoft.com` (unsupported from PPTB). Since 1.6.0 it also reads, read only, the connections of the
  same environment through `powerplatformAPI.Connectivity` (List connections, Microsoft Learn), only to check that a
  connection exists before a reference is created (T2c); the tool works without it. Since 1.9.0 the same list and the
  list of apps (`powerplatformAPI.PowerApps`) are also read, read only, by the Connections area (T11). The inventory (`powerplatformAPI.ResourceQuery`, one read only query sent with POST) is read
  too, only as a hint of how many flows, apps and agents use a connector; it never decides anything and the tool works without it.
- Works on **unmanaged** solutions only. Managed solutions are not offered: the home screen shows a disabled Managed
  tab with their count and says why, and they cannot be opened. The planners still refuse managed rows, as a second guard.
- Desktop flows are out of scope and are not listed.
- It changes existing connection references and the flows that point at them. Since 1.4.0 it can also take flows and
  connection references out of the open solution, and delete them (T2b). Since 1.5.0 it can also create one connection
  reference of a connector already in use, in the open solution (T2c). It does not export anything.

### T2. Distinct bulk operations, never mixed
1. **Change the connection of a reference**: update `connectionid` on a `connectionreference` row. Every flow using that
   reference follows.
2. **Re-point a flow to another reference**: rewrite the connection reference name inside the flow's `clientdata`.
Each is its own plan/apply flow with its own preview. A single confirmation never covers both.

### T2b. Taking away: remove from the solution and delete (added 1.4.0, feature 016)
- **Remove from this solution** deletes the `solutioncomponent` membership (Web API action `RemoveSolutionComponent`,
  verified on Microsoft Learn); the row stays in the environment. The `ComponentType` sent is the one stored on the
  member's own `solutioncomponent` row, never a hard-coded code; a member whose type was not read is blocked.
- **Delete** removes the row from the environment and so from every solution. It is never undone, so it has its own
  dialog (danger tone), its own acknowledgement text, and a backup that holds the flow definition or the reference record.
- A reference used by a flow that is not part of the same selection is blocked for both: re-point those flows first.
- A flow that is on is turned off first and then deleted (second acknowledgement, never turned on again); a suspended
  flow is blocked. Managed solutions and managed rows are blocked, as everywhere.
- A row counts as done only when the environment shows it: the membership is gone, or the row no longer exists.
- Call shape (Microsoft Learn, 2026-11-05): `SolutionComponent` (a `solutioncomponent` carrying the **object** id, as the
  SDK sample sets `ComponentId`), `ComponentType`, `SolutionUniqueName`. A test fixes the request. The Learn pages
  disagree on which id, so the live check in the quickstart stays; a wrong shape is refused per row and the read-back
  never shows it as done.

### T2c. Creating a connection reference (added 1.5.0, feature 021)
- Only from the re-point dialog, in the category being edited: the connector is the category's and cannot be edited.
  Only in an unmanaged solution. One row per confirmation; no flow and no other reference is changed by it.
- It follows T3 in a smaller form: the pure `newReferenceRecord` is the plan, the form's Review step is the preview
  (exact record, solution, environment), and the Create button is the confirmation. Nothing is written before it.
- The row is created with no custom request header and added to the solution by the `AddSolutionComponent` action.
  The name is checked against the environment just before; after the write the row and its membership are read back.
  When the row exists but the rest fails it is deleted again, and the message says what happened to it.
- The connection is optional. A connection is accepted only when it is found among the connections that the Power
  Platform API lists for the environment (Learn: Connectivity, List connections, 2024-10-01), for this connector, both
  when the form is reviewed and again just before the write; a pasted name is looked up there, never trusted. When the
  list cannot be read nothing can be verified, so only "no connection" is possible. Only documented fields are read
  (`name`, `id`, `properties.displayName`, `properties.createdTime`). Each connection shows, in "Used by", the owner and
  the email of the **reference rows** that hold it (from `systemuser`), labelled as such, never as the account of the
  connection. Emails are shown on screen only (T7).
- Names follow Learn ("Connection reference naming"): the logical name is unique in the environment (checked here, any
  solution, any case); the display name should be unique and is only warned about. Suggestions offer the Maker style
  (connector, solution, random suffix), a readable one, and one by account; each is free in the environment.

### T2d. Clean up (added 1.7.0, feature 022)
- **Unused** is a member reference of the open unmanaged solution that no flow of that solution uses (flows whose
  definition could not be read are reported). It may be used by what the solution does not show (other solutions,
  agents): **Check dependencies** reads the whole environment (T2e) and shows which unused references nothing depends on
  anywhere; Remove keeps the row, Delete asks the environment for dependencies (T2b).
- **Duplicates** are member references with the same connector, the same custom connector and the same non-empty
  connection id. Names are never compared. One of them is the keeper (most used, then by name, changeable).
- Cleaning up is a view over the existing operations, never a new write: Remove and Delete go through T2b, a merge goes
  through the re-point (T2.2). A merge is **two operations with two confirmations** (re-point the flows to the keeper,
  then take the now unused duplicates away): a single confirmation never covers both (T2). One group is merged at a time
  because a re-point holds one group per connector.
- The confirmations of Remove and Delete open **over** the clean up dialog, which stays behind them; cancelling returns to
  it as it was, and after the Result it opens again, read anew. A merge is the exception: it leaves the dialog to run the
  re-point and offers the second step in the Result.
- A reference that a flow which stays still uses is never offered for removal; the list is drawn from the solution as last
  read, and choices that no longer hold are dropped when it is read again.

### T2e. Dependencies are seen in the whole environment (added 1.8.0, feature 023)
- "Used by" is never only the open solution. The dependencies of a reference are read from Dataverse dependency tracking
  (`RetrieveDependentComponents`: everything that uses it; `RetrieveDependenciesForDelete`: what blocks its deletion), the
  source of Show dependencies in the maker portal, in every solution of the environment. Read only, a GET, no header.
- Each dependent is named, typed and located (state, managed, owner, the solutions that hold it); one that is not a member
  of the open solution is marked "Outside this solution". The names of the component types are read from
  `solutioncomponentdefinitions`, never guessed (T5); agents are added from their documented relationships to the
  reference. A source that cannot be read is named in a note and never hides the others.
- It is an explicit action with a visible wait (T8), a few references at a time, and its result is dropped when the
  solution is read again (Principle VII). It informs; it never decides: Remove, Delete and merge keep their own rules
  (T2b, T2d). The report says that it comes from dependency tracking and so cannot see what is not tracked.

### T11. Connections of the environment (added 1.9.0, feature 024)
- An area of the tool outside the open solution. It lists the connections of the connected environment that the signed-in
  user can see (never "all of the tenant"), read page by page from the Power Platform API (Connectivity, List
  connections). The fields beyond `name`, `id`, `properties.displayName` and `properties.createdTime` (statuses, creator,
  modified time, connector id) are read defensively: an absent field means unknown, never a guess, and a test pins the
  words after the live check (T5, T2c).
- What depends on a connection is read from official sources only: apps (Power Platform API, Power Apps, Get AdminApps,
  `connectionReferences[].sharedConnectionId`), connection references, flows and agents (Dataverse, as T2e), flows
  that hold the connection by name (when the environment accepts the search). The tool cannot read the records of the
  flow service that the Maker portal shows as "Flows using this connection": seen on 2026-11-11, the portal listed 8
  flows that no connection reference in Dataverse tied to the connection, and the Power Automate API (List Cloud Flows)
  is refused to the toolbox (`ClientScopeAuthorizationFailed`: its application has no permission for it), so it is not
  used. The text next to the verdict, the coverage note and the Preview of a deletion say so. A source is `ok`, `failed` or `not
  scanned`. A connection is shown as **No dependency found** only when no source failed and nothing was found; the word
  "unused" is never used for it, and a coverage note says what was and was not looked at (components the signed-in user
  cannot read may still use it). A failed source, or a flow whose definition cannot be read, blocks selection.
- Reading is read only, on request or when a row opens, with a visible wait (T8). Check all reads four connections at a
  time, can be cancelled, and keeps what was read.
- **Deleting a connection** follows T3 and T4b (plan, preview, confirmation with a one-time code and an acknowledgement,
  backup, each row checked just before and read back after) but is behind the declared flag `connectionDelete` in
  `src/features.ts`, which ships **off**. The official operation (Remove Connection as Admin) is not in the Power
  Platform API that the toolbox exposes; the flag may be turned on only after a live test on a test connection is
  recorded in `specs/024-connections-manager/research.md` ("Live check passed: <date>"), and a test fails if it is on
  without that record. While it is off nothing in the area can write, and each connection offers **Copy portal address**.
- The backup the user chooses to save holds, per connection, the name, connector, display name, creator name, created
  time and status. It never holds an email or any secret.
- Out of scope, always: changing the owner of a connection, creating, sharing or re-authenticating connections, editing
  credentials, and repairing references that point at a deleted connection.

### T3. Plan, preview, confirm, apply (Principle V)
- Every write is first built as a plan (pure, testable): which rows, which field, old value, new value.
- The preview lists every row that will change and the number of flows affected. Nothing is written before the user
  confirms that preview.
- The apply step reports per-row success or failure and never stops silently at the first error. A failed row is
  shown with the Dataverse message, the others are still reported.
- Undo is not promised for writes to Dataverse. The preview states the old value so the user can reverse by hand.

### T4. Editing `clientdata` is the riskiest write
- `clientdata` is rewritten only by changing the connection reference name under
  `properties.connectionReferences`; the rest of the JSON is kept byte-for-byte in meaning (parse, change one key,
  serialise). The definition (`actions`, `inputs.host.connectionName`) is never reformatted or reordered.
- Before writing, the plan checks that the target reference exists in the same solution and has the same connector as
  the one it replaces. A different connector is a hard stop, not a warning.
- Whether an **active** flow accepts a `clientdata` update is not yet verified. Until it is, the tool does not write
  `clientdata` of a flow that is turned on: it tells the user to turn the flow off first. Remove this rule only
  after the behaviour is tested in a real environment and recorded in this file with the date.

### T4b. Write safety (added 1.1.0)
- Every row is read again just before it is written and must still hold the value the preview showed; otherwise it is
  skipped and reported.
- Every row is read back after the write; a value that cannot be confirmed is reported as failed.
- The `clientdata` edit is made in place on the text and checked against the same change on the parsed document before
  it can be offered for writing. A definition the tool cannot edit this way is refused, never guessed.
- A backup of the old values can be saved from the preview.
- Fields that Microsoft does not document are not written into a definition. A rewrite beyond the reference name needs
  a recorded hand test first.
- Flows are read with `category = 5` and `type = 1` (definition rows only).

### T4c. The guided path of a write (added 1.3.0)
- A write runs as Choose, Preview, Apply, Result (features 006 to 008; the separate Review step was dropped by feature
  015, its figures live in the studio and the Preview). Preview shows the exact content as a line diff or a table (what is
  stored and what will be stored, feature 017); Apply shows a
  timeline with the elapsed time and the rows as they finish; Result states what happened and offers a report.
- Apply is reached only through the confirmation (feature 005) with the acknowledgement ticked, by one store action
  that the reducer refuses in any other state. During Apply nothing can be left; after it the only way out is the
  Result and the way back to the solution.
- The "after" side of every diff is the payload that will be written; a test rebuilds it from the diff.

### T5. Verified metadata only (Principle V)
- A flow is a `workflow` row with `category = 5` (modern flow). Connection references are `connectionreference` rows
  (`connectionreferencelogicalname`, `connectionreferencedisplayname`, `connectorid`, `connectionid`, `ownerid`,
  `statecode`, `ismanaged`). `solutionid` on `connectionreference` is read-only.
- A solution's members are read from `solutioncomponent`. The `componenttype` value of a connection reference is
  **not guessed**: it is taken from the live environment or the Microsoft documentation, recorded here with its
  source, and covered by a test. Sources, in order (feature 021, test/newReference.service.test.ts): the type stored
  on the members of the solution; the type stored for any reference of the environment; `solutioncomponentdefinitions`
  (`primaryentityname eq 'connectionreference'`). When none answers, a reference is not created. Until then the tool resolves membership without relying on a hard-coded code.
- A query that returns no rows without an error is treated as a wrong filter and investigated, not as "nothing found".

### T6. What "needs attention" means
A flow or reference is flagged only for conditions the tool can prove from data it read:
- the reference has no `connectionid` (never set after import);
- the connection behind it is owned by a user other than the expected one (the expected owner is chosen by the user,
  never assumed);
- the connection behind it is not in a connected state;
- a flow declares a reference that does not exist in the environment.
Every flag states the data it is based on. No flag is a guess.

### T7. Data and privacy
- No tenant data (names, ids, flow definitions, connection ids) in code, tests, fixtures, logs, README or screenshots.
  Fixtures are synthetic.
- The tool stores nothing outside the PPTB session and sends nothing to any service other than the connected
  Dataverse environment and, read only and through PPTB, the Power Platform API of that environment (the list of
  connections, T1; since 1.9.0 also the list of apps, T11). Names, ids and emails read are shown on screen only: never
  logged, saved or sent anywhere, with one exception: the backup file that the user chooses to save before a deletion
  (T2b, T11), which holds the records listed there and never an email.

### T8. UI
- The main view is the flow list of the selected solution with one row per flow and its references; a second view groups
  by reference. Both re-read on entry (Principle VII).
- A selection of rows feeds the bulk plan. The count of selected rows and of affected flows is always visible before
  the user can open the preview.
- Long operations show progress and can be left running; a result list stays available until dismissed.
- While an action runs, every button is disabled (added 1.8.1, the author's global rule). One function decides "an action
  is running" (`state/running.ts`) and one place applies it (`views/main.ts`, after each draw): a view never disables its
  buttons for this by itself. The control that started the work keeps its normal look and shows its progress (a spinner,
  `aria-busy`), so it reads as working and not as unavailable. Redraws must not move the focus to the top of a dialog or
  the scroll of a list (the focus is given only when a dialog opens, and without scrolling).
- Every wait is visible and honest (added 1.6.1): a control that starts work shows a spinner and says what is happening,
  never only a dimmed label; an operation with steps shows the steps with their real state (pending, active, done), driven
  by what the code reached and not by a timer; the end is shown (a done state) before the view moves on; with reduced
  motion the movement is static or slow.

### T9. Tests specific to this tool
- The `clientdata` rewrite has a round-trip oracle: after the change, parsing the new JSON gives the old JSON with
  exactly one reference name replaced, for every fixture shape (one connector, several connectors, nested scopes,
  a flow with no references).
- Negative tests: different connector, missing target, managed solution, flow turned on, empty solution, Dataverse
  error on one row of many.
- Mutation testing covers the planner, the `clientdata` rewriter and apply: `npm run test:mutation` (`scripts/mutation-check.mjs`).

### T10. Credits
Nothing in this repository names another tool, plugin, company or person as inspiration, comparison or credit: not in the
README, the specs, the research notes, the tests or the commit messages. A Credits section exists only when code, text
or images are actually copied and a licence asks for it, and then only with the owner's written consent to be named.
This tool copies nothing, so its README has no Credits section.

**Version**: 1.9.0 | **Ratified**: 2026-11-04 | **Last Amended**: 2026-11-11
