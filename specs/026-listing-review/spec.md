# Feature Specification: Listing review answer (0.1.1)

**Feature Branch**: `026-listing-review`
**Created**: 2026-11-14
**Status**: Built; hand test in both themes pending
**Part of**: [Product overview](../000-connection-reference-governance/spec.md)
**Input**: The marketplace review of 2026-11-13 ("Changes requested"): explain the overlap with EnvVar & ConnRef Matrix in the README, and follow the PPTB theme, not only the OS theme.

## Requirements

- **FR-001**: The tool reads the theme with `toolboxAPI.utils.getCurrentTheme()` on load and applies it as `data-theme` on `<html>`.
- **FR-002**: It updates the theme on the `settings:updated` event, from the payload or by reading again; values that are not `light` or `dark` are ignored.
- **FR-003**: Outside PPTB, or when the host cannot answer, `prefers-color-scheme` stays the fallback (no attribute).
- **FR-004**: Only `host.ts` touches the PPTB API (`themeApi()`); `theme.ts` takes it as a parameter.
- **FR-005**: The README has a section "Overlap with EnvVar & ConnRef Matrix": what that tool does, what this tool adds (per-solution flow-to-reference view, re-point any flow, create a reference, remove from a solution, environment-wide dependencies, Connections area). It is the only place that names another tool.
- **FR-006**: The README has "What sets it apart", limited to what the build does; no claim of being better, no comparison table.

## Success criteria

- **SC-001**: With the PPTB theme set opposite to the OS theme, both themes are readable and match PPTB (hand test).
- **SC-002**: Tests in `test/theme.test.ts` pass; the full suite, build and `npm run validate` are clean.
