import type { ConnectionReferenceRow, Flag, FlowRefUse, FlowView, ReferenceView, Snapshot, SnapshotInput } from '../types';
import { readReferenceNames } from './clientdata';
import { flowInfo } from './flowinfo';

/** Pure: turns what was read into the two views and the flags. A flag exists only when its data was read. */

function referenceFlags(ref: ConnectionReferenceRow, input: SnapshotInput, expectedOwner: string): Flag[] {
    const flags: Flag[] = [];
    if (ref.connectionId === '') {
        flags.push({ kind: 'no-connection', label: 'No connection', detail: `${ref.logicalName} has no connection set.` });
        return flags;
    }
    const info = input.connections[ref.connectionId];
    if (!info) return flags;
    if (expectedOwner !== '' && info.ownerName !== expectedOwner)
        flags.push({ kind: 'other-owner', label: 'Other owner', detail: `Connection owned by ${info.ownerName}, expected ${expectedOwner}.` });
    if (!info.connected) flags.push({ kind: 'not-connected', label: 'Not connected', detail: `The connection behind ${ref.logicalName} is not connected.` });
    return flags;
}

export function buildSnapshot(input: SnapshotInput, expectedOwner = ''): Snapshot {
    const byName = new Map<string, ConnectionReferenceRow>();
    for (const r of input.references) byName.set(r.logicalName, r);

    const flows: FlowView[] = input.flows.map(flow => {
        const info = flowInfo(flow.clientData);
        const names = readReferenceNames(flow.clientData);
        if (!names.ok) return { flow, info, uses: [], flags: [], unreadable: true };
        const uses: FlowRefUse[] = names.value.map(logicalName => {
            const reference = byName.get(logicalName);
            const flags: Flag[] = reference
                ? referenceFlags(reference, input, expectedOwner)
                : [{ kind: 'missing-reference', label: 'Missing reference', detail: `The flow declares ${logicalName}, which does not exist in the environment.` }];
            return { logicalName, reference, flags };
        });
        return { flow, info, uses, flags: uses.flatMap(u => u.flags), unreadable: false };
    });

    const members = new Set(input.memberReferenceIds);
    const references: ReferenceView[] = input.references
        .filter(r => members.has(r.id))
        .map(reference => ({
            reference,
            flowIds: flows.filter(f => f.uses.some(u => u.logicalName === reference.logicalName)).map(f => f.flow.id),
            flags: referenceFlags(reference, input, expectedOwner),
        }));

    return { solution: input.solution, flows, references, allReferences: input.references, componentTypes: input.memberTypes ?? {} };
}

/** Distinct owner names found in the data, for the expected-owner picker. */
export function ownersFound(input: SnapshotInput): string[] {
    const set = new Set<string>();
    for (const c of Object.values(input.connections)) set.add(c.ownerName);
    return [...set].sort();
}

/** The snapshot with a reference just created in the solution added: member, used by no flow yet (feature 021). */
export function buildSnapshotWith(snapshot: Snapshot, reference: ConnectionReferenceRow, componentType?: number): Snapshot {
    if (snapshot.allReferences.some(r => r.id === reference.id)) return snapshot;
    const flags = referenceFlags(reference, { connections: {} } as unknown as SnapshotInput, '');
    // a member's component type is what Remove and Delete send; without it the new row would be blocked until a refresh (T2b, T5)
    const componentTypes = componentType === undefined ? snapshot.componentTypes : { ...snapshot.componentTypes, [reference.id.toLowerCase()]: componentType };
    return { ...snapshot, componentTypes, allReferences: [...snapshot.allReferences, reference], references: [...snapshot.references, { reference, flowIds: [], flags }] };
}
