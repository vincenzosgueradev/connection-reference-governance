# Requirements checklist: 022

- [x] FR-2201..2205 each have a test (model, reducer and app level)
- [x] Cleaning up writes only through remove, delete and re-point; a merge and a removal are never one confirmation (T2)
- [x] Managed references cannot be ticked; unreadable flows produce a warning
- [x] Stale ticks and keepers are dropped after the solution is read again
- [x] No emoji; the kit's icons; the visible-wait rule (T8) respected: the writes themselves are the existing dialogs
- [x] No other tool is named (independence)
- [ ] Live check in a real environment (quickstart 43)
- [x] FR-2207 the content of the dialog scrolls by itself with a visible bar (guard on the stylesheet and on the structure)
- [x] FR-2208 tested: the check acts on the ticked, the toolbar is one row, the summary is about what was checked, can be closed and comes back after a new check
- [x] FR-2209/2210 tested: every button is disabled while an action runs (checks, reads, creation), none by a view on its own; the list keeps its scroll across redraws
- [x] FR-2211 tested: the confirmation opens over the clean up, cancelling returns to it with its ticks, and after the result it opens again
