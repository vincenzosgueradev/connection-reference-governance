# Implementation Plan: Re-point by category: every connector in one operation

**Spec**: [spec.md](spec.md) | **Product plan**: [000 plan](../000-connection-reference-governance/plan.md) | **Date**: 2026-11-04

## Technical context

Vanilla TypeScript, Vite IIFE bundle, Vitest. The choices become a list of groups; the planner chains the verified edit of feature 003 per group; the studio shows one card per connector.

## Constitution check

| Rule | How it is met |
|---|---|
| I independence | no other tool is named |
| V honest, destructive operations | nothing is written before the confirmation; every edit self-checked; one write per flow |
| VI layers | pure model, state, thin view |
| VII UI | kit classes and tokens, no emoji, stable layout, responsive, only accepted choices offered |
| VIII tests | test first, matrix and oracle, mutation checks |

## Structure

- src/model/repoint.ts, impact.ts, plans.ts, src/state/reducer.ts, src/views/studio.ts, src/styles.css
