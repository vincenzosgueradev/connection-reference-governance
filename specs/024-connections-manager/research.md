# Research: Connections manager

Sources: Microsoft Learn read on 2026-11-11 (links in spec.md, Research). Nothing here has been run live yet; each live check is in the quickstart (45 to 52).

## D-1. List connections

- **Decision**: keep `GET connectivity/environments/{env}/connections?api-version=2024-10-01` through `powerplatformAPI.Connectivity`, now read page by page (`nextLink` or `$skiptoken` when present) and parsed for more fields.
- **Rationale**: it is the only documented list, already proved live (feature 021). The richer fields read (`properties.statuses`, `properties.createdBy`, `properties.lastModifiedTime`, `properties.apiId`) are those the Power Apps for Admins connector documents for "Get Connections as Admin"; a field that is absent is shown as unknown, never guessed. Live check 45 confirms which of them this API returns.
- **Alternatives**: the Power Apps for Admins list (not reachable through the toolbox); the inventory API (connectors only, no connections).

## D-2. Apps that use a connection

- **Decision**: one `GET powerapps/environments/{env}/apps?api-version=2024-10-01` through `powerplatformAPI.PowerApps`, paged with `$top` and `$skiptoken`, kept for the whole Check all; match `properties.connectionReferences[].sharedConnectionId` to the connection name (case-insensitive).
- **Rationale**: documented, official, and what the portal's "Apps using this connection" needs. It is an administrator call ("Get AdminApps"); a refusal makes the apps source `failed`, which blocks selection (FR-2406).
- **Alternatives**: Dataverse canvas app rows (do not carry connections); the inventory API (connector level only).

## D-3. Flows, references, agents

- **Decision**: (a) read every `connectionreference` of the environment once (the columns of feature 021) and group by `connectionid`; (b) for each reference that holds the connection, reuse the dependency reading of feature 023 (`RetrieveDependentComponents`, agents by `bot.providerconnectionreferenceid` and `botcomponent_connectionreference`) behind a `Scope`; (c) flows that hold the connection by name in `clientdata` (OP-2) through a filter on `workflows` with `category eq 5` and `contains(clientdata, name)`, when the environment accepts it.
- **Rationale**: (a) and (b) are verified code paths. (c) is believed but unverified: a flow outside a solution keeps the connection name in its definition. `contains` on a large text column may be refused; then the flows source reports "not scanned" in the coverage note, the deletion Preview repeats it, and the acknowledgement toggle covers it.
- **Alternatives**: scan every flow's `clientdata` (large, no paging through the host's door): rejected, as in feature 023.

## D-3b. What the portal shows that Dataverse does not (found live, 2026-11-11)

- **Seen**: the portal's page of a connection listed 8 flows under "Flows using this connection"; the tool, reading Dataverse, found none tied to it. The portal reads the flow service's own records of which connection each flow is bound to; they can differ from the `connectionid` of the references (for example after the connection of a reference was changed).
- **Source tried, and removed**: Power Platform API, Power Automate, `GET powerautomate/environments/{env}/cloudFlows` (List Cloud Flows). Live result on 2026-11-11: `ClientScopeAuthorizationFailed: The caller does not have permission to perform GET` — the toolbox's application has no permission for it, so it cannot be used from a tool. The code that read it was removed.
- **Decision**: the tool says plainly what it cannot see (FR-2420) instead of claiming certainty; the coverage note shows how much each source read ("57 connection references (0 hold it)"), so a connection that the portal ties to flows and Dataverse does not is visible as a difference to check there.
- **Compared name by name (2026-11-11, an Office 365 connection)**: the portal listed 21 flows, the tool 17; 14 in common, 7 only in the portal (three `FactoryHub-NotifDispatcherV2`, two `Button -> Compose...`, a second `Flow`, a second `Notifiche - Dispatcher`), 3 only in the tool (`SendApproveRequest` and two `udemy day ... with CHILD`). Each view sees flows the other does not: dependency tracking can leave a flow out ("a component whose dependency is not tracked is not listed"), and the flow service keeps its own bindings. Answer: the definitions of the flows are also searched for the name of each reference that holds the connection (`contains(clientdata, <logical name>)`, the same filter as the search by connection name), so a flow that uses a reference is found even when tracking missed it.
- **Live result of that search (2026-11-11)**: for the 4 references that hold the Office 365 connection the search of the definitions gave back 17 flows, the same 17 that dependency tracking lists. So both Dataverse views agree and the filter on `clientdata` works; the 7 portal-only flows name none of those references, and are tied to the connection only in the records of the flow service, which a tool cannot read.
- **Likely reason (a hypothesis)**: the flows were bound to the connection when they were made; the connection of their reference was later changed in Dataverse, and the flow service keeps the older binding until a flow is saved or turned on again.

## D-4. Deleting a connection (OP-1)

- **Facts**: Remove Connection as Admin (`Remove-AdminConnection`) exists on the Power Apps for Admins connector with inputs environment, connector name, connection name and api-version. The Power Platform API reference lists no delete for connections. A DSR-compliance delete exists in the workflow agents namespace; it is for another purpose and is not used.
- **Route** (found at the live check of 2026-11-12, kept in `connectionDeleteRoute()`): `powerplatformAPI.Connectivity.Delete('environments/{env}/connectors/shared_{connector}/connections/{name}?api-version=2024-10-01')`. Two other routes were tried first and do not exist in the toolbox (`PowerApps environments/{env}/apis/shared_{connector}/connections/{name}` and `Connectivity environments/{env}/connections/{name}`); the code now holds only the accepted one.
- **Decision**: build the whole deletion (plan, dialog, apply, tests with a fake host) now; ship `features.connectionDelete = false`; the guard test requires a recorded passed live check in this file before the flag can be true. Until then each connection offers **Open in the Maker portal**.
- **Rationale**: the work that does not depend on the route is the larger part and is safe to ship read only.
- **Live check record** (check 49):
Live check passed: 2026-11-12
  - What was run: from the tool, in the DEV environment, on connections that the author had confirmed one by one in the Maker portal, the deletion of 28 connections in one run, each one checked again just before, deleted and read back from the list: 28 deleted, 0 skipped, 0 failed, 4 min 11 s. Earlier the same day a Logic flows connection was refused by the environment with `AdminDeleteLogicFlowConnectionsNotAllowed` (the route answered; these connections are deleted only with their flow), so they are not listed any more.
  - Which route answered (read from the log of the tool): `Connectivity environments/<env>/connectors/shared_commondataserviceforapps/connections/<name>`, after 2 routes that did not exist. Only that route is kept.
  - Decision of the author (2026-11-12): the flag stays on.

## D-5. Status of a connection

- **Decision**: `Connected` when the statuses list is non-empty and every entry says `Connected`; `Error` when one entry carries an error; `Needs reconnect` when a status says so (the service's wording is matched case-insensitively against the values seen live at check 45); otherwise `Unknown`.
- **Rationale**: honest by construction; the live check fixes the exact words and a test pins them.

## D-6. Where the area lives

- **Decision**: a segmented control `Solutions | Connections` at the top of the home screen; the breadcrumb shows `Connections`; the header badge and environment name are unchanged.
- **Alternatives**: a separate tool (rejected: it is the same governance); a tab inside a solution (wrong: connections are not in a solution).

## D-7. Where the deletion dialog hosts its steps

- **Decision**: one dialog with three states (Preview and confirm, Apply, Result), like feature 012, not the wizard screens.
- **Rationale**: the wizard screens are built on a `Snapshot` and a solution breadcrumb; the connections area has neither. The kit pieces (modal, progress bar, busy modal, change list, code box, toggle) are reused.

## D-8. Check all

- **Decision**: 4 connections at a time, a progress bar with "read of total" and time left, a Cancel that stops starting new ones and keeps what was read; the apps list and the references list are read once at the start (two steps shown first), then the per-connection reads.
- **Rationale**: honest progress and bounded load; the shared reads make the per-connection cost a few calls.

## D-9. The Maker portal address

- **Facts**: the toolbox API (`toolboxAPI`) has no call that opens an address outside the tool; it has `utils.copyToClipboard`. A per-connection address is not in Microsoft Learn, but the author showed the form the portal itself uses on 2026-11-11: `https://make.powerapps.com/environments/{environmentId}/connections/shared_{connector}/{connectionName}/details`.
- **Decision**: while the deletion flag is off, each connection offers **Copy portal address**: the address of that connection's own page in the form above, copied through the host, so the user pastes it in a browser and lands on the connection (the connections page of the environment is the fallback when the connector or name is missing). A plain link is not used (it would navigate the tool's own window).
- **Rationale**: only documented, stable addresses are built and only documented host calls are used; a guessed deep link could break silently.

## D-10 Live comparison with the Maker portal (2026-11-12)

Three connections of the DEV environment were opened in the portal and compared with the tool, one by one, by the author:

- HTTP with Microsoft Entra ID (preauthorized) `4b648095`: the tool found the flow `aimodel` and 2 connection references; the portal also listed 2 flows `API_RenameCopilotAgent`, which do not exist in the environment (not in the Default Solution). The inventory named 5 flows for the connector: 1 found on this connection, 4 read and found on other connections (the same flows appear, with their own connection, in the portal page of that other connection). Result: the tool is right; the portal listed flows that no longer exist.
- The connection that those 4 flows use (`5451a346`): the portal lists the same flows the tool attributes to it.
- Excel Online (Business) `a9a9bfad`: the tool found `DeltaExcel` and `DeltaExcel Apply To Each` (the inventory also says 2); the portal also listed `DeltaExcel Union`, which does not exist in the environment, and `DeltaExcel` twice (one flow). Result: the tool is right.

Conclusion (FR-2426): the portal list comes from the flow service and can hold permissions of flows that were deleted; it is a comparison aid, not the truth. No flow that exists and uses a connection was missing from the tool in these three cases.
