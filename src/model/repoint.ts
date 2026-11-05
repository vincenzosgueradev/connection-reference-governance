import type { ConnectionReferenceRow, Snapshot } from '../types';

/**
 * Which references can be swapped for which when flows are re-pointed. Pure.
 * A flow's reference can only be replaced by another reference of the same connector in the same solution: these
 * functions give the screen exactly the choices the planner would accept, so the mistake cannot be made.
 */

export interface RepointSource {
    readonly logicalName: string;
    readonly displayName: string;
    readonly connectorId: string;
    /** How many of the selected flows use this reference. */
    readonly used: number;
    /** How many flows are selected. */
    readonly selected: number;
}

export interface RepointGroup {
    /** The connector of the references in this group (the key of the group in the state). */
    readonly connectorId: string;
    /** References to replace. Empty: this category is left alone. */
    readonly from: readonly string[];
    /** The reference to use instead; may be one of `from`. */
    readonly target: string;
}

const byName = (a: { displayName: string; logicalName: string }, b: { displayName: string; logicalName: string }) =>
    (a.displayName || a.logicalName).localeCompare(b.displayName || b.logicalName, undefined, { sensitivity: 'base' });

/** The references used by the selected flows (those that exist in the environment), most used first, then by name. */
export function repointSources(snapshot: Snapshot, flowIds: readonly string[]): RepointSource[] {
    const chosen = snapshot.flows.filter(f => flowIds.includes(f.flow.id));
    const counts = new Map<string, number>();
    for (const f of chosen) for (const u of f.uses) if (u.reference) counts.set(u.logicalName, (counts.get(u.logicalName) ?? 0) + 1);
    return [...counts.entries()]
        .map(([logicalName, used]) => {
            const ref = snapshot.allReferences.find(r => r.logicalName === logicalName)!;
            return { logicalName, displayName: ref.displayName, connectorId: ref.connectorId, used, selected: chosen.length };
        })
        .sort((a, b) => b.used - a.used || byName(a, b));
}

export interface RepointCategory {
    readonly connectorId: string;
    readonly sources: readonly RepointSource[];
}

/** The connectors a re-point goes through, one step each: the references the selected flows use, grouped by connector. */
export function categoriesOf(snapshot: Snapshot, flowIds: readonly string[]): RepointCategory[] {
    const byConnector = new Map<string, RepointSource[]>();
    for (const x of repointSources(snapshot, flowIds)) byConnector.set(x.connectorId, [...(byConnector.get(x.connectorId) ?? []), x]);
    return [...byConnector].map(([connectorId, sources]) => ({ connectorId, sources }));
}

export type StepStatus = 'done' | 'incomplete' | 'empty';

/** How a category stands: both choices made, references ticked without a new one, or nothing chosen (not changed). */
export function stepStatus(group: { from: readonly string[]; target: string } | undefined): StepStatus {
    if (!group || group.from.length === 0) return 'empty';
    return group.target === '' ? 'incomplete' : 'done';
}

type Names = string | readonly string[];
const asList = (n: Names): string[] => [...new Set(typeof n === 'string' ? [n] : n)].filter(x => x !== '');

/** The connector shared by every named reference, or undefined when none is named, one is unknown or they differ. */
function sharedConnector(snapshot: Snapshot, names: Names): string | undefined {
    const list = asList(names);
    if (list.length === 0) return undefined;
    const ids = new Set<string>();
    for (const n of list) {
        const ref = snapshot.allReferences.find(r => r.logicalName === n);
        if (!ref) return undefined;
        ids.add(ref.connectorId);
    }
    return ids.size === 1 ? [...ids][0] : undefined;
}

/** True when the references to replace all exist and belong to one connector. */
export function sourcesAreOneConnector(snapshot: Snapshot, names: Names): boolean {
    return sharedConnector(snapshot, names) !== undefined;
}

/**
 * The references of the same connector in this solution, by name. With one source that source is left out (nothing to
 * replace); with several, the chosen ones stay because the new reference may be one of them. Empty for no source, an
 * unknown source or sources of different connectors.
 */
export function repointTargets(snapshot: Snapshot, fromNames: Names): ConnectionReferenceRow[] {
    const list = asList(fromNames);
    const connector = sharedConnector(snapshot, list);
    if (connector === undefined) return [];
    return snapshot.references
        .map(r => r.reference)
        .filter(r => r.connectorId === connector && (list.length > 1 || r.logicalName !== list[0]))
        .sort(byName);
}

export function isCompatibleTarget(snapshot: Snapshot, fromNames: Names, targetLogicalName: string): boolean {
    return repointTargets(snapshot, fromNames).some(r => r.logicalName === targetLogicalName);
}
