# Implementation Plan: Re-point flows to another reference

**Spec**: [spec.md](spec.md) | **Product plan**: [000 plan](../000-connection-reference-governance/plan.md) | **Date**: 2026-11-04

## Technical context

Vanilla TypeScript, Vite IIFE bundle, Vitest (jsdom for views), shared UI kit (`src/ui`). Rules live in pure models (clientdata, repoint, plans); the reducer enforces them on the state; the view offers what the models allow.

## Constitution check

| Rule | How it is met |
|---|---|
| I independence | no other tool is named, imported or linked; looks and behaviours copied in this repository only where marked |
| V honest, destructive operations | nothing is written before the confirmation of feature 005; no custom request headers |
| VI layers | pure model, then services, then host adapter, then thin views |
| VII UI | kit classes and tokens only, no emoji, no truncation, stable layout, responsive, offer only what will be accepted |
| VIII tests | test first for defects and for new rules, matrix and oracle for pure functions, mutation checks for the guards |

## Structure

- src/model/clientdata.ts (repointClientData)
- `src/model/repoint.ts`
- src/model/plans.ts (planRepoint)
- src/state/reducer.ts (compatible)
- src/views/main.ts (actionBar)

