# Connection Reference Governance Constitution

**Inherits the root constitution** (`../../../../.specify/memory/constitution.md`, Principles I-X). Everything below
only adds to it. The `custom-*` skills come from the root template and are not edited in this tool.

## Purpose

Makers and ALM owners need to know which connection reference every flow of a solution really uses, and to fix the
ones left on a default or owned by the wrong person, without opening flows one by one. This tool lists the flows of an
unmanaged solution in the connected environment, shows the connection references each flow uses and who owns the
connection behind each one, flags the ones that need attention, and re-points them in bulk after a preview.

## Tool-specific rules

### T1. Scope: read, then change only what the user confirmed
- Works on the connected environment only, through the Dataverse Web API (`dataverseAPI`). It never calls
  `api.flow.microsoft.com` (unsupported from PPTB).
- Works on **unmanaged** solutions only. Managed solutions are not offered: the home screen shows a disabled Managed
  tab with their count and says why, and they cannot be opened. The planners still refuse managed rows, as a second guard.
- Desktop flows are out of scope and are not listed.
- It changes existing connection references and the flows that point at them. Since 1.4.0 it can also take flows and
  connection references out of the open solution, and delete them (T2b). It does not create or export anything.

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
- A write runs as Choose, Review, Preview, Apply, Result (features 006 to 008). Review shows the plan in words and
  figures; Preview shows the exact content as a line diff (what is stored and what will be stored); Apply shows a
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
  source, and covered by a test. Until then the tool resolves membership without relying on a hard-coded code.
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
  Dataverse environment.

### T8. UI
- The main view is the flow list of the selected solution with one row per flow and its references; a second view groups
  by reference. Both re-read on entry (Principle VII).
- A selection of rows feeds the bulk plan. The count of selected rows and of affected flows is always visible before
  the user can open the preview.
- Long operations show progress and can be left running; a result list stays available until dismissed.

### T9. Tests specific to this tool
- The `clientdata` rewrite has a round-trip oracle: after the change, parsing the new JSON gives the old JSON with
  exactly one reference name replaced, for every fixture shape (one connector, several connectors, nested scopes,
  a flow with no references).
- Negative tests: different connector, missing target, managed solution, flow turned on, empty solution, Dataverse
  error on one row of many.
- Mutation testing covers the planner, the `clientdata` rewriter and apply: `npm run test:mutation` (`scripts/mutation-check.mjs`).

### T10. Credits
The idea of listing flows with their connection references and changing them in bulk exists in an XRMToolBox plugin
by MatthewTDunn (MIT licence). This tool is a separate implementation for Power Platform ToolBox. The README keeps a
Credits section naming that plugin and its licence, as long as any behaviour is mirrored from it.

**Version**: 1.4.0 | **Ratified**: 2026-11-04 | **Last Amended**: 2026-11-05
