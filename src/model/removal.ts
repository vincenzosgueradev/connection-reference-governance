import type { ConnectionReferenceRow, Plan, PlanRow, Snapshot } from '../types';

/**
 * Planners of the two operations that take something away (feature 016, constitution T2): remove components from this
 * solution (the rows stay in the environment) and delete the rows. Pure; nothing here writes.
 */

export type RemovalKind = 'remove' | 'delete';

/** What the environment said depends on each row (delete only): a list, or undefined when it could not be read. */
export type Dependencies = Readonly<Record<string, readonly { readonly id: string; readonly type: number }[] | undefined>>;

/** The record of a reference as kept in the backup: enough to create it again by hand. */
function referenceRecord(r: ConnectionReferenceRow): string {
    return JSON.stringify({ connectionreferenceid: r.id, connectionreferencelogicalname: r.logicalName, connectionreferencedisplayname: r.displayName, connectorid: r.connectorId, connectionid: r.connectionId }, null, 2);
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export function planRemoval(snapshot: Snapshot, ids: readonly string[], kind: RemovalKind, deps?: Dependencies): Plan {
    const chosen = new Set(ids);
    const rows: PlanRow[] = [];
    // A selected row that is blocked stays: it does not make what it depends on free to go.
    const blockedIds = new Set<string>();
    const going = (id: string): boolean => chosen.has(id) && !blockedIds.has(id);
    const solutionBlock = snapshot.solution.managed ? 'Managed: read-only.' : undefined;
    const common = (id: string, label: string, managed: boolean, entityNoun: string) => {
        const base = kind === 'remove'
            ? { oldValue: 'In this solution', newValue: 'Not in this solution', field: 'membership' as const }
            : { oldValue: 'Exists', newValue: 'Deleted', field: 'row' as const };
        const componentType = snapshot.componentTypes[id.toLowerCase()];
        let blocked: string | undefined = solutionBlock ?? (managed ? 'Managed: read-only.' : undefined);
        if (blocked === undefined && kind === 'remove' && componentType === undefined) blocked = `The component type of this ${entityNoun} could not be read from the solution.`;
        return { id, label, payload: '', ...base, ...(componentType !== undefined ? { componentType } : {}), blocked };
    };

    /** Why the environment would refuse to delete this row: components outside the selection depend on it, or it could not be checked. */
    const dependencyBlock = (id: string): string | undefined => {
        if (kind !== 'delete' || deps === undefined) return undefined;
        const found = deps[id];
        if (found === undefined) return 'The dependencies could not be checked, so nothing is deleted.';
        const outside = found.filter(d => !going(d.id));
        if (outside.length === 0) return undefined;
        const nameOf = (d: { id: string; type: number }) => snapshot.flows.find(f => f.flow.id === d.id)?.flow.name ?? snapshot.references.find(r => r.reference.id === d.id)?.reference.displayName ?? `a component of type ${d.type}`;
        const names = [...new Set(outside.map(nameOf))];
        return `Other components depend on it (${names.slice(0, 3).join(', ')}${names.length > 3 ? ` and ${names.length - 3} more` : ''}): it cannot be deleted.`;
    };

    // flows first: a reference is judged by the flows that will really be gone, and they are deleted before it
    const isFlow = (id: string) => snapshot.flows.some(f => f.flow.id === id);
    for (const id of [...chosen].sort((a, b) => Number(isFlow(b)) - Number(isFlow(a)))) {
        const flowView = snapshot.flows.find(f => f.flow.id === id);
        if (flowView) {
            const f = flowView.flow;
            const c = common(id, f.name, f.managed, 'flow');
            let blocked = c.blocked ?? dependencyBlock(id);
            let turnOff = false;
            if (blocked === undefined && kind === 'delete' && f.stateCode !== 0) {
                if (f.stateCode === 1) turnOff = true; // a flow that is on is turned off first, then deleted (it is never turned on again)
                else blocked = 'The flow is not off (suspended): turn it off first.';
            }
            if (blocked !== undefined) blockedIds.add(id);
            // a flow is a workflow whatever the solution says: the dependencies of a delete are asked with that type
            const typed = kind === 'delete' && c.componentType === undefined ? { componentType: 29 } : {};
            const { blocked: _b, ...rest } = c;
            rows.push({ ...rest, ...typed, entity: 'workflow', affectedFlows: 1, affectedOn: f.stateCode === 1 ? 1 : 0, expectedCurrent: f.clientData, ...(blocked !== undefined ? { blocked } : {}), ...(turnOff ? { turnOff: true } : {}) });
            continue;
        }
        const refView = snapshot.references.find(r => r.reference.id === id);
        if (!refView) continue;
        const r = refView.reference;
        const c = common(id, r.displayName || r.logicalName, r.managed, 'reference');
        let blocked = c.blocked;
        // A flow that stays would be left pointing at a reference that is gone (or outside the solution).
        const staying = refView.flowIds.filter(fid => !going(fid)).length;
        if (blocked === undefined && staying > 0) blocked = `Used by ${staying} ${plural(staying, 'flow', 'flows')} of this solution that ${plural(staying, 'stays', 'stay')}: re-point ${plural(staying, 'it', 'them')} or take ${plural(staying, 'it', 'them')} out first.`;
        blocked = blocked ?? dependencyBlock(id);
        if (blocked !== undefined) blockedIds.add(id);
        const { blocked: _b, ...rest } = c;
        rows.push({ ...rest, entity: 'connectionreference', affectedFlows: refView.flowIds.length, affectedOn: 0, expectedCurrent: referenceRecord(r), ...(blocked !== undefined ? { blocked } : {}) });
    }

    const writable = rows.filter(r => r.blocked === undefined);
    const warnings: string[] = [];
    if (kind === 'remove') {
        warnings.push('The rows stay in the environment and in every other solution that holds them: only their place in this solution goes. They can be added back from the maker portal.');
    } else {
        warnings.push('Delete is permanent: the rows are removed from the environment and from every solution that holds them. Undo is not possible.');
        if (writable.some(r => snapshot.flows.some(f => f.flow.id === r.id))) warnings.push('The run history of a deleted flow is deleted with it.');
        if (writable.some(r => snapshot.references.some(x => x.reference.id === r.id))) warnings.push('The connection behind a deleted reference is not deleted. The environment may refuse to delete a reference that a flow outside this solution still uses: each refusal is reported on its row.');
        const off = writable.filter(r => r.turnOff === true).length;
        if (off > 0) warnings.push(`${off} ${plural(off, 'flow is', 'flows are')} turned on: the tool turns ${plural(off, 'it', 'them')} off first and then deletes ${plural(off, 'it', 'them')}.`);
    }
    const entity: Plan['entity'] = rows.every(r => snapshot.references.some(x => x.reference.id === r.id)) && rows.length > 0 ? 'connectionreference' : 'workflow';
    return {
        kind,
        entity,
        rows,
        warnings,
        solution: { id: snapshot.solution.id, uniqueName: snapshot.solution.uniqueName },
    };
}
