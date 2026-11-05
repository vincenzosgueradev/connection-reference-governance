# Changelog

All notable changes are listed here, newest first. Format: Keep a Changelog; versions follow SemVer.

## [0.1.0] - 2026-11-04

### Added

- The choices of a change are made in a studio dialog that can fill the window; the choose screen keeps only a slim selection bar of fixed width with one button, so the table keeps its room and nothing jumps.
- A shorter path: Review changes opens the exact Preview at once (Choose, Preview, Apply, Result); the separate Review step, which repeated the same list, is gone, and the Preview says why when no row can be written.
- With your permission (off by default) the tool turns flows that are on off for the change and on again afterwards: a block in the studio, a warning that lists what it means and the flows, a second acknowledgement, a run with six phases, every flow turned off is turned on again even when its write fails, a flow left off is named in the result and in the report.
- The studio of a re-point goes through the connectors one at a time: a pipeline on top (a step per connector, then a summary), Next and Back, a slide between steps, with Back and Next in the bottom bar and the figures always underneath.
- Re-point by category: the references to replace are grouped by connector, each category with its own colour, share bar and percentages; tick one, some or all per category, choose a new reference for each, and every category is changed in one operation, one write per flow.
- A flow that already uses the new reference (chosen among the ones to replace) is shown as "Already uses the new reference: nothing to change", not as an error.
- Re-point several references to one in a single operation: tick every reference to replace (one connector), choose the one to use instead (it may be one of them), and each flow holding any of them is rewritten once.
- See which connection references each flow of a solution uses, and group by reference.
- Flags for references with no connection and for flows that declare a missing reference.
- Bulk change of the connection of references, and bulk re-point of flows to another reference, each with a preview and a result per row.
- Each connection reference of a flow is shown as a block with a connector glyph, then the official connector name, the reference name, its logical name and the connection in full, one under the other; custom connectors are marked; the attention column appears only when something needs attention.
- Flows show their type (instant, automated, scheduled), and every flow and connection reference opens a details panel with key-value pairs and a table of its connections or of the flows that use it; the layout uses the full width and adapts to narrow panes; the view keeps its scroll position.
- Icons everywhere they help: a glyph for each flow type (instant, automated, scheduled), state, connection and warning chip, every detail label and block title, buttons and empty states; connector tiles are tinted by kind of service.
- A change now runs as Choose, Review, Preview, Apply and Result with a stepper and a breadcrumb; the Preview shows exactly what will be stored as a line diff (split or unified) or a table; the Apply step shows a timeline with the elapsed time and each row as it finishes; the Result states what happened in a banner, figures and rows, and can save a report.
- Re-pointing offers only compatible choices: the new reference is disabled until a reference to replace is chosen and lists only other references of the same connector in the solution; a connection choice is disabled for references of different connectors.
- Every write is confirmed in a dialog over the screen with the environment, figures, before-and-after rows, warnings, backup and an acknowledgement; Apply stays disabled until it is ticked.
- Bulk actions sit in one framed block with labelled fields and a count that never changes width; connections are chosen from a list or pasted, with no browser suggestion pop-up.
- Typing in a field keeps the cursor.
- Home screen with the environment name in the header, the number of solutions and flows, a sortable solution table with the flows of each solution, search with a clear button and an Updating indicator.
- Managed solutions are not offered (a disabled Managed tab shows their count).
- Save a backup of the old values from the preview.
- Safety checks: rows changed by someone else since the preview are skipped, every write is read back, mixed connectors are blocked, and the preview warns about flows turned on and references owned by someone else.
