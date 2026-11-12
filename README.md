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
- **Connections** (a second area, beside the solutions, outside any solution): a rich list of the connections of the environment that you can see, with the connector, display name, status (Connected, Needs reconnect, Error), created and modified time, creator and id; counts (total, broken, no dependency found, in use) on the filters, search and sorting. Open a row and what depends on it is read by itself: apps, connection references, flows and Copilot Studio agents, with where they live. **Check all** reads every connection four at a time, with progress and a Cancel, and **Select the ones with no dependency found** ticks them. A connection nothing was found for says **No dependency found**, never "unused": the signed-in user cannot read everything, a note says how much each source read (and each problem once), and the tool says plainly that the Maker portal can list flows (from the flow service) that it cannot see, so check "Flows using this connection" there before deleting. The connection chip of a reference opens the connection there. Deleting connections is built (Preview, backup, code, acknowledgement, each connection checked again before and read back after) but switched off until the route is verified; meanwhile **Copy portal address** takes you to the Maker portal.
- A change runs as a guided path with a stepper and a breadcrumb: Choose, Preview (two tabs: the exact content as a line diff, split or unified, and a table of what each item is now and will be), Apply (a timeline with the time elapsed and the rows as they finish) and Result (a banner, figures, one line per row and a report you can save). You can go back until the write starts; after that the only way out is the Result.
- Before anything is written a confirmation dialog opens over the screen: the environment, the scope in four figures (rows to change, flows affected, flows turned on, rows not changed), one before-and-after line per row, the warnings, the offer to save a backup of the old values, and an acknowledgement you must tick before Apply is enabled. Cancel, Escape and the close button write nothing.
- When re-pointing, the new reference can only be another reference of the same connector in the solution, and is disabled until you choose which reference to replace.
- Each row is checked again just before it is written (skipped if someone changed it meanwhile) and read back afterwards.
- Managed solutions cannot be changed, so they are not offered: a disabled Managed tab shows how many there are.

## What this tool changes

It reads solutions, solution components, connection references and flows (modern flows, not desktop flows) from the connected Dataverse environment. When you create a connection reference it also reads, read only, the list of your connections of that environment from the Power Platform API (the API has to be enabled on the connection in Power Platform ToolBox; without it you can still create a reference with no connection yet). Nothing read is stored or sent anywhere else. It writes only after you review a preview and confirm:

- the connection of existing connection references (the connection id column);
- the flow definition of existing flows, only the name of the connection reference a flow points to;
- the membership of connection references in the open unmanaged solution (**Remove from solution**): the rows themselves stay in the environment;
- the existence of connection references (**Delete**): the rows are deleted from the environment and so from every solution. This cannot be undone. The confirmation says so in its own words, asks for an acknowledgement, offers a file with the reference records first, and stays locked until you have copied and pasted a code shown in the dialog. A reference that anything depends on (the environment is asked just before, and again at the moment of the delete) is never deleted.

The Connections area is read only while deleting connections is switched off: it reads the list of connections and the list of apps through the Power Platform API, and the connection references, flows and agents from Dataverse, and writes nothing. It never changes the owner of a connection and never creates, shares or re-authenticates one.

A reference that a flow of the solution still uses cannot be removed or deleted: re-point those flows first. It creates only one thing: a new connection reference of the same connector, from the re-point dialog, after a review step that shows the exact record. Only flows that are turned off are re-pointed: turn them off first. Undo is not offered for writes to Dataverse; the preview lists the old values so you can restore them by hand.

Connection owner and connection state are not available from the connected environment, so the tool shows the owner of the reference and does not flag by connection owner or state.

## Privacy and network use

The tool talks only to the Dataverse environment you are connected to, through Power Platform ToolBox. No data is sent anywhere else, nothing is stored outside the session, and there is no telemetry.

## Support and bugs

- Bugs and ideas: https://github.com/vincenzosgueradev/connection-reference-governance/issues
- Security: report privately through https://github.com/vincenzosgueradev/connection-reference-governance/security (see https://github.com/vincenzosgueradev/connection-reference-governance/blob/main/SECURITY.md)

## AI Assistance

AI helped write a substantial part of the code and tests. The author reviews and tests everything that is published.

## Updates

(Added after publishing, derived from https://github.com/vincenzosgueradev/connection-reference-governance/blob/main/CHANGELOG.md.)

## License

MIT
