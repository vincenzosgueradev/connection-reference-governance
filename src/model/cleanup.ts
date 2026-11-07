import type { ConnectionReferenceRow, Snapshot } from '../types';
import type { RepointGroup } from './repoint';

/**
 * Clean up (feature 022, constitution T2d): which references nobody uses and which are duplicates of one another. Pure;
 * nothing here writes. Cleaning up is a view over the existing operations: Remove and Delete (T2b) and the re-point.
 */

export type CleanupTab = 'unused' | 'duplicates';

/** What the dialog remembers between draws. */
export interface Cleanup {
    readonly tab: CleanupTab;
    /** Ids of the unused references that are ticked. */
    readonly picked: readonly string[];
    /** Group key to the id of the reference chosen to stay; a group without an entry uses the suggestion. */
    readonly keepers: Readonly<Record<string, string>>;
    /** Ids of the references whose list of dependencies is open under their row (feature 023). */
    readonly open: readonly string[];
    /** The one-line summary of a check was closed; a new check shows it again. */
    readonly summaryHidden: boolean;
}

export const emptyCleanup = (tab: CleanupTab = 'unused', picked: readonly string[] = []): Cleanup => ({ tab, picked, keepers: {}, open: [], summaryHidden: false });

const byName = (a: ConnectionReferenceRow, b: ConnectionReferenceRow): number =>
    (a.displayName || a.logicalName).localeCompare(b.displayName || b.logicalName, undefined, { sensitivity: 'base' }) || a.logicalName.localeCompare(b.logicalName);

export interface DuplicateMember {
    readonly reference: ConnectionReferenceRow;
    /** Names of the flows of the solution that use this reference. */
    readonly flows: readonly string[];
    readonly flowIds: readonly string[];
}

export interface DuplicateGroup {
    /** Connector, custom connector and connection, lower case: stable while the solution is unchanged. */
    readonly key: string;
    readonly connectorId: string;
    readonly connectionId: string;
    readonly members: readonly DuplicateMember[];
    /** The id of the member to keep when the user has not chosen: the most used, then the first by logical name. */
    readonly suggestedKeeper: string;
}

export const groupKeyOf = (r: ConnectionReferenceRow): string => `${r.connectorId.toLowerCase()}|${r.customConnectorId.toLowerCase()}|${r.connectionId.trim().toLowerCase()}`;

/** Groups of two or more member references that hold the same connection of the same connector. Biggest group first. */
export function duplicateGroups(snapshot: Snapshot): DuplicateGroup[] {
    const byKey = new Map<string, DuplicateMember[]>();
    for (const v of snapshot.references) {
        const r = v.reference;
        if (r.connectionId.trim() === '') continue; // nothing to compare: the connections are not set
        const flows = v.flowIds.map(id => snapshot.flows.find(f => f.flow.id === id)?.flow.name ?? id);
        byKey.set(groupKeyOf(r), [...(byKey.get(groupKeyOf(r)) ?? []), { reference: r, flows, flowIds: v.flowIds }]);
    }
    return [...byKey]
        .filter(([, members]) => members.length >= 2)
        .map(([key, list]): DuplicateGroup => {
            const members = [...list].sort((a, b) => byName(a.reference, b.reference));
            const keeper = [...members].sort((a, b) => b.flowIds.length - a.flowIds.length || a.reference.logicalName.localeCompare(b.reference.logicalName))[0]!;
            return { key, connectorId: members[0]!.reference.connectorId, connectionId: members[0]!.reference.connectionId, members, suggestedKeeper: keeper.reference.id };
        })
        .sort((a, b) => b.members.length - a.members.length || a.key.localeCompare(b.key));
}

/** The member to keep for a group: the user's choice when it is still a member, else the suggestion. */
export function keeperOf(group: DuplicateGroup, cleanup: Cleanup | null): string {
    const chosen = cleanup?.keepers[group.key];
    return chosen !== undefined && group.members.some(m => m.reference.id === chosen) ? chosen : group.suggestedKeeper;
}

export interface UnusedReference {
    readonly reference: ConnectionReferenceRow;
    /** Why it cannot be ticked, when it cannot. */
    readonly blocked: string | undefined;
    /** No connection was ever set: the clearest candidate. */
    readonly neverConnected: boolean;
    /** The name of the reference it duplicates (the keeper suggested for its group), when it is in a group and is not that one. */
    readonly duplicateOf: string | undefined;
}

/** Member references that no flow of the solution uses, by name. Managed ones are listed but blocked. */
export function unusedReferences(snapshot: Snapshot): UnusedReference[] {
    const groups = duplicateGroups(snapshot);
    const nameOf = (id: string): string | undefined => {
        const r = snapshot.references.find(v => v.reference.id === id)?.reference;
        return r ? r.displayName || r.logicalName : undefined;
    };
    return snapshot.references
        .filter(v => v.flowIds.length === 0)
        .map(v => {
            const r = v.reference;
            const group = groups.find(g => g.members.some(m => m.reference.id === r.id));
            return {
                reference: r,
                blocked: snapshot.solution.managed || r.managed ? 'Managed: read-only.' : undefined,
                neverConnected: r.connectionId.trim() === '',
                duplicateOf: group && group.suggestedKeeper !== r.id ? nameOf(group.suggestedKeeper) : undefined,
            };
        })
        .sort((a, b) => byName(a.reference, b.reference));
}

/** Flows whose definition could not be read: any of them might use a reference that looks unused. */
export const unreadableFlows = (snapshot: Snapshot): number => snapshot.flows.filter(f => f.unreadable).length;

export interface MergeInput {
    readonly keeper: ConnectionReferenceRow;
    /** The other members of the group, all of which are to be taken away afterwards. */
    readonly duplicates: readonly ConnectionReferenceRow[];
    /** The flows that use any duplicate: what the re-point is run for. Empty when no flow uses them. */
    readonly flowIds: readonly string[];
    /** The re-point to run (the duplicates that flows use, to the keeper); null when there is nothing to re-point. */
    readonly group: RepointGroup | null;
}

/** What a merge into `keeperId` needs: the flows to select and the re-point group. Undefined for an unknown group or keeper. */
export function mergeInput(snapshot: Snapshot, group: DuplicateGroup, keeperId: string): MergeInput | undefined {
    const keeper = group.members.find(m => m.reference.id === keeperId);
    if (!keeper) return undefined;
    const others = group.members.filter(m => m.reference.id !== keeperId);
    const using = others.filter(m => m.flowIds.length > 0);
    const flowIds = [...new Set(using.flatMap(m => m.flowIds))].filter(id => snapshot.flows.some(f => f.flow.id === id && !f.unreadable));
    return {
        keeper: keeper.reference,
        duplicates: others.map(m => m.reference),
        flowIds,
        group: flowIds.length === 0 ? null : { connectorId: group.connectorId, from: using.map(m => m.reference.logicalName), target: keeper.reference.logicalName },
    };
}

export interface CleanupFigures {
    readonly unused: number;
    readonly groups: number;
    /** Distinct flows that would be re-pointed if every group were merged into its suggested keeper. */
    readonly flows: number;
}

export function cleanupFigures(snapshot: Snapshot): CleanupFigures {
    const groups = duplicateGroups(snapshot);
    const flows = new Set<string>();
    for (const g of groups) {
        const merge = mergeInput(snapshot, g, g.suggestedKeeper);
        for (const id of merge?.flowIds ?? []) flows.add(id);
    }
    return { unused: unusedReferences(snapshot).length, groups: groups.length, flows: flows.size };
}

/**
 * The dialog's choices cleaned against the solution as it is now: ticks on references that are no longer unused (or can
 * not be ticked) are dropped, a keeper that is no longer in its group is forgotten. Returns the same object when nothing
 * changed.
 */
export function pruneCleanup(snapshot: Snapshot, cleanup: Cleanup): Cleanup {
    const tickable = new Set(unusedReferences(snapshot).filter(u => u.blocked === undefined).map(u => u.reference.id));
    const picked = cleanup.picked.filter(id => tickable.has(id));
    const groups = duplicateGroups(snapshot);
    const entries = Object.entries(cleanup.keepers).filter(([key, id]) => groups.find(g => g.key === key)?.members.some(m => m.reference.id === id) === true);
    const samePicked = picked.length === cleanup.picked.length;
    const sameKeepers = entries.length === Object.keys(cleanup.keepers).length;
    return samePicked && sameKeepers ? cleanup : { ...cleanup, picked, keepers: Object.fromEntries(entries) };
}
