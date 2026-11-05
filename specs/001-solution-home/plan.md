# Implementation Plan: Solution home screen

**Spec**: [spec.md](spec.md) | **Product plan**: [000 plan](../000-connection-reference-governance/plan.md) | **Date**: 2026-11-04

## Technical context

Vanilla TypeScript, Vite IIFE bundle, Vitest (jsdom for views), shared UI kit (`src/ui`). Vanilla TypeScript over the shared UI kit; the screen is a pure function of the state; the counts are read after the list so the table is usable meanwhile.

## Constitution check

| Rule | How it is met |
|---|---|
| I independence | no other tool is named, imported or linked; looks and behaviours copied in this repository only where marked |
| V honest, destructive operations | nothing is written before the confirmation of feature 005; no custom request headers |
| VI layers | pure model, then services, then host adapter, then thin views |
| VII UI | kit classes and tokens only, no emoji, no truncation, stable layout, responsive, offer only what will be accepted |
| VIII tests | test first for defects and for new rules, matrix and oracle for pure functions, mutation checks for the guards |

## Structure

- src/views/main.ts (solutionList)
- `src/model/solutions.ts`
- `src/model/time.ts`
- src/services/dataverse.ts (loadSolutions, loadFlowCounts)
- `src/controller.ts`
- `src/app.ts`
- src/ui (kit: hero, statTile, segmented, searchBox, dataTable sort, connectionBadge)

