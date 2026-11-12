# Implementation Plan: Connections manager (environment level)

**Branch**: `024-connections-manager` | **Date**: 2026-11-11 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/024-connections-manager/spec.md`

## Summary

A second area of the tool, **Connections**, beside the solutions list: every connection of the environment in a rich list, the dependencies of each read when its row opens (apps, flows, connection references, agents), a "Check all" that finds the connections nothing was found for, and a guided multiple deletion. Read only first; the deletion is built and tested but behind a flag that ships OFF until a live test proves the route (OP-1). Approach: a new state slice and a new pure model for connections, a new service for reading and for the deletion, four new `Host` methods and a paged `listConnections` (the only door), a new view pair, and a refactor of the dependency service so it no longer needs an open solution. The wizard of the solution views is not reused: the deletion dialog hosts Preview, Apply and Result in one dialog (as feature 012 does for the others) and is built from the same kit pieces.

## Technical Context

**Language/Version**: TypeScript (strict), as the tool; no new dependency

**Primary Dependencies**: the shared UI kit (`src/ui`), the PPTB types (`powerplatformAPI`, `dataverseAPI`, `toolboxAPI`)

**Storage**: none; session state only; the backup is a file the user saves through the host

**Testing**: vitest (unit, jsdom views, fake host in `test/helpers`), `npm run test:mutation` extended to the new planner

**Target Platform**: Power Platform ToolBox (Electron webview), dark and light themes

**Project Type**: single-page tool

**Performance Goals**: the list is usable once the first page is in; 1000 connections render in pages of 100 with "Show more"; Check all reads a few connections at a time (4), with real progress

**Constraints**: every wait visible; every button disabled while an action runs (one rule, `state/running.ts`); no write except the guarded deletion; `host.ts` is the only door; errors are values

**Scale/Scope**: tens to low thousands of connections per environment; one environment at a time

## Constitution Check

Gates from the tool constitution 1.8.2 and the root principles it inherits:

| Gate | Status | Note |
|---|---|---|
| T1 scope (open solution only; Dataverse; the connections list read only for T2c) | **Amendment needed** | New rule T11 and version 1.9.0 (first task): environment-level connections, new door `powerplatformAPI.PowerApps` read only, deletion flag |
| T3 / T4b plan, preview, confirm, apply; check before, read back after | Pass | `planConnectionDeletion` is pure; each row re-checked and read back |
| T5 verified metadata only | Pass | Only fields documented on Learn are read; the deletion route is NOT assumed (OP-1) |
| T7 privacy | Pass | Names, ids, emails on screen only; the backup holds records and no secret; fixtures synthetic |
| T8 UI waits and the disabled rule | Pass | Spinner, real steps, progress bar for Check all and Apply; `state/running.ts` extended, not bypassed |
| Principle VII re-read on entry | Pass | Entering Connections reads the list anew; Refresh keeps scroll, filter, open rows |
| Independence | Pass | No other tool is named |
| Plan/apply split, `types -> services -> host -> app` | Pass | See Project Structure |

Re-check after design: the only open gate is the constitution amendment, which is the first task.

## Project Structure

### Documentation (this feature)

```text
specs/024-connections-manager/
├── spec.md
├── plan.md              # this file
├── research.md          # decisions, alternatives, candidate routes
├── data-model.md        # entities and state
├── quickstart.md        # live checks 45 to 52
├── contracts/
│   ├── host.md          # the new Host methods and the requests they send
│   └── state.md         # the new actions and what each does
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code

```text
src/
├── features.ts                      # NEW: declared flags; connectionDelete = false
├── host.ts                          # + listApps, + deleteConnection (guarded), listConnections pages
├── types.ts                         # + ConnectionRow (rich), ConnectionDependent
├── model/
│   ├── connections.ts               # NEW: status, figures, filters, sort, eligibility (pure)
│   ├── connectionDeps.ts            # NEW: dependent sources, merge, verdict, coverage note (pure)
│   ├── connectionPlan.ts            # NEW: planConnectionDeletion, backup text (pure)
│   ├── apps.ts                      # NEW: the apps list reduced to which app uses which connection (pure)
│   └── liveConnections.ts           # richer parse (statuses, creator, modified); old fields kept
├── services/
│   ├── connections.ts               # NEW: loadConnections (paged), loadConnectionDependencies, applyConnectionDeletion
│   └── dependencies.ts              # refactor: Scope instead of Snapshot (no behaviour change)
├── state/
│   ├── reducer.ts                   # + area, + the connections slice
│   ├── connectionsState.ts          # NEW: the slice and its actions (cm...)
│   └── running.ts                   # + the connections reads and the deletion count as running
├── controller.ts                    # + `connections` (the controller of the area)
├── controllerConnections.ts         # NEW: open, refresh, rows, Check all, copy address, the deletion flow
└── views/
    ├── connectionsManager.ts        # NEW: figures, toolbar, list, row detail, empty and failed states
    ├── connectionDeletion.ts        # NEW: the dialog (Preview, Apply, Result in one)
    ├── connectionsHandlers.ts       # NEW: what the area asks of the controller
    └── main.ts                      # + the area switch on the home screen, + the chip link
test/                                # one file per new module, plus helpers in scenario.ts
```

**Structure Decision**: the connections area has its own state slice and its own view pair instead of squeezing connections into `Snapshot`, which is a solution's data. What is shared is shared on purpose: `RowOutcome`, the kit's modal, progress, chips and tables, `state/running.ts`, the dependency naming code (behind a `Scope`), and the log.

## Design decisions in brief (details in research.md)

1. **One slice, one area switch.** `State.area: 'solutions' | 'connections'`; `State.connections: ConnectionsState | null`. Leaving the area drops nothing the user cannot read again.
2. **Status** comes from the statuses the list reports; an unknown shape is shown as "Unknown", never as Connected.
3. **Dependency sources** are four independent readers merged into one report; a failed reader is named and blocks selection. Apps: one environment-wide read shared by every connection of a Check all. References: one environment-wide read of `connectionreferences`. Flows and agents: through the references (the code of feature 023, behind a `Scope`) and, when the environment allows it, by connection name in `clientdata` (OP-2).
4. **Eligibility is pure**: `canSelect(row, state)` is true only for a connection whose dependencies were read, every source answered, and nothing was found.
5. **Deletion** is `planConnectionDeletion` (pure), `applyConnectionDeletion` (one row at a time: re-check, call, read the list back), and the dialog, all behind `features.connectionDelete`. While the flag is off, `deleteConnection` is never called and a test proves it.
6. **Route**: the delete request is built in one function so the live test changes one line; candidates are in research.md.
7. **Constitution** gets T11 and version 1.9.0 in the first task.

## Complexity Tracking

| Item | Why it is needed |
|---|---|
| A refactor of `services/dependencies.ts` | The dependency naming code takes a `Snapshot`; the connections area has none. `Scope` (member ids, known names) is the minimum shared interface; every existing test stays green |
| A flag with a guard test | The deletion route is unverified; the test fails if the flag is on while research.md records no passed live check |
