# Tasks: Clean up

- [x] T1 Constitution 1.7.0 (T2d) and spec, plan, checklist
- [x] T2 model/cleanup.ts: unused, duplicate groups, keeper, merge input, figures, pruning; test/cleanup.model.test.ts
- [x] T3 State and reducer: `cleanup`, `cleanupFollowUp`, actions, pruning of stale choices; test/reducer.cleanup.test.ts
- [x] T4 Controller: open, remove and delete from the ticked ids, start a merge, follow-up
- [x] T5 views/cleanup.ts: figures, tabs, unused list, duplicate cards, keeper radios, footer actions, empty states
- [x] T6 Wire: button in the references view, dialog, follow-up button in the Result
- [x] T7 Styles; test/cleanup.view.test.ts including a full merge to removal
- [x] T8 README, CHANGELOG, quickstart 43, analysis, build
- [x] T9 Bug: the unused list was cut and could not be scrolled (the studio frame hides the body overflow): the content scrolls by itself, figures and tabs stay; guard test
- [x] T10 Check dependencies on the ticked (else all); one toolbar line; progress in the button; a one-line summary over what was checked, dismissable
- [x] T11 Second cause of the missing scroll: the list shrank inside the content (flex item with overflow hidden); the blocks of the content no longer shrink; guard test
- [x] T12 Global rule: `state/running.ts` and one lock after each draw in views/main.ts; the working control keeps its look; the list of Clean up keeps its scroll; autofocus without scrolling; tests
- [x] T13 Remove and Delete open over the clean up dialog (stacked), Cancel returns to it, the Result's Back to solution reopens it; the topmost dialog gets the focus and keeps its scroll
- [x] T14 Bug: the stacked confirmation flashed on every interaction (only the first dialog was kept still on a redraw): every dialog already open keeps still; test
