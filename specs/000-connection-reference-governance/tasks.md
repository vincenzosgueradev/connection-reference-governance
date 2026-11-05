# Product tasks

The tasks of each function are in its own folder (`../001-*` to `../008-*`). This file keeps the product-level tasks that belong to no single feature.

# Tasks: Flow Connection Governance

- [x] T001 types.ts data contracts
- [x] T002 model/clientdata.ts + test (round-trip oracle, negatives)
- [x] T003 model/analysis.ts + test (flags matrix, grouping, consistency between views)
- [x] T004 model/plans.ts + test (connection change, re-point, all blocks)
- [x] T005 host.ts Host (query/update/notify) + test fake
- [x] T006 services/dataverse.ts + test (loading, chunking, apply with partial failure)
- [x] T007 state/reducer.ts rewrite + test
- [x] T008 views (toolbar, flows table, references table, preview, results) + jsdom test
- [x] T009 icon logo.svg / logo-color.svg, styles
- [x] T010 README, CHANGELOG, quickstart (manual checks)
- [x] T011 gates: tsc, npm test, build, audit (done 2026-11-04: 145 tests, 0 vulnerabilities)
- [ ] T012 manual checks in quickstart.md (needs a real environment)
- [x] T013 mutation check: npm run test:mutation, 24 of 24 mutants killed

- [x] T014 (defect, test first) re-point: "With" disabled until "Replace" is chosen, only same-connector references offered, incompatible target cleared; connection choice disabled for mixed connectors
- [x] T015 model/repoint.ts (sources with counts, compatible targets) + reducer guard + tests
- [x] T016 kit: modal helper (overlay, focus trap, Escape, tones, figure tiles, change rows, callouts) + tests; template and copy
- [x] T017 confirmation modal for both operations, acknowledgement and backup state in the store, tests
- [x] T018 docs: spec stories 5 and 6, FR-019, FR-020, quickstart checks, ui standard
- [x] P-01 Specifications split into one per function (001 to 008) with plan, tasks and checklist; this folder keeps the product overview, research and manual checks
- [x] P-02 Guided path, exact preview and run progress implemented from specs 006 to 008 (test first for the models, end-to-end tests through the real controller and views)
- [ ] P-03 Manual checks 26 to 30 in a real environment (quickstart.md)
