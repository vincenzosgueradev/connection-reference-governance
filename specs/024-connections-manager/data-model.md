# Data model: Connections manager

Plain data, no behaviour; the pure functions that work on it are in `src/model/connections.ts`, `connectionDeps.ts` and `connectionPlan.ts`.

## ConnectionRow (from the list)

| Field | Type | Source | Note |
|---|---|---|---|
| `name` | string | `name` | The value a reference stores in `connectionid`; the key everywhere |
| `connectorKey` | string | `id` (`/apis/<key>/connections/`) | Without the `shared_` prefix; empty when absent |
| `connectorName` | string | `properties.apiId`, the connector table of the tool | Falls back to the key |
| `displayName` | string | `properties.displayName` | Usually the signed-in account |
| `status` | `'connected' \| 'error' \| 'reconnect' \| 'unknown'` | `properties.statuses` | See research D-5 |
| `statusDetail` | string | the status error message | Shown on screen only |
| `createdTime`, `modifiedTime` | string (ISO) | `properties.createdTime`, `properties.lastModifiedTime` | Empty when absent |
| `creator` | `{ name: string; email: string }` | `properties.createdBy` | On screen only (T7) |

`LiveConnection` (feature 021) stays as it is; `ConnectionRow` is parsed from the same answer with more fields, and `LiveConnection` is derived from it so the new-reference panel is untouched.

## ConnectionDependent

| Field | Type | Note |
|---|---|---|
| `kind` | `'app' \| 'flow' \| 'reference' \| 'agent'` | |
| `id` | string | Row id, or the app name |
| `name` | string | Display name, or the id when it cannot be named |
| `state` | string | On, Off, Suspended, or empty |
| `ownerName` | string | Empty when not read |
| `solutions` | string[] | Names of the solutions that hold it; empty for an app or a flow outside any solution |
| `via` | string | For a flow or an agent found through a reference: the reference's name |

## ConnectionDependencyReport

| Field | Type | Note |
|---|---|---|
| `dependents` | ConnectionDependent[] | Merged from every source, no duplicates |
| `sources` | `Record<'apps' \| 'references' \| 'flows' \| 'agents', SourceState>` | `SourceState` is `ok`, `failed(reason)` or `notScanned(reason)` |
| `verdict` | `'in-use' \| 'none-found' \| 'unchecked-source'` | `none-found` only when no source is `failed` and `dependents` is empty; `unchecked-source` when a source failed and nothing was found |
| `note` | string | The coverage note (FR-2406) |

`notScanned` is for the flows-by-name source when the environment refuses the search (OP-2). Verdict rule: `none-found` when no source is `failed`, nothing was found, and any `notScanned` source is named in the note; it is printed in the deletion Preview too. A flow whose definition could not be read makes the flows source `failed`.

## ConnectionsState (the slice)

| Field | Type | Note |
|---|---|---|
| `list` | `{ status: 'idle' \| 'loading' \| 'ready' \| 'failed'; items: ConnectionRow[]; read: number; error: string }` | `read` counts what is in so far while paging |
| `environmentId` | string | Read once; empty when unknown |
| `filter`, `search`, `sort` | string, string, `{ key, dir }` | Kept across a refresh |
| `shown` | number | How many rows are drawn (pages of 100) |
| `open` | string[] | Names of the rows opened |
| `selected` | string[] | Names ticked; only eligible rows can be in it |
| `deps` | `Record<string, DepState>` | `DepState` is `loading`, `ready(report)` or `failed(error)` |
| `checkAll` | `null \| { total: number; done: number; startedAt: number; cancelled: boolean; step: 'apps' \| 'references' \| 'connections' }` | Progress of Check all |
| `deletion` | `null \| DeletionDialog` | See below |

`DeletionDialog`: `{ plan, step: 'preview' \| 'apply' \| 'result', code, typedCode, ack, backupSaved, live: RowOutcome[], results: RowOutcome[] \| null, refreshFailed }`.

## ConnectionDeletePlan

| Field | Type | Note |
|---|---|---|
| `rows` | `{ name, label, connector, creator, blocked? }[]` | One per ticked connection; `blocked` says why a row will not be written |
| `warnings` | string[] | Permanent; references that still point at it will show it missing; "not scanned" notes |
| `backup` | string | The text of the backup file (records, no secret) |

## Transitions that matter

- `connectionsOpened` -> list `loading` -> `connectionsLoaded` (or `connectionsFailed`); deps and selection are dropped on every load, filter, search, sort and open rows are kept (rows that no longer exist close).
- `connectionOpened(name)` -> the row opens; deps `loading` if none -> `depsLoaded` or `depsFailed`.
- `checkAllStarted` -> progress -> `checkAllFinished` or `checkAllCancelled`; a cancel keeps what was read.
- `selectEligible` ticks exactly the eligible rows; `toggleConnection` refuses an ineligible one.
- `deletionOpened` (only with the flag on and a non-empty selection) -> `deletionConfirmed` (needs code and ack) -> rows -> `deletionDone` -> the list is read again.
