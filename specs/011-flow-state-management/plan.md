# Implementation Plan: Turn flows off for the change and on again afterwards

**Spec**: [spec.md](spec.md) | **Product plan**: [000 plan](../000-connection-reference-governance/plan.md) | **Date**: 2026-11-04

## Technical context

Vanilla TypeScript, Vite IIFE bundle, Vitest (jsdom for views), shared UI kit (`src/ui`). The plan carries the choice and a flag per row; applyPlan runs the phases and restores state in a final phase that always runs; the dialog explains and asks.

## Constitution check

| Rule | How it is met |
|---|---|
| I independence | no other tool is named, imported or linked; looks and behaviours copied in this repository only where marked |
| V honest, destructive operations | nothing is written before the confirmation of feature 005; no custom request headers |
| VI layers | pure model, then services, then host adapter, then thin views |
| VII UI | kit classes and tokens only, no emoji, no truncation, stable layout, responsive, offer only what will be accepted |
| VIII tests | test first for defects and for new rules, matrix and oracle for pure functions, mutation checks for the guards |

## Structure

- src/model/plans.ts (manageState, turnOff rows)
- src/services/dataverse.ts (applyPlan phases, setFlowState)
- src/model/progress.ts (phases with state steps)
- src/model/report.ts (flows turned off)
- src/views/confirm.ts (consequences, second acknowledgement)
- src/views/studio.ts (the choice)

