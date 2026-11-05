# Implementation Plan: Action studio: a roomy, expandable dialog for choosing what to change

**Spec**: [spec.md](spec.md) | **Product plan**: [000 plan](../000-connection-reference-governance/plan.md) | **Date**: 2026-11-04

## Technical context

Vanilla TypeScript, Vite IIFE bundle, Vitest (jsdom for views), shared UI kit (`src/ui`). A pure impact model; a studio view per operation; the shell is the kit modal with an expand switch; the state holds whether it is open and expanded.

## Constitution check

| Rule | How it is met |
|---|---|
| I independence | no other tool is named, imported or linked; looks and behaviours copied in this repository only where marked |
| V honest, destructive operations | nothing is written before the confirmation of feature 005; no custom request headers |
| VI layers | pure model, then services, then host adapter, then thin views |
| VII UI | kit classes and tokens only, no emoji, no truncation, stable layout, responsive, offer only what will be accepted |
| VIII tests | test first for defects and for new rules, matrix and oracle for pure functions, mutation checks for the guards |

## Structure

- `src/views/studio.ts`
- `src/model/impact.ts`
- src/state/reducer.ts (studio)
- src/views/main.ts (selection bar)
- src/ui (kit: modal expandable, selectionBar, choice list)

