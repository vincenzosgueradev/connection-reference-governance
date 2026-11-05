# Implementation Plan: Apply progress and result

**Spec**: [spec.md](spec.md) | **Product plan**: [000 plan](../000-connection-reference-governance/plan.md) | **Date**: 2026-11-04

## Technical context

Vanilla TypeScript, Vite IIFE bundle, Vitest (jsdom for views), shared UI kit (`src/ui`). applyPlan reports each row through a callback; the controller turns them into store actions and runs a one-second timer; pure helpers format time and build the report.

## Constitution check

| Rule | How it is met |
|---|---|
| I independence | no other tool is named, imported or linked; looks and behaviours copied in this repository only where marked |
| V honest, destructive operations | nothing is written before the confirmation of feature 005; no custom request headers |
| VI layers | pure model, then services, then host adapter, then thin views |
| VII UI | kit classes and tokens only, no emoji, no truncation, stable layout, responsive, offer only what will be accepted |
| VIII tests | test first for defects and for new rules, matrix and oracle for pure functions, mutation checks for the guards |

## Structure

- `src/model/progress.ts`
- `src/model/report.ts`
- src/state/reducer.ts (wizard progress)
- src/controller.ts (confirm with progress and timer)
- src/services/dataverse.ts (applyPlan with progress)
- `src/views/apply.ts`
- `src/views/result.ts`
- src/ui (kit: pipeline)

