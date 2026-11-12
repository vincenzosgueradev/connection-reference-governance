import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectionDeleteRoute, createHost, pagedPath, portalAddress, SEARCHABLE_NAME } from '../src/host';

// Feature 024: the requests the host sends for the Connections area. The toolbox is stubbed; nothing is called for real.

const calls: { api: string; method: string; path: string }[] = [];
const queries: string[] = [];
const copied: string[] = [];

function stub() {
    const category = (api: string) => ({
        Get: async (path: string) => { calls.push({ api, method: 'GET', path }); return { value: [] }; },
        Delete: async (path: string) => { calls.push({ api, method: 'DELETE', path }); },
    });
    (globalThis as unknown as { window: unknown }).window = {
        powerplatformAPI: { Connectivity: category('Connectivity'), PowerApps: category('PowerApps') },
        dataverseAPI: { queryData: async (q: string) => { queries.push(q); return { value: [{ workflowid: 'w1' }] }; } },
        toolboxAPI: { utils: { copyToClipboard: async (t: string) => { copied.push(t); } } },
    };
}

beforeEach(() => {
    calls.length = 0;
    queries.length = 0;
    copied.length = 0;
    stub();
});
afterEach(() => {
    vi.resetModules();
    delete (globalThis as unknown as { window?: unknown }).window;
});

describe('pagedPath', () => {
    const base = 'environments/e/connections?api-version=2024-10-01';
    it('is the path itself for the first page', () => expect(pagedPath(base, '')).toBe(base));
    it('sends a bare token as $skiptoken, encoded', () => expect(pagedPath(base, 'a b/c')).toBe(`${base}&$skiptoken=a%20b%2Fc`));
    it('keeps the query of a whole nextLink and drops its host, so the category base is not doubled', () => {
        const p = pagedPath(base, 'https://api.example.test/connectivity/environments/e/connections?api-version=2024-10-01&$skiptoken=zz');
        expect(p).toBe('environments/e/connections?api-version=2024-10-01&$skiptoken=zz');
    });
    it('adds the api-version when a nextLink query has none', () => {
        expect(pagedPath(base, 'https://x.test/p?$skiptoken=1')).toBe('environments/e/connections?$skiptoken=1&api-version=2024-10-01');
    });
});

describe('the list of connections and of apps', () => {
    it('reads the connections page by page from the Connectivity category, read only', async () => {
        await createHost().listConnections('env-1');
        await createHost().listConnections('env-1', 'tok');
        expect(calls).toEqual([
            { api: 'Connectivity', method: 'GET', path: 'environments/env-1/connections?api-version=2024-10-01' },
            { api: 'Connectivity', method: 'GET', path: 'environments/env-1/connections?api-version=2024-10-01&$skiptoken=tok' },
        ]);
    });
    it('reads the apps from the Power Apps category with a page size, read only', async () => {
        await createHost().listApps('env-1');
        expect(calls).toEqual([{ api: 'PowerApps', method: 'GET', path: 'environments/env-1/apps?api-version=2024-10-01&$top=100' }]);
    });
});

describe('the search of flows by connection name', () => {
    it('filters cloud flows with contains on clientdata, for a plain name', async () => {
        const rows = await createHost().searchFlowsByConnection('shared-abc.1_x');
        expect(queries).toEqual(["workflows?$select=workflowid,name,statecode,_ownerid_value&$filter=category eq 5 and contains(clientdata,'shared-abc.1_x')"]);
        expect(rows).toHaveLength(1);
    });
    it("refuses a name with a quote or a space before anything is sent", async () => {
        for (const bad of ["a'b", 'a b', '', "x') or (1 eq 1"]) {
            await expect(createHost().searchFlowsByConnection(bad), bad).rejects.toThrow(/cannot be searched/);
        }
        expect(queries).toEqual([]);
        expect(SEARCHABLE_NAME.test('ok-name_1.2')).toBe(true);
    });
});

describe('deleting a connection is guarded', () => {
    it('rejects while the flag is off and never reaches the toolbox', async () => {
        vi.resetModules();
        vi.doMock('../src/features', () => ({ features: { connectionDelete: false } }));
        const { createHost: create } = await import('../src/host');
        await expect(create().deleteConnection('env-1', 'shared_a', 'conn-1')).rejects.toThrow('Deleting connections is switched off.');
        expect(calls.filter(c => c.method === 'DELETE')).toEqual([]);
        vi.doUnmock('../src/features');
    });
    it('the route is built in one place: the one that the live check found accepted', () => {
        expect(connectionDeleteRoute('env-1', 'shared_a', 'conn-1')).toBe('environments/env-1/connectors/shared_a/connections/conn-1?api-version=2024-10-01');
        expect(connectionDeleteRoute('env-1', 'a', 'conn-1')).toBe('environments/env-1/connectors/shared_a/connections/conn-1?api-version=2024-10-01');
    });
    it('with the flag on (mocked) it sends one DELETE through the Connectivity category', async () => {
        vi.resetModules();
        vi.doMock('../src/features', () => ({ features: { connectionDelete: true } }));
        const { createHost: create } = await import('../src/host');
        await create().deleteConnection('env-1', 'shared_a', 'conn-1');
        expect(calls).toEqual([{ api: 'Connectivity', method: 'DELETE', path: 'environments/env-1/connectors/shared_a/connections/conn-1?api-version=2024-10-01' }]);
        vi.doUnmock('../src/features');
    });
    it('an error of the environment goes up as it is: nothing else is tried', async () => {
        vi.resetModules();
        vi.doMock('../src/features', () => ({ features: { connectionDelete: true } }));
        const w = (globalThis as unknown as { window: { powerplatformAPI: Record<string, { Delete?: (p: string) => Promise<void> }> } }).window;
        w.powerplatformAPI['Connectivity']!.Delete = async (p: string) => { calls.push({ api: 'Connectivity', method: 'DELETE', path: p }); throw new Error('Forbidden: you cannot delete this connection'); };
        const { createHost: create } = await import('../src/host');
        await expect(create().deleteConnection('env-1', 'a', 'c1')).rejects.toThrow('Forbidden');
        expect(calls).toHaveLength(1);
        vi.doUnmock('../src/features');
    });
});

describe('the address in the Maker portal', () => {
    it('is the page of one connection when the connector and the name are given, otherwise the connections page of the environment', () => {
        expect(portalAddress('env-1', 'shared_a', 'conn-1')).toBe('https://make.powerapps.com/environments/env-1/connections/shared_a/conn-1/details');
        expect(portalAddress('env-1', 'a', 'conn-1')).toBe('https://make.powerapps.com/environments/env-1/connections/shared_a/conn-1/details');
        expect(portalAddress('env-1')).toBe('https://make.powerapps.com/environments/env-1/connections');
        expect(portalAddress('env-1', 'a')).toBe('https://make.powerapps.com/environments/env-1/connections');
    });
    it('encodes what it is given, so a name can never change the address', () => {
        expect(portalAddress('e/1', 'a b', 'c?d')).toBe('https://make.powerapps.com/environments/e%2F1/connections/shared_a%20b/c%3Fd/details');
    });
});

describe('copying a text', () => {
    it('goes through the toolbox clipboard and nowhere else', async () => {
        const copied: string[] = [];
        const w = (globalThis as unknown as { window: { toolboxAPI?: { utils?: { copyToClipboard?: (t: string) => Promise<void> } } } }).window;
        w.toolboxAPI = { utils: { copyToClipboard: async (t: string) => { copied.push(t); } } };
        await createHost().copyText('hello');
        expect(copied).toEqual(['hello']);
    });
});

describe('adding a component to a solution', () => {
    it('sends the id, the component type, the solution and no required components, as an unbound action', async () => {
        const executed: unknown[] = [];
        (globalThis as unknown as { window: { dataverseAPI: Record<string, unknown> } }).window.dataverseAPI['execute'] = async (r: unknown) => { executed.push(r); };
        await createHost().addToSolution('sol_one', 'comp-1', 10001);
        expect(executed).toEqual([{ operationName: 'AddSolutionComponent', operationType: 'action', parameters: { ComponentId: 'comp-1', ComponentType: 10001, SolutionUniqueName: 'sol_one', AddRequiredComponents: false } }]);
    });
});
