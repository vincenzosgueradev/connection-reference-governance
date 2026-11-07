# Tasks: The dialog of Remove and Delete

- [x] T1 Controller: previewRemove and previewDelete open the dialog over the list
- [x] T2 Dialog `views/removal.ts`: lead line, rows with reasons, copy offer, code gate (Delete only), acknowledgement
- [x] T3 State: `confirmCode`, `typedCode`; `applyStarted` refuses a Delete without the code
- [x] T4 Host and service: `dependencies`, read before planning and again before each delete
- [x] T5 Planner: a row with outside dependencies or an unreadable check is blocked
- [x] T6 Amendment: dialog reduced to what the function needs
- [x] T7 Tests: test/removal.test.ts; quickstart 39
