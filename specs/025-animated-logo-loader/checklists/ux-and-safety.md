# UX and Accessibility Checklist: Animated logo loader

**Purpose**: Unit tests for the requirements (are they complete, clear, consistent), written before implementation.
**Created**: 2026-11-13 | **Spec**: [spec.md](../spec.md) | **Plan**: [plan.md](../plan.md)

## Requirement completeness

- [x] CHK001 Every whole-pane wait of the tool is listed (solutions, a solution, connections) and each has a caption (FR-2501, plan D-7).
- [x] CHK002 Waits that must keep the small spinner are named (FR-2510, edge cases).
- [x] CHK003 The end of the wait (data, error) is specified, including that a failure never keeps the loader (FR-2507).
- [x] CHK004 The very short wait is specified (FR-2508) and its value is a named constant (plan D-5).

## Requirement clarity

- [x] CHK005 "Animated" is defined: dashes flow left to right, nodes pulse in turn (FR-2502).
- [x] CHK006 "Reduced motion" is defined as slower, not off, and a test forbids `animation: none` (FR-2504, plan D-3).
- [x] CHK007 "Does not restart on redraw" has a mechanism that does not depend on timers (plan D-4).

## Consistency and accessibility

- [x] CHK008 Both themes use tokens, no fixed colour (FR-2503); a style test checks it.
- [x] CHK009 Status region, polite, drawing hidden from assistive technology (FR-2505).
- [x] CHK010 Narrow pane and no horizontal scroll (FR-2511).
- [x] CHK011 No emoji, no external asset, no new network request, no CSP change (spec assumptions, plan).
- [x] CHK012 Consistent with T8 "every wait is visible and honest": the caption is from real data and no timer drives it (FR-2506).

## Safety

- [x] CHK013 The feature reads and writes nothing: no host, service or state change (plan summary).
