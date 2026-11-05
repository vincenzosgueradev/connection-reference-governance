# Research and gap analysis

Date: 2026-11-04. Sources: Microsoft Learn (Dataverse table reference), `@pptb/types` 1.2.x.

## Gap analysis (constitution II)

| Surface | What it does | Gap left |
|---|---|---|
| Maker portal, Solutions > Connection references | Edit one reference at a time | No cross-reference view, no bulk change, no flow-to-reference map |
| Power Automate flow details | Shows connections of one flow | One flow at a time; no solution-wide view |
| Power Platform admin center | Connections per environment | No link between flows and references |
| CoE Starter Kit | Inventory in a separate environment | Needs install and sync; no write |
| PPTB marketplace and Tool Ideas board | Searched by hand on 2026-11-04 | No tool lists flows by connection reference and re-points them (to be rechecked before release) |

Conclusion: gap confirmed for a solution-wide view and a previewed bulk change inside PPTB.

## Verified metadata (constitution V, T5)

| Fact | Value | Source |
|---|---|---|
| Solution member lookup | `solutioncomponent` with `solutionid`, `objectid`, `componenttype` | Learn: SolutionComponent table |
| Workflow component type | 29 | Learn: SolutionComponent ComponentType options |
| Connection reference component type | **Not in the published list** (it is a type code assigned per environment, above the fixed range) | Learn list checked 2026-11-04: absent |
| Decision | Membership is resolved by `objectid` intersection: ids of members of the solution are matched against `connectionreference` and `workflow` row ids. No hard-coded code. | T5 |
| Connection reference columns | `connectionreferenceid`, `connectionreferencelogicalname`, `connectionreferencedisplayname`, `connectorid` (string), `connectionid` (string, id in API hub), `ownerid`, `statecode` (0 Active, 1 Inactive), `ismanaged` | Learn: connectionreference table |
| Flow | `workflow` with `category = 5` (Modern Flow); `statecode` 0 Draft, 1 Activated, 2 Suspended; `clientdata`, `ismanaged` | Learn: Process (workflow) table |

## Open finding: connection owner and state

`connectionid` is an API hub connection name. Its owner and its connected state live in the Power Apps / Power
Automate connection service, not in a Dataverse column this tool can read, and T1 forbids `api.flow.microsoft.com`.
What Dataverse does give: the owner of the **reference row** (`ownerid`).

Decision: the model implements the "connection owned by another user" and "connection not connected" flags and is
tested on them, but they are fed by an optional connection-info source. The shipped host provides none, so the
tool shows the **reference owner** (provable) and states "connection owner: not available" instead of guessing.
The two flags activate only when a verified source exists. Verify in a real environment whether any Dataverse
table exposes connection owner/state before enabling them (recorded in `PENDING.md`).

## `clientdata` shape

`properties.connectionReferences` is an object keyed by connection name (for example `shared_x`); each value holds
`connection.connectionReferenceLogicalName` pointing at a `connectionreference` row. Actions point at the key
through `inputs.host.connectionName`. Re-pointing changes `connectionReferenceLogicalName` of the entries that
currently hold the old logical name; keys and the definition are untouched. To be confirmed with a real flow before
release (manual check in `quickstart.md`).

## Active flows

Whether an active flow accepts a `clientdata` update is unverified (T4): such flows are blocked.

## Cross-check with Microsoft Learn (2026-11-04)

Read from Microsoft Learn.

| Finding | Source | What the tool does |
|---|---|---|
| The environment gives no connection owner or state; the reference row has `ownerid`. | Dataverse `connectionreference` table | Reference owner is shown; connection owner/state stay "not available". |
| Flows are `workflow` rows with `category = 5` **and `type = 1` (Definition)**; `type` 2 is Activation, 3 Template. | Learn: Work with cloud flows using code | Added `type eq 1` to the flow query (was missing). Test and mutant. |
| `statecode` 0 Draft (Off), 1 Activated, 2 Suspended. | Learn: workflow table | Only state 0 is rewritten (suspended is blocked too, until verified). |
| A flow is updated with a plain `Update` of `clientdata`, and `connectionReferences[*].connection.connectionReferenceLogicalName` names the reference. | Learn: Work with cloud flows using code | That field is changed. Active flows stay blocked (T4) until a hand test records the behaviour. |
| Removing `inputs.authentication` and setting `inputs.host.connectionReferenceName` on related actions and triggers is **not documented by Microsoft Learn.** | Learn search found no page | **Not applied.** Unverified fields are not written into a production definition. Hand check 13 in `quickstart.md` shows whether a re-pointed flow still saves and turns on; only if it does not, this becomes a tested, opt-in step. |
| Updating a flow with a reference owned by another user can fail with `ConnectionAuthorizationFailed` (error text reported by Dataverse). | Dataverse error text | Preview warns when the target reference is not owned by the current user (WhoAmI); each refusal is reported on its row. |
| Current user id: `WhoAmI` function, `UserId`. | Learn: WhoAmI; `@pptb/types` example | `Host.currentUserId()`. |
| Solution-aware flows have a draft row and a published row. | Learn: Drafts and versioning | Noted; the solution component points at one `workflowid`. Hand check 1 compares the list with the maker portal. |

## Safety design

1. In-place text edit of `clientdata` (only the value after `connectionReferenceLogicalName` changes), then parse and
   compare with the same change made on the parsed document; any difference aborts that row.
2. Each row is read again right before its write and must equal the value the preview showed; otherwise it is skipped.
3. Each row is read back after the write and checked (connection id equal; for flows the new reference present and the
   old one gone).
4. A backup file of the old values can be saved from the preview.
5. A connection id belongs to one connector: mixed selections are a hard stop; an id not used by any reference of that
   connector is warned.
6. Row ids and solution ids are validated as GUIDs before they enter a query.

## Connector icons (2026-11-04)

Asked: show the official connector logo next to each connection. Checked:

- `microsoft/PowerPlatformConnectors` (MIT) holds **no SVG files** and PNG icons only for third-party certified connectors
  (167 PNG of 4152 files); Microsoft's own connectors have no icon file there.
- The icons Learn shows are PNG files behind a versioned CDN address (`conn-afd-prod-endpoint-...azurefd.net/.../icon.png`):
  the address cannot be built from the connector name, and loading them would send requests to an external service
  (constitution V: only declared endpoints) from a tool that promises to talk only to the connected environment.
- Logos of third-party services are trademarks; bundling them in a marketplace tool needs the owners' permission.

Decision: the tool shows an **original glyph per connector category** (mail, database, cloud, table, chat, ...) in the
shared UI kit style (`.icon-NAME`, one colour, `currentColor`) and the **official display name** from the Learn
connector reference (`src/model/connectors.ts`, 40 connectors; the key is the connector id without `shared_`).
Unknown connectors get a readable name made from the id and the plug glyph. No network, no trademark use.

Possible later: icons of custom connectors read from the environment (`connector` table, icon column), after a hand
check of its format; recorded in PENDING.md.

## Custom connectors and owner column (2026-11-04)

- `connectionreference.customconnectorid` is a lookup to `connector` (Learn: connectionreference writable columns). A reference with it set is marked Custom connector; no guess from the name.
- The Reference owner column is the `ownerid` of the reference row (Learn: OwnerId, Owner, systemuser or team), not the owner of the connection; the column header says so in its tooltip.

## Flow count per solution (2026-11-04)

Two plain queries, no custom header: `workflows` with `category eq 5 and type eq 1` (modern flow definitions) and `solutioncomponents` with `componenttype eq 29` (workflow components of every solution; 29 is Workflow in the Learn component type list). A flow is counted in a solution when its id is in both, once per solution; the hero total is the distinct flows of the unmanaged solutions. A result of 5000 rows or more may be cut by the environment, so the counts are not shown (dash) rather than wrong. Hand check 20 compares the numbers with the maker portal.

## Flow type and details (2026-11-04)

Type rule, from the first trigger of the definition (`properties.definition.triggers`):

| Trigger `type` | Flow type | Source |
|---|---|---|
| `Recurrence` | Scheduled | Learn, Triggers in Power Automate cloud flows: a scheduled flow adds the Recurrence trigger |
| `Request` | Instant | Logic Apps trigger reference: the Request trigger is also known as the manual trigger; Learn: an instant flow starts manually |
| any other (connector trigger, HTTP poll, webhook) | Automated | Learn: an automated flow starts when an event happens |
| none, or an unreadable definition | Unknown | nothing is guessed |

The panel also shows the trigger (operation or name, type and kind), the number of actions (nested ones included),
owner (user or team name, read with plain queries), created and modified dates, description and flow id, all read from
`workflow` columns that Learn lists (`description`, `createdon`, `modifiedon`, `ownerid`, `workflowid`) or from
`clientdata`. Hand check 21 compares the type column with the maker portal; an HTTP-request flow is expected to read
Instant (Request trigger) and must be checked.

## Defect found in a hand test, 2026-11-04

The new reference of a re-point could be chosen with no reference to replace, and from another connector: the planner blocked it only after the preview. Cause: the rule lived only in the planner, not in what the screen offered. Fix: the rule is a pure model (`src/model/repoint.ts`), the reducer keeps the choices compatible, the view offers only compatible choices, and the planner stays as a second guard. Tests were written first and failed before the fix (see `test/repoint.test.ts` and the re-point tests in `test/views.test.ts` and `test/reducer.test.ts`). Lesson recorded in the root constitution (VII): the screen offers only what the planner would accept.
