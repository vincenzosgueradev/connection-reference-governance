# Quickstart: live checks of feature 024 (checks 45 to 52)

Run in a test environment, with a few harmless test connections and, for 49 and 50, connections made only for this. Automated tests run with `npm test`; these are the checks that need a real environment and are numbered after the checks of the earlier features in `specs/000-connection-reference-governance/quickstart.md`.

**Prerequisites**: the tool built (`npm run build`) and loaded in the toolbox, an environment with at least one app, one cloud flow in a solution, one cloud flow outside any solution, and one connection reference that holds a connection; one broken connection (sign out of its account or let it expire); two test connections that nothing uses.

## 45. The list matches the portal (US1, FR-2401 to FR-2403)

1. Open the tool, choose **Connections** on the home screen.
2. A wait with a spinner and a count shows while the list is read; the figures appear at the end.
3. Compare the list with the Maker portal's connections page: same connections, same display names, the same ones broken.
4. Note, in `research.md` D-1 and D-5, which fields the answer carried (statuses, creator, modified time) and the exact words of a broken status, then pin them in the model test.
5. Press Refresh: the list is read again, the scroll position, filter and search stay.

## 46. Filters, search and sort (FR-2403)

Choose Broken: only the broken one remains, the figure says 1. Search for part of a display name; sort by last modified, then by connector. Choose a connector filter.

## 47. Dependencies of a used connection (US2, FR-2404, FR-2405)

1. Open the row of the connection that your known flow, reference and app use.
2. Without pressing anything the dependencies are read; the flow of the solution, the reference, the app and, if any, the agent appear in their groups, each with state, owner and solutions.
3. In the log dock: one line per source, none in error. If the apps source is refused, note the reason here (a non-administrator is expected to be refused).
4. Close and open the row again: nothing is read again. Check again re-reads.

## 47b. Compare with the portal's "Flows using this connection"

Open a connection whose portal page lists flows. In the tool open the same connection and read the note at the bottom of its details: it says how many apps and connection references were read and how many of them hold the connection. Write down: the flows the portal lists, the flows the tool lists, and the numbers of the note. A difference is expected where the flow service keeps a binding that Dataverse does not show (research D-3b); record each case there.

## 48. The flow outside a solution (OP-2)

Open the connection that the flow outside any solution uses. If the flow appears, record in `research.md` D-3 that the search by name works. If the environment refuses the search, the flows source says "not scanned" in the coverage note; record that, and the note text.

## 49. The deletion route (OP-1), on a test connection only

With `features.connectionDelete` still false the tool does not delete anything: confirm that no Delete exists and that **Copy portal address** copies an address that opens the connections page of the environment. Then, on a branch and only after the author agrees, set the flag, rebuild, and try candidate 1 of `research.md` D-4 on ONE test connection. Record the outcome (accepted and gone, refused with this message, route not found) in `research.md` D-4 under "Live check record". If candidate 1 fails, try candidate 2. If none works, the flag stays false and the area ships read only.

## 50. Deleting several (US4, FR-2409, FR-2410), only if 49 passed

1. Open Check all; wait for the progress bar to finish; the two unused test connections show No dependency found.
2. Select the ones with no dependency found; only the eligible rows are ticked.
3. Delete...: the Preview lists them; Save backup writes a file with the records and no secret; type the code, turn the toggle on; Apply.
4. The Result says Deleted and read back for each; the connections are gone from the portal.
5. Repeat with a connection that gained a dependency after Check all: its row is skipped with the reason.

## 51. Check all and cancel (US3, FR-2407, FR-2408)

Start Check all, cancel half way: what was read is kept, nothing is ticked, the figures count only the checked ones. Run it to the end: the figures match; a connection whose source failed shows Could not be checked and cannot be ticked.

## 52. From a reference to its connection (US5, FR-2416)

In a solution's Connection references table click a connection chip: Connections opens with that connection open and its dependencies read. A reference with no connection has a chip that does nothing and says why.
