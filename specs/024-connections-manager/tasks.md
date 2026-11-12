# Tasks: Connections manager (environment level)

**Input**: Design documents in `specs/024-connections-manager/` (spec.md, plan.md, research.md, data-model.md, contracts/, quickstart.md)

**Prerequisites**: plan.md and spec.md read; constitution 1.8.2 and the root constitution read.

**Tests**: included. The tool's rules require them (constitution T9, "test first for defects", mutation check for the planner). Each module gets its test file in the same task; a task is done when `npx tsc --noEmit` and the tests it names pass.

**Format**: `- [ ] T### [P] [US#] Description with file path`. `[P]` = different files, no dependency on an unfinished task.

**Rule of this tool after every task that changes code**: run `npm run build` at the end of the phase (not per task) and say so in the report; never push or publish.

## Phase 1: Setup

- [X] T001 Amend the constitution in `.specify/memory/constitution.md`: add rule **T11. Connections of the environment (feature 024)** (an area outside the open solution; reads the connections list, the apps list through `powerplatformAPI.PowerApps` and Dataverse, all read only; a connection with no dependency found is never called unused; deleting a connection only behind the declared flag `connectionDelete`, off until a live check is recorded; out of scope: owner change, create, share, re-authenticate; the richer fields of a connection are read defensively and an absent one means unknown, pinned by a test after live check 45 (T5, T2c); **amend T7**: the backup file the user chooses to save may hold the connection records listed in data-model.md, never an email), adjust T1 and the Purpose paragraph, bump **Version 1.9.0**, Last Amended 2026-11-11. Add the matching test of the version line to the existing constitution test if one exists (search `test/` for `constitution`).
- [X] T002 [P] Create `src/features.ts` exporting `export const features = { connectionDelete: false } as const;` with a comment pointing at research.md D-4, and `test/features.test.ts` with the guard: if `features.connectionDelete` is true then `specs/024-connections-manager/research.md` MUST contain a line starting `Live check passed:` followed by a date; with the flag false the test passes without it.
- [X] T003 [P] Extend the fake host in `test/helpers/fixtures.ts` (`fakeHost`) and the scenario in `test/helpers/scenario.ts` with the new members of `contracts/host.md`: `listConnections(environmentId, next?)` (pages), `listApps(environmentId, next?)`, `searchFlowsByConnection(name)`, `deleteConnection(environmentId, connectorKey, name)`, `copyText(text)`; scenario options `connectionRows`, `apps`, `appsFail`, `flowSearch` (`'ok' | 'refused'`), `deleteResult`; each call is recorded in `calls`. Synthetic data only (T7).

## Phase 2: Foundational (blocks every story)

- [X] T004 Add the types in `src/types.ts`: `ConnectionRow` (fields and types exactly as in data-model.md: `name`, `connectorKey`, `connectorName`, `displayName`, `status: 'connected' | 'error' | 'reconnect' | 'unknown'`, `statusDetail`, `createdTime`, `modifiedTime`, `creator: { name; email }`) and `ConnectionDependent` (`kind: 'app' | 'flow' | 'reference' | 'agent'`, `id`, `name`, `state`, `ownerName`, `solutions: string[]`, `via`). Keep `LiveConnection` unchanged.
- [X] T005 [P] Parse the richer answer in `src/model/liveConnections.ts`: `parseConnectionRows(res)` returning `ConnectionRow[]` (status rule of research D-5: `connected` only when `properties.statuses` is non-empty and every entry says Connected, `error` when one entry carries an error, `reconnect` when one says so, else `unknown`; absent fields are empty strings, never guessed; the fields beyond `name`, `id`, `displayName` and `createdTime` are read defensively because only live check 45 proves this API returns them) and `nextOf(res)` returning the next page token or `''`; derive `parseConnections` (old) from it so feature 021 is untouched. Tests in `test/connections.parse.test.ts`: every status shape, a missing `properties`, a page with `nextLink`, an `id` with and without `/connections/`.
- [X] T006 [P] Create `src/model/connections.ts` (pure): `figuresOf(rows, deps)` (total, broken, noneFound, inUse; the last two count only rows whose dependencies were read), `filterRows(rows, deps, filter, connector, search)` (All, Broken, No dependency found, In use; search over name, connector, creator, id, case-insensitive), `sortRows(rows, key, dir)` (name, connector, status, modified), `canSelect(row, deps)` (true only for verdict `none-found`) and `eligibleNames(rows, deps)`. Tests in `test/connections.model.test.ts`, including that an unchecked, failed or in-use row is never eligible.
- [X] T007 Implement the new members in `src/host.ts` per `contracts/host.md`: `listConnections(environmentId, next?)` (first page unchanged), `listApps`, `searchFlowsByConnection` (names not matching `[A-Za-z0-9-_.]` are refused with an error value, single quotes doubled), `deleteConnection` (throws `Error('Deleting connections is switched off.')` when `features.connectionDelete` is false, otherwise sends the request built by `connectionDeleteRoute(environmentId, connectorKey, name)`), `copyText`. Test in `test/host.connections.test.ts` with a stubbed `window.powerplatformAPI`, `dataverseAPI` and `toolboxAPI`: the exact paths and queries, the guard, no call outside `host.ts`.
- [X] T008 Add the state slice in `src/state/reducer.ts` and `src/state/running.ts` per `data-model.md` and `contracts/state.md`: `area`, `connections: ConnectionsState | null`, every action of the table (`setArea`, `connectionsLoading` ... `deletionClose`), with the invariants: a loaded list drops deps, selection and checkAll; open rows that no longer exist close; `toggleConnection` refuses an ineligible row; `deletionOpen` is refused when the flag is off or nothing is selected; `deletionClose` is refused during apply; `running` counts a list reading, a dependency reading, Check all and an apply. Tests in `test/reducer.connections.test.ts`.
- [X] T009 Refactor `src/services/dependencies.ts` so the naming code takes a `Scope` (`{ memberIds: ReadonlySet<string>; flowNames: ReadonlyMap<string, string>; referenceNames: ReadonlyMap<string, string> }`) instead of a `Snapshot`; add `scopeOfSnapshot(snapshot)` and keep `loadDependencyReport` and `dependentLabels` signatures; no behaviour change: every test of features 019 and 023 stays green unchanged.
- [X] T010 Add the area switch to `src/views/main.ts`: a segmented control `Solutions | Connections` on the home screen (hidden inside a solution), `setArea` on change, the breadcrumb `Connections` when the area is open, and a placeholder mount point for the manager view; a draw key that includes the area. Test in `test/connections.area.test.ts` (the switch exists, switching keeps the solution list's filter and sort, the breadcrumb is right).

**Checkpoint**: `npx tsc --noEmit` and `npm test` green; nothing visible changes in the solution views.

## Phase 3: User Story 1 - See every connection of the environment (Priority: P1)

**Goal**: the rich, filterable list of all connections with figures, kept across refresh.

**Independent Test**: quickstart 45 and 46.

- [X] T011 [US1] Create `src/services/connections.ts` with `loadConnections(host)` returning `Result<{ rows: ConnectionRow[]; environmentId: string }>`: reads the environment id, then pages through `host.listConnections` until `nextOf` is empty, reporting the count so far through a callback; errors are values with the reason; a page that fails after the first returns the failure, not a partial list. Test in `test/connections.service.test.ts` (one page, three pages, a failing second page, an unreadable environment id).
- [X] T012 [US1] Add to `src/controller.ts`: `openConnections()` (sets the area, reads the list anew: Principle VII), `refreshConnections()` (keeps filter, search, sort, open rows and the scroll position through the reducer), both logging through `services/log.ts` with the number read and never the names; a second request while one runs is ignored. Test in `test/controller.connections.test.ts`.
- [X] T013 [US1] Create `src/views/connectionsManager.ts`: figures strip (total, broken, no dependency found, in use) with the kit's `figures`, toolbar (search, filter segmented, connector select, sort select, Refresh), the list as rich rows (connector tile and name, display name, status chip with an icon and a label, created and modified as `timeAgo` with the full date as title, creator, id in a monospace chip), pages of 100 with **Show more**, the empty state, the failed state with Retry, and the wait with a spinner and the count read. Theme variables only, no emoji, aria labels, keyboard reachable. No dependency logic yet (rows show "Not checked").
- [X] T014 [P] [US1] Add the `.cm-*` styles in `src/styles.css` (figures, toolbar, row, status chips, show-more, narrow window); theme variables only; reduced motion respected.
- [X] T015 [US1] View tests in `test/connections.view.test.ts`: the wait with a count, the figures, each filter and its count, search, sort, Show more, the empty and failed states, Refresh keeps scroll (the same technique as the existing scroll tests), every button disabled while the list loads (by the one rule), no emoji in the text, a row reachable and openable by keyboard, every control with an accessible name, status never by colour alone (icon and label), no horizontal page scroll at 640 pixels.

**Checkpoint**: the list works end to end read only; shippable alone.

## Phase 4: User Story 2 - See what depends on a connection (Priority: P1)

**Goal**: opening a row reads and shows the dependents, with sources and a coverage note.

**Independent Test**: quickstart 47 and 48.

- [X] T017 [P] [US2] Create `src/model/connectionDeps.ts` (pure): `mergeReport(sources)` building `ConnectionDependencyReport` (dependents without duplicates, `sources` with `ok | failed(reason) | notScanned(reason)`, `verdict` exactly: `none-found` only when no source is `failed`, `dependents` is empty, and a `notScanned` source is named in the note; `in-use` when any dependent exists; `unchecked-source` when a source failed and nothing else was found), `coverageNote(report)` (the sources that answered, the ones that failed, the not-scanned one, and the sentence that components the signed-in user cannot read may still use the connection) and `groupOf(report)` (Apps, Flows, Connection references, Agents). Tests in `test/connectionDeps.model.test.ts`, including the verdict table and that the word "unused" never appears in the note.
- [X] T018 [US2] Implement `loadConnectionDependencies(host, ctx, name)` in `src/services/connections.ts` with a shared context `ctx` (`apps`, `references` read once): apps matched by `sharedConnectionId` (case-insensitive), references by `connectionid`, flows and agents through the references with the `Scope` code of T009, and flows by name through `host.searchFlowsByConnection` (a refusal becomes `notScanned`, never `failed`; a flow whose definition cannot be read makes the flows source `failed`); each source in its own try, so one failure never hides the others. Tests in `test/connections.deps.service.test.ts` with the fake environment: a connection used by an app, a reference, two flows and an agent; a refused apps list; a refused flow search; a connection nothing uses; a flow outside a solution.
- [X] T019 [US2] Controller `openConnection(name)` in `src/controller.ts`: opening a row reads its dependencies at once and once (`depsLoading`, then loaded or failed), Check again re-reads, a loaded answer for a name that left the list is ignored; logs one line per source with counts, never names. Test in `test/controller.connections.test.ts`.
- [X] T020 [US2] Row detail in `src/views/connectionsManager.ts`: the groups with the kit's dependency list styling (`src/views/dependencies.ts` helpers), each dependent with name, state, owner, solutions and `via`; the wording **No dependency found** (never "unused"), the coverage note, a failed source named with Retry, a visible wait with the real step, and the figures updating as rows are read.
- [X] T021 [US2] View tests in `test/connections.deps.view.test.ts`: all four groups, the note text, one failed source named while the others show, a row closed and opened again reads nothing more, Check again reads again, no row says "unused".

**Checkpoint**: the manager answers "what uses this connection" for any row.

## Phase 5: User Story 3 - Find the connections nothing uses (Priority: P1)

**Goal**: Check all and Select the ones with no dependency found.

**Independent Test**: quickstart 51.

- [X] T022 [US3] Implement `checkAll(host, rows, onStep, onProgress, shouldCancel)` in `src/services/connections.ts`: first the two shared reads (apps, then references) reported as steps, then the connections 4 at a time; `shouldCancel` stops starting new ones and keeps what was read; time left from the measured rate. Tests in `test/connections.checkall.test.ts`: order of steps, concurrency never above 4, cancel keeps the done ones, a failed apps read marks every connection `unchecked-source`.
- [X] T023 [US3] Controller `checkAll()` and `cancelCheckAll()` in `src/controller.ts` with the state actions of T008; a list refresh during Check all cancels it and drops its answers. Test in `test/controller.connections.test.ts`.
- [X] T024 [US3] View in `src/views/connectionsManager.ts`: the **Check all** button with a spinner while it runs, the progress bar with "read of total" and the time left and the current step, **Cancel**, and **Select the ones with no dependency found** (disabled with a reason until at least one row is eligible); the row state **In use (N)**, **No dependency found** or **Could not be checked**; ticking by hand only for eligible rows, the other checkboxes disabled with a title saying why.
- [X] T025 [US3] View tests in `test/connections.checkall.view.test.ts`: the progress text, cancel mid-way, only eligible rows ticked by the button, an ineligible checkbox cannot be ticked, a broken connection with no dependency found is eligible, every other button disabled while it runs.

**Checkpoint**: a maker can see which connections have no dependency found in one operation.

## Phase 6: User Story 4 - Delete many connections at once (Priority: P2)

**Goal**: the guarded multiple deletion, built and tested, shipped off; Copy portal address while off.

**Independent Test**: quickstart 49 and 50 (49 decides whether the flag can ever be true).

- [X] T026 [P] [US4] Create `src/model/connectionPlan.ts` (pure): `planConnectionDeletion(rows, deps, selected)` giving `ConnectionDeletePlan` (rows with a `blocked` reason when the row is not eligible, so a plan can never contain an in-use connection as writable), the warnings (permanent; references that point at it will show it missing; the not-scanned note when present; "shared" when known) and `backupText(plan, rows)` (records without any secret and without any email: name, connector, display name, creator name, created time, status). Tests in `test/connectionPlan.test.ts`, including that a blocked row is never writable and that the backup holds no field outside the list in data-model.md.
- [X] T027 [US4] Implement `applyConnectionDeletion(host, plan, onRow)` in `src/services/connections.ts`: returns immediately with every row `skipped` ("Deleting connections is switched off.") when `features.connectionDelete` is false and never calls `host.deleteConnection`; otherwise one row at a time: re-read the dependencies (skip with the reason if one appeared), check the connection still exists (skip "already gone"), call `host.deleteConnection`, read the list back (done only when the connection is gone, else failed with the message); when the first call is refused by the route (`404` or "not found" or "not supported") the run stops and says so; a failing listener never stops the run; then the list is read again. Tests in `test/connections.delete.service.test.ts`: flag off never calls the host (the guard), flag on with a fake host (all done, one dependency appeared, one already gone, a refused route stops the run), read-back failure. The flag-on tests use a test-only override of `features` (a module mock), never the real flag.
- [X] T028 [US4] Controller in `src/controller.ts`: `openDeletion()` (only when the flag is on and eligible rows are ticked; builds the plan and a one-time code), `saveConnectionBackup()` through `host.saveFile`, `confirmDeletion()` (needs the typed code and the toggle), `closeDeletion()`; when the flag is off none of these does anything and the log says so once.
- [X] T029 [US4] Create `src/views/connectionDeletion.ts`: the dialog with three states (Preview and confirm: the change list with Exists then Deleted, the danger warning, Save backup, the code box with Copy code, the acknowledgement toggle; Apply: the progress per row with a bar; Result: the figures and the rows with the read-back message and Save report), built from the kit (`modal`, `changeList`, the code box with Copy code, the acknowledgement toggle, the backup box, the progress bar), taking from `views/removal.ts` and `views/confirm.ts` only what does not need a `Snapshot`; if a piece must be shared, move it into `src/views/shared.ts` with its test in the same task and leave the old callers working; Apply locked until the code and toggle; nothing can be left during apply; reduced motion respected.
- [X] T030 [US4] In the row detail and the toolbar of `src/views/connectionsManager.ts`: with the flag on, **Delete...** for the ticked rows; with the flag off no Delete anywhere and **Copy portal address** per row (research D-9) using `host.copyText`, with the connection's name and display name beside it and a one-line reason ("Deleting connections is switched off until the route is verified").
- [X] T031 [US4] View and flow tests in `test/connections.delete.view.test.ts` (flag mocked on): the Preview, Save backup, locked Apply, the run, the Result, the list read again; focus goes into the dialog when it opens and back to the control that opened it when it closes; and with the real flag (off): no Delete in the DOM, Copy portal address copies the documented address built from the environment id and nothing else.
- [X] T032 [P] [US4] Add the mutants of `planConnectionDeletion` and `applyConnectionDeletion` to `scripts/mutation-check.mjs` (the gate that blocks an in-use row, the flag check, the read-back) and run `npm run test:mutation` once, with the progress line every minute as the root rules ask (background run and a monitor).

**Checkpoint**: with the flag off the area is read only and provably cannot write; with the flag on the deletion is complete.

## Phase 7: User Story 5 - From a reference to its connection (Priority: P3)

**Goal**: the chip in the references table opens the connection.

**Independent Test**: quickstart 52.

- [X] T033 [US5] In `src/views/connections.ts` (`connectionChip`) and `src/views/main.ts`: when a reference has a connection the chip becomes a button that dispatches `setArea` + `connectionToggleOpen` for that name and starts the dependency read; a reference with no connection has a chip that does nothing and has a title saying why; going back returns to the same solution view with its scroll. Tests in `test/connections.link.test.ts`: the link opens the area with the row open and its dependencies read; a reference with no connection does nothing; the chip is a real button (keyboard, aria-label).

- [X] T039 [P] [US4] Test in `test/connections.readonly.test.ts` that nothing in the Connections area writes: drive the area end to end with a recording fake host (open, refresh, open rows, Check all, select, copy address) and assert that `update`, `create`, `remove`, `addToSolution`, `removeFromSolution` and `deleteConnection` are never called (FR-2412, FR-2411).

## Phase 8: Polish and cross-cutting

- [X] T034 [P] Documentation: `README.md` (the new area, what "no dependency found" means and does not mean, the deletion switch and why it is off), `CHANGELOG.md` (entries under Unreleased; the version number and the 0.2.0 heading are set at release, not here), the marketplace features list in `package.json` only if the metadata test requires it; keep the Credits section and no other tool named.
- [X] T035 [P] Mark the checks 45 to 52 in `specs/000-connection-reference-governance/quickstart.md` as a pointer to this feature's quickstart, and add the open items to the root `PENDING.md` (live checks 45 to 52; decide the flag after 49).
- [X] T036 Run `/speckit-analyze` again after the implementation and fix every inconsistency it names in spec, plan or tasks (the first run on 2026-11-11 was applied before implementing: see Analysis below).
- [X] T037 Full run before reporting: `npx tsc --noEmit`, `npm test`, `npm run validate`, and `npm run build`; report the counts and say the build is ready to reload. Do not run the mutation check again unless the planner changed after T032.
- [X] T038 Tick the requirement checklist `specs/024-connections-manager/checklists/requirements.md` and add the live checks as open items there (they are the author's to run).

## Dependencies and execution order

- Phase 1 first. T001 before any code is merged; T002 and T003 are independent of each other.
- Phase 2 blocks all stories: T004 first; T005, T006 in parallel after it; T007 after T002 and T004; T008 after T004 and T006; T009 anywhere in the phase (touches only `services/dependencies.ts` and its callers); T010 after T008.
- Stories: US1 (T011 to T015) needs Phase 2. US2 needs US1 (the row to open). US3 needs US2 (the reads). US4 needs US3 (the eligibility) and T002 and T007. US5 needs US2 only.
- Within a story: model, then service, then controller, then view, then view tests; `[P]` tasks in a story touch other files and can run beside the neighbour.
- Phase 8 last; T036 before T037.

## Parallel opportunities

- T002 and T003 (Phase 1).
- T005 and T006 (Phase 2, after T004).
- T014 (styles) beside T013 (view).
- T017 (model) beside T011 and T012 of US1.
- T026 (plan) beside T022 to T025.
- T032 (mutation) beside T031.
- T034 and T035 (Phase 8).

## Implementation strategy

1. **MVP = Phase 1 + Phase 2 + US1**: a read-only list of every connection with figures, filters and the broken ones in two clicks. Build and hand it over for check 45 and 46.
2. **Then US2 and US3**: the dependencies and Check all (checks 47, 48, 51). This is the real value and is still read only.
3. **Then US4**, switched off, with Copy portal address; the author runs check 49 on a test connection. Only a later, separate commit may turn the flag on, and only with the live check recorded in research.md (the guard test enforces it).
4. **US5** last.
5. Commit by phase, in separate commits through `/custom-commit`; the build after each phase.

## Task count

38 tasks (T016 was removed after the analysis and T039 added): Setup 3, Foundational 7, US1 5, US2 5, US3 4, US4 8, US5 1, Polish 5.

## Analysis (2026-11-11, applied before implementing)

Findings of `/speckit-analyze` and what was done: D1 (T7 and the backup: no email, constitution amended in T001), D2 (richer fields read defensively, T001 and T005), F1 and F3 (one verdict rule: a failed source blocks, a not-scanned one is named; a flow that cannot be read is a failed source), F2 (the user's visible connections, stated in the spec), U1 (`shared` removed from the model), U2 (the pieces of the dialog are named in T029), A1 to A3 (four at a time, 640 pixels, 100 rows at a time, now in the spec), G1 (T039), G2 (accessibility assertions in T015 and T031), T1 to T3 (T016 removed, T036 reworded, the plan's method count, the version at release).
