# Contract: the Host (the only door)

New and changed members of `Host` in `src/host.ts`. A test double in `test/helpers/fixtures.ts` implements the same members; no other file touches `window.powerplatformAPI`, `window.dataverseAPI` or `window.toolboxAPI`.

## `listConnections(environmentId, next?)` (changed)

- Sends: `powerplatformAPI.Connectivity.Get('environments/{env}/connections?api-version=2024-10-01')`, and the `nextLink` or `$skiptoken` of the previous page when given.
- Returns the raw answer (`Record_`); the model parses it. Rejects when it cannot be read.
- The old one-argument call keeps working (the first page).

## `listApps(environmentId, next?)` (new, read only)

- Sends: `powerplatformAPI.PowerApps.Get('environments/{env}/apps?api-version=2024-10-01')` with `$top` and the `$skiptoken` of the previous page when given.
- Returns the raw answer; the model reads `value[].name`, `value[].properties.displayName`, `value[].properties.owner`, `value[].properties.connectionReferences[].sharedConnectionId`. Rejects when it cannot be read (a refusal is expected for a user who is not an administrator).

## `searchFlowsByConnection(name)` (new, read only)

- Sends: `dataverseAPI.queryData("workflows?$select=workflowid,name,statecode,_ownerid_value&$filter=category eq 5 and contains(clientdata,'{name}')")`, the name escaped for OData (a single quote doubled; only `[A-Za-z0-9-_.]` names are searched, anything else is reported as not scanned).
- Returns the rows; rejects when the environment refuses the filter (reported as `notScanned`, OP-2).

## `deleteConnection(environmentId, connectorKey, name)` (new, GUARDED)

- Never called while `features.connectionDelete` is false: the service checks the flag first, and the host method throws `Error('Deleting connections is switched off.')` as a second guard.
- The request is built by `connectionDeleteRoute(environmentId, connectorKey, name)` in `src/host.ts`, the one line the live test changes (research D-4). Candidate 1: `powerplatformAPI.PowerApps.Delete('environments/{env}/apis/shared_{connector}/connections/{name}?api-version=2024-10-01')`.
- Resolves when the service accepted the request; the service then reads the list back to prove it.

## `copyText(text)` (new)

- Sends: `toolboxAPI.utils.copyToClipboard(text)`. Used for the portal address.

## Unchanged and reused

`query`, `environmentId`, `dependents`, `saveFile`, `environmentName`, `notify`, `currentUserId`.
