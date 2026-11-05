import type { Host, Record_ } from '../../src/host';
import type { ConnectionReferenceRow, FlowRow, SnapshotInput, SolutionInfo } from '../../src/types';

/** Synthetic data only. No tenant values. */

export const USER = '11111111-1111-4111-8111-111111111111';
export const OTHER_USER = '22222222-2222-4222-8222-222222222222';

export const guid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const solution = (managed = false): SolutionInfo => ({ id: guid(900), name: 'Sample', uniqueName: 'sample', managed, version: '1.0.0.0', publisher: 'Pub', createdOn: '2026-01-01T00:00:00Z' });

export const ref = (n: number, over: Partial<ConnectionReferenceRow> = {}): ConnectionReferenceRow => ({
    id: guid(n),
    logicalName: `sample_ref${n}`,
    displayName: `Ref ${n}`,
    connectorId: '/providers/Microsoft.PowerApps/apis/shared_a',
    connectionId: `conn-${n}`,
    customConnectorId: '',
    ownerName: 'Owner A',
    ownerId: USER,
    managed: false,
    ...over,
});

/** clientdata with the given reference logical names, one entry per name, plus unrelated content. */
export function clientData(names: readonly string[], extra: Record<string, unknown> = {}, triggers: Record<string, unknown> = {}): string {
    const connectionReferences: Record<string, unknown> = {};
    names.forEach((n, i) => {
        connectionReferences[`shared_k${i}`] = { api: { name: `shared_k${i}` }, connection: { connectionReferenceLogicalName: n }, runtimeSource: 'embedded' };
    });
    return JSON.stringify({
        properties: {
            connectionReferences,
            definition: { $schema: 'x', actions: { Scope: { type: 'Scope', actions: { Inner: { type: 'OpenApiConnection', inputs: { host: { connectionName: 'shared_k0' } } } } } }, triggers },
            ...extra,
        },
        schemaVersion: '1.0.0.0',
    });
}

export const flow = (n: number, names: readonly string[], over: Partial<FlowRow> = {}): FlowRow => ({
    id: guid(n),
    name: `Flow ${n}`,
    stateCode: 0,
    managed: false,
    clientData: clientData(names),
    description: '',
    createdOn: '2026-01-01T00:00:00Z',
    modifiedOn: '2026-02-01T00:00:00Z',
    ownerId: USER,
    ownerName: 'Owner A',
    ...over,
});

export function input(over: Partial<SnapshotInput> = {}): SnapshotInput {
    const references = [ref(1), ref(2), ref(3, { connectorId: '/providers/Microsoft.PowerApps/apis/shared_b' })];
    return {
        solution: solution(),
        references,
        memberReferenceIds: references.map(r => r.id),
        flows: [flow(10, ['sample_ref1']), flow(11, ['sample_ref1', 'sample_ref2'])],
        connections: {},
        ...over,
    };
}

export interface FakeHost extends Host {
    queries: string[];
    updates: { entity: string; id: string; record: Record_ }[];
}

/** Replaces only the PPTB door. `answer` maps a query prefix to rows; `failUpdate` rejects chosen ids. */
export function fakeHost(answer: (q: string) => Record_[], failUpdate: (id: string) => string | undefined = () => undefined): FakeHost {
    const h: FakeHost = {
        queries: [],
        updates: [],
        async query(q) {
            h.queries.push(q);
            return answer(q);
        },
        async update(entity, id, record) {
            const err = failUpdate(id);
            if (err) throw new Error(err);
            h.updates.push({ entity, id, record });
        },
        async remove() {},
        async dependencies() { return []; },
        async removeFromSolution() {},
        async currentUserId() {
            return USER;
        },
        async saveFile() {
            return true;
        },
        async connectionName() {
            return 'Test';
        },
        async environmentName() {
            return 'Test (Dev)';
        },
        async notify() {},
    };
    return h;
}

export interface MemoryHost extends FakeHost {
    rows: Map<string, Record<string, string>>;
}

/**
 * A host whose rows live in memory: reads of `table?$select=col&$filter=key eq ID` answer from `rows`, updates change
 * them. `afterRead` lets a test change a row between the check and the write, `persist` false drops writes.
 */
export function memoryHost(initial: Record<string, Record<string, string>>, opts: { failUpdate?: (id: string) => string | undefined; persist?: boolean; store?: (record: Record<string, string>) => Record<string, string>; onRead?: (id: string, n: number) => void } = {}): MemoryHost {
    const rows = new Map(Object.entries(initial));
    const reads = new Map<string, number>();
    const h: MemoryHost = {
        rows,
        queries: [],
        updates: [],
        async query(q) {
            h.queries.push(q);
            const m = /\$select=(\w+)&\$filter=\w+ eq ([0-9a-f-]+)$/.exec(q);
            if (!m) return [];
            const id = m[2]!;
            const n = (reads.get(id) ?? 0) + 1;
            reads.set(id, n);
            opts.onRead?.(id, n);
            const row = rows.get(id);
            return row ? [{ [m[1]!]: row[m[1]!] }] : [];
        },
        async update(entity, id, record) {
            const err = opts.failUpdate?.(id);
            if (err) throw new Error(err);
            h.updates.push({ entity, id, record });
            if (opts.persist !== false) rows.set(id, { ...rows.get(id), ...(opts.store ? opts.store(record as Record<string, string>) : (record as Record<string, string>)) });
        },
        async remove() {},
        async dependencies() { return []; },
        async removeFromSolution() {},
        async currentUserId() {
            return USER;
        },
        async saveFile() {
            return true;
        },
        async connectionName() {
            return 'Test';
        },
        async environmentName() {
            return 'Test (Dev)';
        },
        async notify() {},
    };
    return h;
}

/** The references to replace and the new reference of the first group of the re-point choices (the single-category view of the state). */
export const fromOf = (s: { repointGroups: readonly { from: readonly string[] }[] }): readonly string[] => s.repointGroups[0]?.from ?? [];
export const targetOf = (s: { repointGroups: readonly { target: string }[] }): string => s.repointGroups[0]?.target ?? '';
