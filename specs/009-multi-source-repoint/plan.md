# Implementation Plan: Re-point several references to one in a single operation

**Spec**: [spec.md](spec.md) | **Product plan**: [000 plan](../000-connection-reference-governance/plan.md) | **Date**: 2026-11-04

## Technical context

Vanilla TypeScript, Vite IIFE bundle, Vitest (jsdom for views), shared UI kit (`src/ui`). The pure models take a list of sources; the reducer keeps the list compatible; the studio (feature 010) is the screen for it.

## Constitution check

| Rule | How it is met |
|---|---|
| I independence | no other tool is named, imported or linked; looks and behaviours copied in this repository only where marked |
| V honest, destructive operations | nothing is written before the confirmation of feature 005; no custom request headers |
| VI layers | pure model, then services, then host adapter, then thin views |
| VII UI | kit classes and tokens only, no emoji, no truncation, stable layout, responsive, offer only what will be accepted |
| VIII tests | test first for defects and for new rules, matrix and oracle for pure functions, mutation checks for the guards |

## Structure

- src/model/clientdata.ts (repointClientData with several sources)
- src/model/repoint.ts (sources by connector, targets)
- src/model/plans.ts (planRepoint with several sources)
- src/state/reducer.ts (repointFrom list, compatible)

