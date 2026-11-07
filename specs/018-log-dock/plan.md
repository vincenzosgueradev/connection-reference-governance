# Plan: The log dock

## Technical context

`services/log.ts` keeps the entries (`log`, `subscribeLog`, cap of 500, oldest first out); `views/logDock.ts` draws the bar at the bottom of every screen, mounted from `src/app.ts` and `src/index.html`. Open or closed is remembered in browser storage when it can be, and the dock works without it.

## Constitution check

- T7: nothing sensitive is logged; the log leaves the device only through Save.

## Note

Written after the implementation (backfilled 2026-11-07) from the spec and the code, to complete the pipeline; the spec is the source.
