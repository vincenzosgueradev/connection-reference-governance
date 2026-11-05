# Implementation Plan: A shorter path: no separate Review step

**Spec**: [spec.md](spec.md) | **Product plan**: [000 plan](../000-connection-reference-governance/plan.md) | **Date**: 2026-11-05

## Technical context

Vanilla TypeScript, Vite IIFE bundle, Vitest. The step list, the moves and the crumbs are pure; the wizard starts at the Preview; the Review view is removed.

## Constitution check

| Rule | How it is met |
|---|---|
| I independence | no other tool is named |
| V honest, destructive operations | the exact preview and the confirmation (with all acknowledgements) stay before any write |
| VI layers | pure model, state, thin views |
| VII UI | kit classes and tokens, no emoji |
| VIII tests | tests move with the behaviour; the guards stay |

## Structure

- src/model/workflow.ts, src/state/reducer.ts, src/views/preview.ts, src/views/main.ts, src/views/workflow.ts; src/views/review.ts removed
