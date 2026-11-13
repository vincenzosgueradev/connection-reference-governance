# Connection Reference Governance

See which connection references every flow in a solution uses, find references with no connection or flows pointing at a missing reference, and change or re-point them in bulk after a preview. Works on unmanaged solutions in the connected environment.

## Features

- One row per flow with its type (instant, automated or scheduled), state, connections at a glance and last modified date; open a row to see the trigger, actions, owner, dates, id and a table of its connections with reference, connector and connection in full (custom connectors are marked). It adapts to narrow panes.
- Opens on a home screen with the number of unmanaged solutions and of flows, and a sortable table of the solutions (flows, created, version, publisher) with search; choose one to see its flows with the connection references each flow uses.
- A second view groups by connection reference: connector, connection, reference owner and the flows that use it.
- Flags what the data proves: a reference with no connection set, and a flow that declares a reference that does not exist.
- Change the connection of selected references in bulk, with a preview that lists every row, the old value and the number of flows affected.
- Re-point selected flows to another reference of the same solution and connector, with the same preview and a per-row result.
- In the Re-point dialog: **New reference** creates a connection reference of the category's connector in the open solution: the connector is fixed, the name is checked against the environment, ready-made names and descriptions can be applied with one click (Maker style, readable, by account), the connection is optional and is accepted only when it is found among your connections (listed through the Power Platform API; paste an id and press Check), a Review step shows the exact record, and the row is read back after the write.
- **Dependencies in the whole environment**: open a reference (click its row) and press **Check dependencies** to see every component that depends on it, in any solution: flows, Copilot Studio agents, apps and other components, with their state, owner and the solutions that hold them, and what is **outside this solution** marked. The same is available for a connection in the new-reference panel (Used by) and in Clean up, where **Select the ones nobody uses** ticks only the unused references that nothing depends on anywhere. When Delete is blocked it names the components that block it. It reads from Dataverse dependency tracking, the source of Show dependencies in the maker portal; it reads and changes nothing, and a component whose dependency is not tracked is not listed.
- In the Connection references view: **Clean up...** finds the references no flow of the solution uses and the duplicates (several references of one connector that hold the same connection). Unused ones are ticked and removed or deleted through the usual dialogs. For duplicates you choose the reference to keep (the most used is suggested): the flows of the others are re-pointed to it after a preview, and then the duplicates, now unused, can be removed or deleted with their own preview and confirmation. Two operations, two confirmations: a merge is never confirmed in one go. Check dependencies there to see which unused references something outside the solution still uses.
- In the Connection references view: remove the selected references from the solution (they stay in the environment), or delete them from the environment, each with the same preview, confirmation and per-row result.
- **Connections** (a second area, beside the solutions, outside any solution): a rich list of the connections of the environment that you can see, with the connector, display name, status (Connected, Needs reconnect, Error), created and modified time, creator and id; counts (total, broken, no dependency found, in use) on the filters, search and sorting. Open a row and what depends on it is read by itself: apps, connection references, flows and Copilot Studio agents, with where they live. **Check all** reads every connection four at a time, with progress and a Cancel, and **Select the ones with no dependency found** ticks them. A connection nothing was found for says **No dependency found**, never "unused": the signed-in user cannot read everything, a note says how much each source read (and each problem once), and the tool says plainly that the Maker portal can list flows (from the flow service) that it cannot see, so check "Flows using this connection" there before deleting. The connection chip of a reference opens the connection there. **Delete** removes the selected connections: you first confirm each one in the Maker portal (the tool cannot see flows that live only in the flow service), then Preview, an optional backup with no email and no secret, a code to copy and an acknowledgement; each connection is checked again just before it is deleted and read back after. Connections that belong to a flow are not listed. **Copy portal address** takes you to the connection in the Maker portal.
- Every wait that fills the screen shows the tool's own logo, animated, with a caption of what is being read (and the count so far when there is one); it follows the light and dark themes, slows down with reduced motion and is announced to screen readers.
- A change runs as a guided path with a stepper and a breadcrumb: Choose, Preview (two tabs: the exact content as a line diff, split or unified, and a table of what each item is now and will be), Apply (a timeline with the time elapsed and the rows as they finish) and Result (a banner, figures, one line per row and a report you can save). You can go back until the write starts; after that the only way out is the Result.
- Before anything is written a confirmation dialog opens over the screen: the environment, the scope in four figures (rows to change, flows affected, flows turned on, rows not changed), one before-and-after line per row, the warnings, the offer to save a backup of the old values, and an acknowledgement you must tick before Apply is enabled. Cancel, Escape and the close button write nothing.
- When re-pointing, the new reference can only be another reference of the same connector in the solution, and is disabled until you choose which reference to replace.
- Each row is checked again just before it is written (skipped if someone changed it meanwhile) and read back afterwards.
- Flows that are turned on cannot be changed in Dataverse. With your permission (off by default, a block in the studio with a warning, the list of flows and a second acknowledgement) the tool turns them off for the change and on again afterwards, even when the write fails; a flow left off is named in the result and in the report.
- Managed solutions cannot be changed, so they are not offered: a disabled Managed tab shows how many there are.

## Screenshots

All screenshots are real, taken on a test environment with sample data.

### Find what each flow uses

![The unmanaged solutions of the environment with their flow counts, a search box and the managed ones set apart.](https://raw.githubusercontent.com/vincenzosgueradev/connection-reference-governance/main/docs/screenshots/13-solutions.png)

Start from the solution you care about; managed solutions are shown but never offered for change.

![The flows of a solution: type, state, the connections each one uses and when it was last modified.](https://raw.githubusercontent.com/vincenzosgueradev/connection-reference-governance/main/docs/screenshots/01-flows.png)

One row per flow tells you at a glance which connections it depends on.

![The details of a flow: trigger, number of actions, owner, dates and id.](https://raw.githubusercontent.com/vincenzosgueradev/connection-reference-governance/main/docs/screenshots/14-flow-details.png)

Open any flow to see what it is before you change it.

![The connection references of a solution, with connector, connection, owner and the flows that use each one.](https://raw.githubusercontent.com/vincenzosgueradev/connection-reference-governance/main/docs/screenshots/04-references.png)

Change, clean up, remove or delete references from one place; nothing is written until you confirm.

![Check dependencies on one reference: every flow, agent, app and other component that depends on it, in any solution, marked when it is outside the open solution.](https://raw.githubusercontent.com/vincenzosgueradev/connection-reference-governance/main/docs/screenshots/19-reference-dependencies.png)

See everything that depends on a reference before you touch it, wherever it lives.

![The tool's logo animated while a solution is being read: the dashed lines run to the right node, the nodes pulse, and a caption says what is being read.](https://raw.githubusercontent.com/vincenzosgueradev/connection-reference-governance/main/docs/screenshots/23-loader.png)

Every wait shows the tool is working and what it is reading, and follows the light and dark themes.

### Re-point flows to another reference

![The re-point studio, one step per connector, with the new reference chosen and the figures always visible.](https://raw.githubusercontent.com/vincenzosgueradev/connection-reference-governance/main/docs/screenshots/05-repoint-studio.png)

Move many flows at once, a connector at a time, and see how many flows are affected before you go on.

![The side panel that creates a connection reference of the right connector, with ready-made names and descriptions.](https://raw.githubusercontent.com/vincenzosgueradev/connection-reference-governance/main/docs/screenshots/06-new-reference.png)

Create the reference you need without leaving the screen; the name is checked against the environment.

![The exact change as a line diff, split or unified, with the changed words highlighted.](https://raw.githubusercontent.com/vincenzosgueradev/connection-reference-governance/main/docs/screenshots/07-preview-diff.png)

See precisely what will be stored in each flow before anything is written.

![The confirmation over the screen: the environment, the figures, what is written, the offer of a backup and an acknowledgement.](https://raw.githubusercontent.com/vincenzosgueradev/connection-reference-governance/main/docs/screenshots/08-repoint-confirm.png)

A change cannot start by accident; you can save the old values first.

![The run in progress: percentage, phases, counters and each flow as it finishes.](https://raw.githubusercontent.com/vincenzosgueradev/connection-reference-governance/main/docs/screenshots/09-apply-progress.png)

Every wait is visible and honest; each flow is written and read back.

![The result: figures, duration and one line per flow, with a report you can save.](https://raw.githubusercontent.com/vincenzosgueradev/connection-reference-governance/main/docs/screenshots/10-result.png)

You know exactly what changed and what did not.

### Clean up and remove

![Clean up: the references no flow of the solution uses.](https://raw.githubusercontent.com/vincenzosgueradev/connection-reference-governance/main/docs/screenshots/15-cleanup-unused.png)

Find leftovers; they are listed, never changed by the dialog itself.

![Check dependencies on the whole environment: a verdict for each unused reference.](https://raw.githubusercontent.com/vincenzosgueradev/connection-reference-governance/main/docs/screenshots/16-cleanup-dependencies.png)

Know whether something outside the solution, such as an agent or an app, still depends on a reference.

![Duplicates: the references that hold the same connection, with the one to keep chosen and what the merge will do.](https://raw.githubusercontent.com/vincenzosgueradev/connection-reference-governance/main/docs/screenshots/11-cleanup-merge.png)

Merge duplicates in two confirmed steps: re-point the flows, then remove what is left.

![Remove from solution: the row leaves the solution and stays in the environment.](https://raw.githubusercontent.com/vincenzosgueradev/connection-reference-governance/main/docs/screenshots/17-remove-confirm.png)

Take references out of a solution safely.

![Delete from the environment: a warning, a backup of the records, a code to copy and an acknowledgement.](https://raw.githubusercontent.com/vincenzosgueradev/connection-reference-governance/main/docs/screenshots/18-delete-reference-confirm.png)

A permanent delete is never one click away.

### Connections of the environment

![Check all: a ring, phases, counters and the connector in hand while every connection is read.](https://raw.githubusercontent.com/vincenzosgueradev/connection-reference-governance/main/docs/screenshots/02-connections-checking.png)

Read what depends on every connection, four at a time, with a Cancel.

![A connection opened: id, connector, creator, dates and status.](https://raw.githubusercontent.com/vincenzosgueradev/connection-reference-governance/main/docs/screenshots/20-connection-details.png)

See the whole record of a connection in one place.

![What depends on a connection: apps, connection references, flows and agents, with a note of what was and was not read.](https://raw.githubusercontent.com/vincenzosgueradev/connection-reference-governance/main/docs/screenshots/21-connection-dependencies.png)

Never told that a connection is unused when the tool could not see everything.

![The connector filter, with the drawing and the count of every connector.](https://raw.githubusercontent.com/vincenzosgueradev/connection-reference-governance/main/docs/screenshots/22-connector-filter.png)

Narrow a long list to one connector in a click.

![Deleting connections: a backup with no secret, each connection confirmed in the Maker portal, a code and an acknowledgement.](https://raw.githubusercontent.com/vincenzosgueradev/connection-reference-governance/main/docs/screenshots/03-delete-confirm.png)

The strongest safeguards sit on the most destructive action.

![The result of a deletion: each connection checked again, deleted and read back.](https://raw.githubusercontent.com/vincenzosgueradev/connection-reference-governance/main/docs/screenshots/12-connections-delete-result.png)

Proof of what was deleted.

## What this tool changes

It reads solutions, solution components, connection references and flows (modern flows, not desktop flows) from the connected Dataverse environment. When you create a connection reference it also reads, read only, the list of your connections of that environment from the Power Platform API (the API has to be enabled on the connection in Power Platform ToolBox; without it you can still create a reference with no connection yet). Nothing read is stored or sent anywhere else. It writes only after you review a preview and confirm:

- the connection of existing connection references (the connection id column);
- the flow definition of existing flows, only the name of the connection reference a flow points to;
- the membership of connection references in the open unmanaged solution (**Remove from solution**): the rows themselves stay in the environment;
- the existence of connection references (**Delete**): the rows are deleted from the environment and so from every solution. This cannot be undone. The confirmation says so in its own words, asks for an acknowledgement, offers a file with the reference records first, and stays locked until you have copied and pasted a code shown in the dialog. A reference that anything depends on (the environment is asked just before, and again at the moment of the delete) is never deleted.
- the existence of connections (**Delete** in the Connections area): the connection is deleted through the Power Platform API and cannot be undone. The tool never deletes one that was not confirmed in the Maker portal, checked again just before, and ticked with the acknowledgement and code of the dialog.

Otherwise the Connections area only reads: the list of connections and of apps through the Power Platform API, and the connection references, flows and agents from Dataverse. It never changes the owner of a connection and never creates, shares or re-authenticates one.

A reference that a flow of the solution still uses cannot be removed or deleted: re-point those flows first. It creates only one thing: a new connection reference of the same connector, from the re-point dialog, after a review step that shows the exact record. A flow that is turned on is never written, because Dataverse does not accept the change: turn it off first, or give the tool your permission (off by default, with its own acknowledgement) to turn it off for the change and on again afterwards; a flow that cannot be turned on again is named in the result and in the report. Undo is not offered for writes to Dataverse; the preview lists the old values so you can restore them by hand.

Connection owner and connection state are not available from the connected environment, so the tool shows the owner of the reference and does not flag by connection owner or state.

## Privacy and network use

The tool talks only to the Dataverse environment you are connected to and to the Power Platform API for that environment, both through Power Platform ToolBox. No data is sent anywhere else, nothing is stored outside the session, and there is no telemetry.

## Support and bugs

- Bugs and ideas: https://github.com/vincenzosgueradev/connection-reference-governance/issues
- Security: report privately through https://github.com/vincenzosgueradev/connection-reference-governance/security (see https://github.com/vincenzosgueradev/connection-reference-governance/blob/main/SECURITY.md)

## AI Assistance

AI helped write a substantial part of the code and tests. The author reviews and tests everything that is published.

## Updates

Page text reviewed for version 0.1.0.

Full history: https://github.com/vincenzosgueradev/connection-reference-governance/blob/main/CHANGELOG.md

### 0.1.0 - 2026-11-13

- Added a view of every flow of an unmanaged solution with the connection references it uses, and a view grouped by connection reference.
- Added flags for references with no connection and for flows that declare a reference that does not exist.
- Added bulk change of the connection of references and bulk re-point of flows to another reference, with a preview, a confirmation and a result per row.
- Added creation of a connection reference from the re-point dialog, remove from solution and delete, each with its own preview and confirmation.
- Added Clean up: unused references and duplicates, with a merge of duplicates in two confirmed steps.
- Added dependencies in the whole environment for a reference: flows, Copilot Studio agents, apps and other components, in any solution.
- Added a Connections area outside any solution: connections with connector, status and creator, what depends on each one, Check all, and a guarded delete confirmed in the Maker portal one by one.

## License

MIT. The full text is in https://github.com/vincenzosgueradev/connection-reference-governance/blob/main/LICENSE
