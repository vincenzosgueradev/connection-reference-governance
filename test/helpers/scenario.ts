import { expect, vi } from 'vitest';
import { createController } from '../../src/controller';
import type { Host } from '../../src/host';
import { initialState } from '../../src/state/reducer';
import { createStore } from '../../src/state/store';
import type { ConnectionReferenceRow, FlowRow } from '../../src/types';
import { mountMain } from '../../src/views/main';
import { clientData, flow, ref, solution } from './fixtures';

/**
 * A small stand-in for the environment that the whole tool can run against: it answers the queries the tool makes
 * from rows it keeps, applies updates to those rows, and so shows a write exactly as a later read finds it.
 * Only the PPTB door is replaced; every other layer is the real one.
 */

export interface ScenarioOptions {
    references?: ConnectionReferenceRow[];
    flows?: FlowRow[];
    /** What depends on a reference (RetrieveDependentComponents), by reference id. */
    dependents?: Record<string, { id: string; type: number }[]>;
    /** What blocks the deletion of a reference (RetrieveDependenciesForDelete), by reference id. */
    blockers?: Record<string, { id: string; type: number }[]>;
    /** Makes reading the dependents fail with this message; or waits before answering. */
    failDependents?: string;
    beforeDependents?: () => Promise<void>;
    /** Answers a query first (the names of components outside the solution); undefined falls through to the scenario. */
    answer?: (q: string) => Record<string, unknown>[] | undefined;
    /** The connections the Power Platform API lists; 'unavailable' makes the list fail; a function gives them per call. */
    connections?: readonly { name: string; connector: string; displayName: string; createdTime?: string }[] | 'unavailable';
    /** Waits before the row is created / before it is added to the solution, so a test can look at the screen in the middle. */
    beforeCreate?: () => Promise<void>;
    beforeAdd?: () => Promise<void>;
    /** How long the "Created" state is shown before the panel closes (ms); 0 in tests unless asked. */
    celebrateMs?: number;
    /** Waits before the connections are listed, so a test can look at the panel while it reads them. */
    beforeConnections?: () => Promise<void>;
    /** Makes reading the environment id return nothing. */
    noEnvironmentId?: boolean;
    /** Makes the creation of a reference fail with this message. */
    failCreate?: string;
    /** Makes adding a created reference to the solution fail with this message. */
    failAdd?: string;
    /** Makes an update fail with this message. */
    failUpdate?: (id: string) => string | undefined;
    /** Waits before an update is applied, so a test can look at the screen in the middle of a run. */
    beforeUpdate?: (id: string) => Promise<void>;
    /** After the first update, reading the solution fails. */
    failRefresh?: boolean;
    /** Waits before the solution is read again after the write. */
    beforeRefresh?: () => Promise<void>;
    /** Makes turning a flow off or on fail with this message. */
    failState?: (id: string, to: 'off' | 'on') => string | undefined;
    /** The change of state is accepted but nothing changes (the read-back must notice). */
    ignoreState?: boolean;
}

const B = '/providers/Microsoft.PowerApps/apis/shared_b';
export const defaultReferences = (): ConnectionReferenceRow[] => [ref(1), ref(2), ref(3), ref(4, { connectorId: B })];
/** The connections the default scenario lists: the ones the default references hold, plus one nobody uses yet. */
export const defaultConnections = () => [
    { name: 'conn-1', connector: 'shared_a', displayName: 'one@example.test' },
    { name: 'conn-2', connector: 'shared_a', displayName: 'two@example.test' },
    { name: 'conn-3', connector: 'shared_a', displayName: 'three@example.test' },
    { name: 'conn-free', connector: 'shared_a', displayName: 'free@example.test' },
    { name: 'conn-4', connector: 'shared_b', displayName: 'four@example.test' },
];
export const REQUEST = { manual: { type: 'Request', kind: 'Button' } };
export const defaultFlows = (): FlowRow[] => [
    flow(10, ['sample_ref1'], { name: 'Alpha flow', clientData: clientData(['sample_ref1'], {}, REQUEST) }),
    flow(11, ['sample_ref1'], { name: 'Beta flow', clientData: clientData(['sample_ref1'], {}, REQUEST) }),
    flow(12, ['sample_ref1', 'sample_ref4'], { name: 'Gamma flow', clientData: clientData(['sample_ref1', 'sample_ref4'], {}, REQUEST) }),
];

export function scenario(opts: ScenarioOptions = {}) {
    const sol = solution();
    const refs = (opts.references ?? defaultReferences()).map(r => ({ ...r }));
    const flows = (opts.flows ?? defaultFlows()).map(f => ({ ...f }));
    let wrote = false;
    const notMember = new Set<string>(); // created references until they are added to the solution
    let nextId = 500;
    const calls = { dependentReads: [] as string[], connectionReads: 0, created: [] as Record<string, unknown>[], added: [] as { solution: string; id: string; type: number }[], queries: [] as string[], updates: [] as { entity: string; id: string; record: Record<string, unknown> }[], saved: [] as { name: string; content: string }[] };

    const host: Host = {
        async query(q) {
            calls.queries.push(q);
            const custom = opts.answer?.(q);
            if (custom !== undefined) return custom;
            const byId = /\$select=(\w+)&\$filter=\w+ eq ([0-9a-f-]+)$/.exec(q);
            if (byId) {
                const [, col, id] = byId;
                const r = refs.find(x => x.id === id);
                if (r) return [{ [col!]: col === 'connectionid' ? r.connectionId : '' }];
                const f = flows.find(x => x.id === id);
                return f ? [{ [col!]: col === 'statecode' ? f.stateCode : f.clientData }] : [];
            }
            const lname = /connectionreferencelogicalname eq '([^']+)'$/.exec(q);
            if (lname) return refs.filter(r => r.logicalName === lname[1]).map(r => ({ connectionreferenceid: r.id }));
            if (q.startsWith('connectionreferences?') && /connectionreferenceid eq [0-9a-f-]+$/.test(q) && q.includes('connectorid')) {
                const id = /eq ([0-9a-f-]+)$/.exec(q)![1];
                return refs.filter(r => r.id === id).map(r => ({ connectionreferenceid: r.id, connectionreferencelogicalname: r.logicalName, connectionreferencedisplayname: r.displayName, connectorid: r.connectorId, connectionid: r.connectionId, ismanaged: r.managed, _ownerid_value: r.ownerId, _customconnectorid_value: r.customConnectorId }));
            }
            const member = /objectid eq ([0-9a-f-]+)$/.exec(q);
            if (q.startsWith('solutioncomponents?$select=objectid&') && member) return notMember.has(member[1]!) ? [] : [{ objectid: member[1] }];
            if (q.startsWith('systemusers?') && q.includes('internalemailaddress')) return [{ systemuserid: '11111111-1111-4111-8111-111111111111', internalemailaddress: 'owner.a@example.test' }];
            if (q.startsWith('systemusers?')) return [{ systemuserid: '11111111-1111-4111-8111-111111111111', fullname: 'Owner A' }];
            if (q.startsWith('solutions?')) return [{ solutionid: sol.id, friendlyname: sol.name, uniquename: sol.uniqueName, ismanaged: false, version: '1.0.0.0', createdon: '2026-01-01T00:00:00Z' }];
            if (q.startsWith('workflows?$select=workflowid&')) return flows.map(f => ({ workflowid: f.id }));
            if (q.startsWith('solutioncomponents?$select=_solutionid_value')) return flows.map(f => ({ _solutionid_value: sol.id, objectid: f.id }));
            if (q.startsWith('solutioncomponents')) {
                if (wrote && opts.failRefresh) throw new Error('The environment did not answer.');
                if (wrote) await opts.beforeRefresh?.();
                return [...refs.filter(r => !notMember.has(r.id)).map(r => ({ objectid: r.id, componenttype: 10001 })), ...flows.map(f => ({ objectid: f.id, componenttype: 29 }))];
            }
            if (q.startsWith('connectionreferences?')) {
                return refs.map(r => ({ connectionreferenceid: r.id, connectionreferencelogicalname: r.logicalName, connectionreferencedisplayname: r.displayName, connectorid: r.connectorId, connectionid: r.connectionId, ismanaged: r.managed, _ownerid_value: r.ownerId, _customconnectorid_value: r.customConnectorId }));
            }
            if (q.startsWith('workflows?')) {
                return flows.map(f => ({ workflowid: f.id, name: f.name, statecode: f.stateCode, ismanaged: f.managed, clientdata: f.clientData, description: f.description, createdon: f.createdOn, modifiedon: f.modifiedOn, _ownerid_value: f.ownerId }));
            }
            return [];
        },
        async update(entity, id, record) {
            await opts.beforeUpdate?.(id);
            const stateErr = 'statecode' in record ? opts.failState?.(id, record['statecode'] === 0 ? 'off' : 'on') : undefined;
            if (stateErr) throw new Error(stateErr);
            const err = 'statecode' in record ? undefined : opts.failUpdate?.(id);
            if (err) throw new Error(err);
            calls.updates.push({ entity, id, record });
            wrote = true;
            const r = refs.find(x => x.id === id);
            if (r && 'connectionid' in record) r.connectionId = String(record['connectionid']);
            const f = flows.find(x => x.id === id);
            if (f && 'clientdata' in record) f.clientData = String(record['clientdata']);
            if (f && 'statecode' in record && !opts.ignoreState) f.stateCode = Number(record['statecode']);
        },
        async environmentId() {
            return opts.noEnvironmentId ? '' : 'env-1';
        },
        async listConnections(environmentId) {
            calls.connectionReads++;
            await opts.beforeConnections?.();
            if (opts.connections === 'unavailable') throw new Error('The Power Platform API is not enabled for this connection.');
            expect(environmentId).toBe('env-1');
            const list: readonly { name: string; connector: string; displayName: string; createdTime?: string }[] = opts.connections ?? defaultConnections();
            return { value: list.map(c => ({ id: `/providers/Microsoft.PowerApps/apis/${c.connector}/connections/${c.name}`, name: c.name, properties: { displayName: c.displayName, createdTime: c.createdTime ?? '2026-01-01T00:00:00Z' } })) };
        },
        async create(_entity, record) {
            await opts.beforeCreate?.();
            if (opts.failCreate) throw new Error(opts.failCreate);
            const id = `00000000-0000-4000-8000-${String(nextId++).padStart(12, '0')}`;
            calls.created.push(record);
            refs.push({ id, logicalName: String(record['connectionreferencelogicalname']), displayName: String(record['connectionreferencedisplayname']), connectorId: String(record['connectorid']), connectionId: String(record['connectionid'] ?? ''), customConnectorId: '', ownerName: '', ownerId: '11111111-1111-4111-8111-111111111111', managed: false });
            notMember.add(id);
            return id;
        },
        async addToSolution(solution, id, type) {
            await opts.beforeAdd?.();
            if (opts.failAdd) throw new Error(opts.failAdd);
            calls.added.push({ solution, id, type });
            notMember.delete(id);
        },
        async remove(_entity, id) {
            const i = refs.findIndex(r => r.id === id);
            if (i >= 0) refs.splice(i, 1);
        },
        async dependents(_type, id) {
            calls.dependentReads.push(id);
            await opts.beforeDependents?.();
            if (opts.failDependents) throw new Error(opts.failDependents);
            return opts.dependents?.[id] ?? [];
        },
        async dependencies(_type, id) { return opts.blockers?.[id] ?? []; },
        async removeFromSolution() {},
        async currentUserId() {
            return '11111111-1111-4111-8111-111111111111';
        },
        async connectionName() {
            return 'Test';
        },
        async environmentName() {
            return 'Test (Dev)';
        },
        async saveFile(name, content) {
            calls.saved.push({ name, content });
            return true;
        },
        async notify() {},
    };
    return { host, sol, refs, flows, calls };
}

/** The whole app on top of a scenario: store, controller, views, a fake clock. */
export async function app(opts: ScenarioOptions & { tickMs?: number } = {}) {
    document.body.innerHTML = '<nav id="breadcrumb" class="breadcrumb" hidden></nav><main class="main-content"><div id="content"></div></main>';
    const sc = scenario(opts);
    const store = createStore(initialState());
    let now = 1_000_000;
    const clock = vi.fn(() => now);
    const controller = createController(sc.host, store, clock, opts.tickMs ?? 5, undefined, opts.celebrateMs ?? 0);
    const root = document.getElementById('content')!;
    mountMain(root, store, controller, controller.environment);
    await controller.start();
    controller.selectSolution(sc.sol.id);
    await settle();
    return { ...sc, store, controller, root, crumbs: document.getElementById('breadcrumb')!, setNow: (n: number) => { now = n; }, advance: (ms: number) => { now += ms; } };
}

/** Lets pending promises and one short timer run. */
export const settle = (ms = 20) => new Promise<void>(r => setTimeout(r, ms));

export const q = (root: ParentNode, selector: string) => root.querySelector(selector) as HTMLElement | null;
export const qa = (root: ParentNode, selector: string) => [...root.querySelectorAll(selector)] as HTMLElement[];
export const buttonByText = (root: ParentNode, text: string) => qa(root, 'button').find(b => b.textContent!.trim() === text) as HTMLButtonElement | undefined;

/** Opens the studio (the dialog where the choices are made) and presses Review changes in it. */
export function reviewChanges(a: { root: ParentNode; store: { dispatch: (action: never) => void } }): void {
    (a.store.dispatch as (action: { type: 'openStudio' }) => void)({ type: 'openStudio' });
    buttonByText(a.root, 'Review changes')!.click();
}
