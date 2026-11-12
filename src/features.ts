/**
 * Declared flags of the tool. A flag is a decision recorded in code, not a setting of the user.
 *
 * `connectionDelete`: deleting a connection (feature 024). The official operation is not in the Power Platform API that
 * the toolbox exposes, so the route is unverified. It may be turned on only after a live test on a test connection is
 * recorded in specs/024-connections-manager/research.md as a line "Live check passed: <date>"; a test fails if it is on
 * without that record (constitution T11).
 */
export const features = {
    connectionDelete: true, // on since the live check of 2026-11-12 (28 connections deleted and read back), recorded in research.md D-4
} as const;
