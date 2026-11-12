import type { FakeHost } from './fixtures';
import { fakeHost, guid } from './fixtures';
import type { ConnectionSeed } from './scenario';

/**
 * A small synthetic environment for the Connections area (feature 024): connections, the references that hold them, the
 * flows, apps and agents that use those, the solutions, and switches that make one source fail. Only the PPTB door is
 * replaced; the services are the real ones. Synthetic data only (T7).
 */

export const REF_TYPE = 10001;

export interface WorldRef {
    id: string;
    logicalName: string;
    displayName: string;
    /** The connection it holds. */
    connection: string;
}

export interface World {
    connections: ConnectionSeed[];
    references: WorldRef[];
    /** What depends on a reference (RetrieveDependentComponents). */
    dependents: Record<string, { id: string; type: number }[]>;
    /** Flow rows by id. */
    flows: Record<string, { name: string; state?: number }>;
    /** Agents that use a reference as their connection reference, by reference id. */
    agents: Record<string, { id: string; name: string }[]>;
    apps: { name: string; displayName: string; connections: string[] }[];
    /** Solution ids that hold a component, by component id. */
    membership: Record<string, string[]>;
    solutions: Record<string, string>;
    /** Flows that hold a connection by name inside their definition. */
    byName: Record<string, { id: string; name: string }[]>;
    // switches
    appsFail?: string;
    usage?: Record<string, unknown>[];
    /** The definitions (`clientdata`) of flows by workflow id: what reading a flow of the inventory gives back; a flow missing here is not in the workflow table. */
    flowDefs?: Record<string, { name: string; clientdata: string }>;
    referencesFail?: string;
    flowSearch?: 'refused';
    agentsFail?: boolean;
    typeFail?: boolean;
    dependentsFail?: string;
    pageSize?: number;
    listFail?: string;
}

export const emptyWorld = (over: Partial<World> = {}): World => ({ connections: [], references: [], dependents: {}, flows: {}, agents: {}, apps: [], membership: {}, solutions: {}, byName: {}, ...over });

const seedToApi = (c: ConnectionSeed) => ({
    id: `/providers/Microsoft.PowerApps/apis/${c.connector ?? 'shared_a'}/connections/${c.name}`,
    name: c.name,
    properties: {
        displayName: c.displayName ?? `${c.name}@example.test`,
        createdTime: c.createdTime ?? '2026-01-01T00:00:00Z',
        lastModifiedTime: c.modifiedTime ?? '2026-01-02T00:00:00Z',
        createdBy: { displayName: c.creator ?? 'Ann', email: c.creatorEmail ?? 'ann@example.test' },
        ...(c.status === 'none' ? {} : { statuses: [c.status === 'error' ? { status: 'Error', error: { code: 'Forbidden', message: 'Access denied' } } : c.status === 'reconnect' ? { status: 'Error', error: { code: 'Unauthenticated', message: 'Token expired' } } : { status: 'Connected' }] }),
    },
});

export interface WorldHost extends FakeHost {
    world: World;
    calls: { apps: number; lists: string[]; searches: string[]; deleted: string[]; dependents: string[] };
}

const GUIDS = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

export function worldHost(world: World): WorldHost {
    const calls = { apps: 0, lists: [] as string[], searches: [] as string[], deleted: [] as string[], dependents: [] as string[] };
    const deleted = new Set<string>();
    const idsIn = (q: string) => (q.match(GUIDS) ?? []).map(i => i.toLowerCase());
    const base = fakeHost(q => {
        if (q.startsWith('connectionreferences?$select=connectionreferenceid,connectionreferencelogicalname,connectionreferencedisplayname,connectionid')) {
            if (world.referencesFail) throw new Error(world.referencesFail);
            return world.references.map(r => ({ connectionreferenceid: r.id, connectionreferencelogicalname: r.logicalName, connectionreferencedisplayname: r.displayName, connectionid: r.connection }));
        }
        if (q.startsWith("solutioncomponentdefinitions?$select=solutioncomponenttype&$filter=primaryentityname eq 'connectionreference'")) {
            if (world.typeFail) throw new Error('definitions refused');
            return [{ solutioncomponenttype: REF_TYPE }];
        }
        if (q.startsWith('solutioncomponentdefinitions?$select=solutioncomponenttype,name,primaryentityname')) {
            return [{ solutioncomponenttype: 29, name: 'Workflow', primaryentityname: 'workflow' }, { solutioncomponenttype: REF_TYPE, name: 'Connection Reference', primaryentityname: 'connectionreference' }];
        }
        if (q.startsWith('bots?$select=botid,name,statecode,ismanaged,_ownerid_value&$filter=_providerconnectionreferenceid_value')) {
            if (world.agentsFail) throw new Error('bots refused');
            const ref = idsIn(q)[0] ?? '';
            return (world.agents[ref] ?? []).map(a => ({ botid: a.id, name: a.name, ismanaged: false, _ownerid_value: '' }));
        }
        if (q.includes('/botcomponent_connectionreference')) return [];
        if (q.startsWith('workflows?$select=workflowid,name,statecode,category,ismanaged,_ownerid_value&$filter=')) {
            return idsIn(q).filter(i => world.flows[i]).map(i => ({ workflowid: i, name: world.flows[i]!.name, statecode: world.flows[i]!.state ?? 1, category: 5, ismanaged: false, _ownerid_value: '' }));
        }
        if (q.startsWith('workflows?$select=workflowid,name,statecode,clientdata&$filter=')) {
            return idsIn(q).filter(i => world.flowDefs?.[i]).map(i => ({ workflowid: i, name: world.flowDefs![i]!.name, statecode: 1, clientdata: world.flowDefs![i]!.clientdata }));
        }
        if (q.startsWith('solutioncomponents?$select=objectid,_solutionid_value&$filter=')) {
            return idsIn(q).flatMap(i => (world.membership[i] ?? []).map(s => ({ objectid: i, _solutionid_value: s })));
        }
        if (q.startsWith('solutions?$select=solutionid,friendlyname,uniquename&$filter=')) {
            return idsIn(q).filter(i => world.solutions[i]).map(i => ({ solutionid: i, friendlyname: world.solutions[i], uniquename: `u_${i.slice(0, 4)}` }));
        }
        return [];
    });
    const h: WorldHost = {
        ...base,
        world,
        calls,
        async environmentId() { return 'env-1'; },
        async listConnections(_env, next = '') {
            calls.lists.push(next);
            if (world.listFail) throw new Error(world.listFail);
            const all = world.connections.filter(c => !deleted.has(c.name));
            const size = world.pageSize ?? all.length + 1;
            const page = next === '' ? 0 : Number(next.replace(/^page-/, ''));
            return { value: all.slice(page * size, page * size + size).map(seedToApi), ...((page + 1) * size < all.length ? { nextLink: `page-${page + 1}` } : {}) };
        },
        async queryConnectorUsage() {
            return { data: world.usage ?? [] };
        },
        async listApps() {
            calls.apps++;
            if (world.appsFail) throw new Error(world.appsFail);
            return { value: world.apps.map(a => ({ name: a.name, properties: { displayName: a.displayName, owner: { displayName: 'Bob' }, connectionReferences: a.connections.map(c => ({ sharedConnectionId: c })) } })) };
        },
        async searchFlowsByConnection(name) {
            calls.searches.push(name);
            if (world.flowSearch === 'refused') throw new Error('The filter is not supported on this column.');
            return (world.byName[name] ?? []).map(f => ({ workflowid: f.id, name: f.name, statecode: 1, _ownerid_value: '' }));
        },
        async dependents(_type, id) {
            calls.dependents.push(id);
            if (world.dependentsFail) throw new Error(world.dependentsFail);
            return world.dependents[id.toLowerCase()] ?? [];
        },
        async deleteConnection(_env, _connector, name) {
            calls.deleted.push(name);
            deleted.add(name);
        },
    };
    return h;
}

/** A guid for a test world; the same number gives the same guid. */
export const g = (n: number): string => guid(n);
