# Implementation Plan: Flows and connection references browser

**Spec**: [spec.md](spec.md) | **Product plan**: [000 plan](../000-connection-reference-governance/plan.md) | **Date**: 2026-11-04

## Technical context

Vanilla TypeScript, Vite IIFE bundle, Vitest (jsdom for views), shared UI kit (`src/ui`). The snapshot is built by pure functions from what was read; views only draw it; every table row is a record that opens a details panel.

## Constitution check

| Rule | How it is met |
|---|---|
| I independence | no other tool is named, imported or linked; looks and behaviours copied in this repository only where marked |
| V honest, destructive operations | nothing is written before the confirmation of feature 005; no custom request headers |
| VI layers | pure model, then services, then host adapter, then thin views |
| VII UI | kit classes and tokens only, no emoji, no truncation, stable layout, responsive, offer only what will be accepted |
| VIII tests | test first for defects and for new rules, matrix and oracle for pure functions, mutation checks for the guards |

## Structure

- `src/model/analysis.ts`
- `src/model/flowinfo.ts`
- `src/model/connectors.ts`
- src/model/clientdata.ts (readReferenceNames)
- `src/views/connections.ts`
- `src/views/detail.ts`
- src/views/main.ts (flowsTable, referencesTable)
- src/services/dataverse.ts (loadSnapshotInput, owner names)
- src/ui (kit: selectableTable detail rows, keyValues, detailBlock, chips, icons)

