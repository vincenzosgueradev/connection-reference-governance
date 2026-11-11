# Feature Specification: Dependencies of a reference in the whole environment

**Feature Branch**: `023-dependencies`

**Created**: 2026-11-07

**Status**: Implemented

**Part of**: [Product overview](../000-connection-reference-governance/spec.md)

**Input**: The author: a connection (reference) must give **all** its dependencies, also those **outside the solution**; seeing only the solution is of little use. Update the specification and make it better.

## Why

Until now "used by" meant "used by a flow of the open solution". A reference can be used by flows of other solutions, by Copilot Studio agents, by apps and by other components. Removing, deleting or merging it on the strength of the solution alone can break what the tool cannot see. The environment already tracks these dependencies; the tool did not show them.

## Research (Microsoft Learn, 2026-11-07)

- **Dependency tracking** is a feature of Dataverse for every solution component, environment-wide. Three functions: `RetrieveDependentComponents` (everything that **uses** a component: "Used by"), `RetrieveDependenciesForDelete` (what **blocks** its deletion) and `RetrieveRequiredComponents` (what it uses). The maker portal's **Show dependencies** shows them as *Delete blocked by*, *Used by* and *Uses*, **grouped by solution**. Each record (table `dependency`) carries `dependentcomponentobjectid` and `dependentcomponenttype`.
- **Component types**: the `componenttype` choice; some codes are fixed (29 workflow, 300 canvas app, 371/372 connector, 380/381 environment variable) and the others (connection reference, agents) are read from `solutioncomponentdefinitions`, never guessed (constitution T5).
- **Agents**: Copilot Studio agents use references through documented relationships: `bot.providerconnectionreferenceid` (`bot_connectionreference`) and the many-to-many `botcomponent_connectionreference`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See everything that depends on a reference (P1)

In the details of a reference (click its row) the block **Dependencies in the whole environment** has a button **Check dependencies**. It reads and shows every component that depends on it, grouped as **Flows**, **Agents**, **Apps** and **Other**, each with its name, state (flows: On, Off, Suspended), whether it is managed, its owner, and the **solutions it belongs to**; a component that is **not in the open solution** is marked **Outside this solution**. The block opens with a summary: "7 components depend on it: 3 in this solution, 4 outside", or "Nothing depends on it anywhere in the environment" with a check.

**Acceptance**: the action is explicit (nothing is read until the button is pressed); while it reads there is a spinner and a line saying what is read (T8); a failure says why and offers to try again; a result is kept until the solution is read again.

### User Story 2 - The same for a connection (P1)

In the new-reference panel the expanded **Used by** of a connection lists every reference of the environment that holds it; each reference has its own dependencies block, and the connection has **Check every dependency of this connection**, which reads all of them (a few at a time) and shows the total ("12 components depend on this connection's references, 5 outside this solution").

### User Story 3 - Clean up knows what is outside (P1)

In Clean up, **Check dependencies** on the Unused tab reads the dependencies of every unused reference: each row shows **Nothing depends on it** (green) or **Used by N outside this solution** (amber, with the list on demand). **Select the ones nobody uses** ticks only the references with no dependent anywhere. On the Duplicates tab each member shows the same chip after a check, so the keeper can be chosen knowing what else uses each one.

### User Story 4 - Delete says who blocks it, by name (P2)

When Delete is blocked because components outside the selection depend on a reference (feature 019), the dialog names them: "Flow Order sync (cloud flow, in Sales, Shared), Agent Help desk", instead of "a component of type 10042".

## Requirements *(mandatory)*

- **FR-2301**: The dependencies of a reference are read from the environment with `RetrieveDependentComponents` (all dependents, in any solution), never inferred from the open solution; the type of the reference is the one stored for it (T5).
- **FR-2302**: Every dependent is named, typed and located: name, kind (flow, agent, app, other), state and managed flag where the table gives them, owner, and the solutions that hold it; a dependent that is not a member of the open solution is marked **Outside this solution**.
- **FR-2303**: Agents are added from their documented relationships to the reference (`bot.providerconnectionreferenceid`, `botcomponent_connectionreference`); a source that cannot be read is named in a note and never hides the others.
- **FR-2304**: Reading dependencies is explicit, read only, a few references at a time, shown with a visible wait, and its result is dropped when the solution is read again.
- **FR-2305**: The report says where it comes from (Dataverse dependency tracking, the same source as Show dependencies) and what it cannot see (components whose dependency is not tracked).
- **FR-2306**: A blocked Delete names the components that block it (name, kind and solutions) when they can be read, and falls back to the type when not.
- **FR-2307**: The dependencies never change a decision by themselves: Remove, Delete and merge keep their own rules (T2b, T2d); the dependencies inform and make Select the ones nobody uses possible.

## Edge cases

- A dependent that is the reference itself, or a sub-component of it, is left out.
- A component of a type the tool cannot name is shown with the name of its type (from `solutioncomponentdefinitions`) or "Component of type N".
- A component in the Default solution only is shown with no solution name and counts as outside the open solution.
- Thousands of dependents: the list is grouped and each group shows the first ones with "and N more" (open to see all).
- The environment refuses the function (privilege): the block says so; Delete's own check (feature 019) keeps refusing what it cannot check.

## Implementation map

- src/model/dependencies.ts (kinds, labels, grouping, summary), src/services/dependencies.ts (read, resolve, solutions, agents, labels), src/host.ts (`dependents`), src/state/reducer.ts (`dependencies`), src/controller.ts, src/views/dependencies.ts (the block), src/views/detail.ts, src/views/newReference.ts, src/views/cleanup.ts, src/model/removal.ts (names of blockers).

## Verification

- test/dependencies.model.test.ts, test/dependencies.service.test.ts, test/reducer.dependencies.test.ts, test/dependencies.view.test.ts; manual check 44 in [the quickstart](../000-connection-reference-governance/quickstart.md).

## Amendment 2026-11-07 (check what is ticked)

In Clean up the check works on the ticked references when there are any, else on all (see the amendment of feature 022). The block and the rest of the feature are unchanged.

## Amendment 2026-11-11 (Used by reads the whole environment)

**FR-2308**: Opening a row of the Connection references table (chevron, click on the row, or the Used by button) starts the check of the whole environment for that reference at once, with nothing to press, unless it was already read or is being read; a failed read is tried again; closing and opening again reads nothing. In the table the Used by cell is a button that does the same. The click does not toggle the row a second time. The button explains in its title that it reads the whole environment, not only this solution. Check dependencies in the details stays, for a retry (Check again). Requested by the author after the live test (2026-11-11).
