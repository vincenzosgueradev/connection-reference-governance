# Feature Specification: Clean up: unused references and duplicates

**Feature Branch**: `022-cleanup`

**Created**: 2026-11-07

**Status**: Implemented

**Part of**: [Product overview](../000-connection-reference-governance/spec.md)

**Input**: Idea from the author: a complete, well made function to remove or delete the connection references that nobody uses, and the duplicates ("doppioni"), from the open solution.

## Definitions

- **Unused**: a connection reference that is a member of the open unmanaged solution and that no flow of this solution uses (every flow whose definition could be read is looked at). It may still be used by something the tool cannot see: flows of other solutions, Copilot Studio agents. Remove keeps the row; Delete asks the environment what depends on it (feature 019) and refuses when something does.
- **Duplicates**: member references of the same connector (and the same custom connector) that hold the **same connection** (a non-empty connection id, compared without regard to capitals). They are interchangeable: one of them, the **keeper**, is enough. Same connector with different connections are different accounts and are not duplicates; references with no connection are not compared.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See what can be cleaned, in one place (P1)

In the Connection references view a **Clean up...** button (with the number of things to clean) opens a dialog with the figures (unused, duplicate groups, flows to re-point) and two tabs, **Unused** and **Duplicates**. An environment with nothing to clean says so, with a check.

### User Story 2 - Remove or delete the unused references (P1)

The Unused tab lists every unused reference (connector, name, logical name, connection or "No connection", owner, and a tag: "Never connected" or "Duplicate of ..."), each with a check; Select all and Clear; a count. **Remove from solution...** and **Delete...** go to the existing dialogs of features 016 and 019 with the ticked references: nothing new is written by the dialog itself, and every protection of those dialogs applies (preview, dependency check, code to unlock Delete, backup, read back).

**Acceptance**: managed references are listed but cannot be ticked, with the reason; when flows could not be read the dialog warns that they might use a reference.

### User Story 3 - Merge duplicates (P1)

The Duplicates tab shows one card per group: the connector, the shared connection, and the member references, each with how many flows use it and a radio to choose the **keeper** (the one most used is suggested, then by name). The card says what a merge does: "N flows will be re-pointed to <keeper>; then M duplicates become unused". **Merge into <keeper>...** starts the re-point of feature 004/013 with those flows and that reference already chosen, and opens its Preview: nothing is written before it is confirmed there. When it has finished, the Result offers **Clean up the duplicates**, which opens the Unused tab with the duplicates already ticked, to be removed or deleted with their own preview and confirmation. When the duplicates have no flows (already unused), the card offers to go straight to the Unused tab.

**Why two steps**: constitution T2: a single confirmation never covers two operations. Re-pointing flows and taking references away are separate, each previewed and confirmed.

### User Story 4 - Nothing stale (P2)

The dialog is drawn from the solution as last read; after any write the solution is read again, so a reference that has just stopped being used appears in Unused. Ticks on references that are no longer unused are dropped; a keeper that no longer exists is replaced by the suggestion. The dialog closes when the solution is managed, a change is previewed or the view changes.

## Requirements *(mandatory)*

- **FR-2201**: A reference is unused only when no flow of the solution whose definition could be read uses it; managed references are never offered for removal.
- **FR-2202**: Duplicates are groups of two or more member references with the same connector, custom connector and non-empty connection id.
- **FR-2203**: The keeper of a group defaults to the member used by most flows, then the first by logical name, and can be changed; a merge re-points the flows that use any other member to the keeper and to nothing else.
- **FR-2204**: Cleaning up writes only through the existing remove, delete and re-point operations; it never removes a reference that a flow that stays still uses (feature 016), and a merge and a removal are never confirmed together (T2).
- **FR-2205**: After a merge the duplicates are offered for removal only if they are unused in the solution as read again.

## Edge cases

- Two groups of the same connector (two different connections) are merged one at a time (a re-point has one group per connector).
- A flow that uses both a duplicate and the keeper is rewritten once and shown as already using the keeper where that applies (feature 009).
- A flow that is on needs the permission to be turned off, asked in the confirmation of the re-point as usual (feature 011); a flow that failed to re-point keeps its duplicate in use, so that duplicate is not offered for removal.
- A keeper that is managed is allowed (it is only the target); a duplicate that is managed is re-pointed away from but cannot be removed.

## Implementation map

- src/model/cleanup.ts (unused, duplicate groups, keeper, merge input, figures, pruning), src/state/reducer.ts (`cleanup`, `cleanupFollowUp`), src/controller.ts, src/views/cleanup.ts, src/views/main.ts (button and dialog), src/views/result.ts (follow-up button), src/styles.css.

## Verification

- test/cleanup.model.test.ts, test/reducer.cleanup.test.ts, test/cleanup.view.test.ts (includes a merge from start to removal over the in-memory environment); manual check 43 in [the quickstart](../000-connection-reference-governance/quickstart.md).

## Amendment 2026-11-07 (unused is verified in the whole environment)

The author: the dependencies must be seen outside the solution too. "Unused" stays "no flow of this solution uses it", but it is no longer taken on trust:

1. The Unused tab has **Check dependencies**, which reads the dependencies of every unused reference in the whole environment (feature 023). Each row then says **Nothing depends on it** or **Used by N outside this solution** (with the list on demand); **Select the ones nobody uses** ticks only the references with no dependent anywhere.
2. On the Duplicates tab each member gets the same chip after a check, so the keeper can be chosen knowing what else uses each reference. A duplicate used by components outside the solution can still be merged (the flows of the solution are re-pointed) and removed from the solution; Delete will refuse it, naming the blockers.
3. Nothing is decided by the check: Remove, Delete and merge keep their rules.

FR-2206: Unused references MUST be checkable against the whole environment, and the result MUST be shown per row.

## Amendment 2026-11-07 (hand test: the list could not be scrolled)

Found by hand: with many unused references the list was cut at the bottom of the dialog and had no scrollbar. The dialog takes the studio's fixed frame, whose body does not scroll, and the content had no scroll of its own. FR-2207: in the dialog the figures and the tabs stay in place and everything under them scrolls inside the dialog, with a visible scrollbar, whatever the number of rows.

## Amendment 2026-11-07 (hand test: one toolbar, check what is ticked, a summary that can be closed)

Found by hand: (1) with one reference ticked, Check dependencies still read all of them; (2) the buttons were on three different lines; (3) the green summary after a check never went away and could not be closed.

1. **Check dependencies works on what is ticked**: with some references ticked it reads only those; with none ticked it reads all of them. The button says which ("Check dependencies (1 ticked)", "Check dependencies (all 7)", "Check again (1)").
2. **One toolbar, one line**: Check dependencies and Select the ones nobody uses on the left; the count, Select all and Clear on the right (they wrap on a narrow window).
3. **The wait is in the button**: a spinner and the real progress ("Checking... 3 of 7"); the rows being read say Checking... and the button never disables itself while reading (T8).
4. **The summary is one line and can be closed**: "Checked 3: nothing depends on them in any solution, agent or app" (or how many are still used), over only what was checked, with a close button; it comes back when a new check is made.
5. The explanatory note above the list is shorter.

FR-2208: Check dependencies MUST act on the ticked references when there are any, else on all; the summary MUST be about what was checked and MUST be dismissable.

Second cause, found by hand after the first fix: inside the scrolling content the list (which has `overflow: hidden` for its rounded corners) was a shrinkable flex item, so it shrank and clipped its own rows instead of the content scrolling. FR-2207 now also requires that no block of the content shrinks: the content overflows and scrolls.

## Amendment 2026-11-07 (the global rule: buttons off while an action runs)

The author: while an action is running, disable all the buttons, as a global rule. It replaces the choice, made earlier in this feature and in 021, to keep the control that started the work enabled. While a check, a read, a write or a creation runs, every button of the tool is disabled by one rule applied after each draw; the control that is working keeps its normal look with its spinner. The focus problem that choice avoided is solved on its own: the focus goes to a dialog only when it opens, without scrolling, and the scroll of the list is kept across redraws (the list of Clean up keeps its place on a click; another tab opens at the top).

FR-2209: While an action is running every button MUST be disabled and none MUST be disabled by a view for this reason. FR-2210: A redraw MUST keep the scroll of the list of Clean up within the same tab.

## Amendment 2026-11-07 (hand test: Delete took me to another screen)

Found by hand: Remove from solution... and Delete... closed the clean up dialog and opened their confirmation over the plain list; cancelling left the user on the list, with the references still selected behind, and the place in the clean up was lost.

1. **The confirmation opens over the clean up dialog**, which stays behind it with its ticks, its tab, its checks and its scroll. **Cancel** (or Escape, or the close button) of the confirmation returns to the clean up exactly as it was.
2. **After the write** the Result is shown as usual; **Back to solution** opens the clean up again, on the Unused tab, read again (the rows just removed or deleted are gone, a reference that just became unused is there).
3. The references selected in the list behind are cleared when the user comes back, so nothing stays selected without a reason.
4. A merge is unchanged: it starts the re-point and the Result offers the second step (a merge is two operations, T2).

FR-2211: Remove and Delete started from Clean up MUST open over it, return to it when cancelled and open it again after their Result.

Found by hand after the stacking: with a confirmation over the clean up dialog, every click made the confirmation flash (its opening animation played again). A redraw told only the first dialog to stay still. FR-2212: a redraw MUST NOT replay the opening of any dialog that was already open; only a dialog that has just opened animates.

## Amendment 2026-11-11 (merge button in the fixed bar)

When the Duplicates tab holds one group, its merge button (Merge into <keeper>... or Review as unused...) is in the fixed bar of the dialog next to Close, so it never scrolls out of sight; with several groups every card keeps its own button, since a bar button could not say which group it acts on. Requested by the author after the live test (2026-11-11).

## Amendment 2026-11-11 (the duplicate tag follows the chosen keeper)

In the Unused tab the tag "Duplicate of <name>" names the keeper the user chose in the Duplicates tab (the suggested one when none was chosen), and the chosen keeper itself carries no such tag. Seen in the live test: the tag kept naming the suggested reference after another had been chosen.
