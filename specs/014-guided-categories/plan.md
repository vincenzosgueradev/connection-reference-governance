# Implementation Plan: Guided choosing, one category at a time

**Spec**: [spec.md](spec.md) | **Product plan**: [000 plan](../000-connection-reference-governance/plan.md) | **Date**: 2026-11-05

## Technical context

Vanilla TypeScript, Vite IIFE bundle, Vitest (jsdom for views). A pure function lists the categories; the reducer keeps the current step; the studio draws the pipeline, the current step and the overview.

## Constitution check

| Rule | How it is met |
|---|---|
| I independence | no other tool is named |
| V honest, destructive operations | nothing is written by choosing; Review changes goes to the guided path |
| VI layers | pure model, state, thin view |
| VII UI | kit classes and tokens, no emoji, stable layout, responsive, reduced motion respected, only accepted choices offered |
| VIII tests | test first, mutation checks |

## Structure

- src/model/repoint.ts (categoriesOf), src/state/reducer.ts (studioStep, studioGo), src/views/studio.ts, src/styles.css
