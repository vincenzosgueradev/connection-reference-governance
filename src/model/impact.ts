import type { Snapshot } from '../types';

/** What a choice made in the studio will touch. Pure: from the choices and the selection only. */

export interface RepointImpact {
    /** Selected flows that hold at least one of the references to replace. */
    readonly affected: number;
    /** Of those, the flows that are turned on (they must be turned off first). */
    readonly turnedOn: number;
    /** Selected flows that hold none of them. */
    readonly unrelated: number;
}

export function repointImpact(snapshot: Snapshot, flowIds: readonly string[], from: readonly string[], target: string): RepointImpact {
    const sources = from.filter(n => n !== target);
    let affected = 0;
    let turnedOn = 0;
    let unrelated = 0;
    for (const id of flowIds) {
        const view = snapshot.flows.find(f => f.flow.id === id);
        if (!view) continue;
        if (view.uses.some(u => sources.includes(u.logicalName))) {
            affected++;
            if (view.flow.stateCode === 1) turnedOn++;
        } else unrelated++;
    }
    return { affected, turnedOn, unrelated };
}

export interface ConnectionImpact {
    readonly references: number;
    readonly flows: number;
    readonly turnedOn: number;
}

export function connectionImpact(snapshot: Snapshot, referenceIds: readonly string[]): ConnectionImpact {
    const chosen = snapshot.references.filter(r => referenceIds.includes(r.reference.id));
    const flowIds = new Set(chosen.flatMap(r => r.flowIds));
    const turnedOn = [...flowIds].filter(id => snapshot.flows.find(f => f.flow.id === id)?.flow.stateCode === 1).length;
    return { references: chosen.length, flows: flowIds.size, turnedOn };
}

/** A whole percentage of the selected flows, 0 when none is selected. */
export function usageShare(used: number, selected: number): number {
    return selected <= 0 ? 0 : Math.round((used / selected) * 100);
}

export interface GroupsImpact extends RepointImpact {
    /** Categories with at least one reference to replace. */
    readonly categories: number;
}

/** The impact of a re-point by category: a flow counts once, whatever number of categories it holds. */
export function groupsImpact(snapshot: Snapshot, flowIds: readonly string[], groups: readonly { from: readonly string[]; target: string }[]): GroupsImpact {
    const active = groups.filter(g => g.from.length > 0);
    const sources = active.flatMap(g => g.from.filter(n => n !== g.target));
    let affected = 0;
    let turnedOn = 0;
    let unrelated = 0;
    for (const id of flowIds) {
        const view = snapshot.flows.find(f => f.flow.id === id);
        if (!view) continue;
        if (view.uses.some(u => sources.includes(u.logicalName))) {
            affected++;
            if (view.flow.stateCode === 1) turnedOn++;
        } else unrelated++;
    }
    return { categories: active.length, affected, turnedOn, unrelated };
}
