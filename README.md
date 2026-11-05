# Connection Reference Governance

See which connection references every flow in a solution uses, find references with no connection or flows pointing at a missing reference, and change or re-point them in bulk after a preview. Works on unmanaged solutions in the connected environment.

## Features

- One row per flow with its type (instant, automated or scheduled), state, connections at a glance and last modified date; open a row to see the trigger, actions, owner, dates, id and a table of its connections with reference, connector and connection in full (custom connectors are marked). It adapts to narrow panes.
- Opens on a home screen with the number of unmanaged solutions and of flows, and a sortable table of the solutions (flows, created, version, publisher) with search; choose one to see its flows with the connection references each flow uses.
- A second view groups by connection reference: connector, connection, reference owner and the flows that use it.
- Flags what the data proves: a reference with no connection set, and a flow that declares a reference that does not exist.
- Change the connection of selected references in bulk, with a preview that lists every row, the old value and the number of flows affected.
- Re-point selected flows to another reference of the same solution and connector, with the same preview and a per-row result.
- In the Connection references view: remove the selected references from the solution (they stay in the environment), or delete them from the environment, each with the same preview, confirmation and per-row result.
- A change runs as a guided path with a stepper and a breadcrumb: Choose, Review (the plan in words and figures), Preview (two tabs: the exact content as a line diff, split or unified, and a table of what each item is now and will be), Apply (a timeline with the time elapsed and the rows as they finish) and Result (a banner, figures, one line per row and a report you can save). You can go back until the write starts; after that the only way out is the Result.
- Before anything is written a confirmation dialog opens over the screen: the environment, the scope in four figures (rows to change, flows affected, flows turned on, rows not changed), one before-and-after line per row, the warnings, the offer to save a backup of the old values, and an acknowledgement you must tick before Apply is enabled. Cancel, Escape and the close button write nothing.
- When re-pointing, the new reference can only be another reference of the same connector in the solution, and is disabled until you choose which reference to replace.
- Each row is checked again just before it is written (skipped if someone changed it meanwhile) and read back afterwards.
- Managed solutions cannot be changed, so they are not offered: a disabled Managed tab shows how many there are.

## What this tool changes

It reads solutions, solution components, connection references and flows (modern flows, not desktop flows) from the connected Dataverse environment. It writes only after you review a preview and confirm:

- the connection of existing connection references (the connection id column);
- the flow definition of existing flows, only the name of the connection reference a flow points to;
- the membership of connection references in the open unmanaged solution (**Remove from solution**): the rows themselves stay in the environment;
- the existence of connection references (**Delete**): the rows are deleted from the environment and so from every solution. This cannot be undone. The confirmation says so in its own words, asks for an acknowledgement, offers a file with the reference records first, and stays locked until you have copied and pasted a code shown in the dialog. A reference that anything depends on (the environment is asked just before, and again at the moment of the delete) is never deleted.

A reference that a flow of the solution still uses cannot be removed or deleted: re-point those flows first. It never creates anything. Only flows that are turned off are re-pointed: turn them off first. Undo is not offered for writes to Dataverse; the preview lists the old values so you can restore them by hand.

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
