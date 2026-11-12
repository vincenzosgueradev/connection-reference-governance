import { describe, expect, it } from 'vitest';
import { checkAll, loadConnectionDependencies, loadConnections, makeContext } from '../src/services/connections';
import type { ConnectionRow } from '../src/types';
import { REF_TYPE, emptyWorld, g, worldHost, type World } from './helpers/connectionsWorld';

// Feature 024: reading the connections and what depends on each, and Check all. A synthetic environment; no tenant data.

const row = (name: string): ConnectionRow => ({ name, connectorKey: 'a', connectorName: 'A', displayName: name, status: 'connected', statusDetail: '', createdTime: '', modifiedTime: '', creator: { name: 'Ann', email: '' } });

describe('loadConnections', () => {
    it('reads one page', async () => {
        const h = worldHost(emptyWorld({ connections: [{ name: 'c1' }, { name: 'c2' }] }));
        const r = await loadConnections(h);
        expect(r.ok && r.value.rows.map(x => x.name)).toEqual(['c1', 'c2']);
        expect(r.ok && r.value.environmentId).toBe('env-1');
    });
    it('follows the pages to the end, reports the count so far, and asks for each page by its token', async () => {
        const h = worldHost(emptyWorld({ connections: [1, 2, 3, 4, 5].map(n => ({ name: `c${n}` })), pageSize: 2 }));
        const counts: number[] = [];
        const r = await loadConnections(h, n => counts.push(n));
        expect(r.ok && r.value.rows).toHaveLength(5);
        expect(counts).toEqual([2, 4, 5]);
        expect(h.calls.lists).toEqual(['', 'page-1', 'page-2']);
    });
    it('a failing later page fails the whole read, with the reason, and is never a partial list', async () => {
        const h = worldHost(emptyWorld({ connections: [1, 2, 3].map(n => ({ name: `c${n}` })), pageSize: 1 }));
        const ok = h.listConnections;
        h.listConnections = async (env, next) => (next === 'page-1' ? Promise.reject(new Error('page two broke')) : ok(env, next));
        const r = await loadConnections(h);
        expect(r).toMatchObject({ ok: false, error: expect.stringContaining('page two broke') });
    });
    it('stops a token that comes back instead of looping', async () => {
        const h = worldHost(emptyWorld());
        let n = 0;
        h.listConnections = async () => { n++; return { value: [{ name: `c${n}` }], nextLink: 'same' }; };
        const r = await loadConnections(h);
        expect(r.ok).toBe(true);
        expect(n).toBe(2);
    });
    it('says why when the environment id cannot be read or the list is refused', async () => {
        const noEnv = worldHost(emptyWorld());
        noEnv.environmentId = async () => '';
        expect(await loadConnections(noEnv)).toMatchObject({ ok: false, error: expect.stringContaining('id of the environment') });
        expect(await loadConnections(worldHost(emptyWorld({ listFail: 'no access' })))).toMatchObject({ ok: false, error: expect.stringContaining('no access') });
    });
    it('keeps one row for a name that comes twice', async () => {
        const h = worldHost(emptyWorld({ connections: [{ name: 'x' }, { name: 'x' }] }));
        const r = await loadConnections(h);
        expect(r.ok && r.value.rows).toHaveLength(1);
    });
});

describe('loadConnectionDependencies', () => {
    const ref1 = g(1);
    const flow1 = g(11);
    const flow2 = g(12);
    const bot1 = g(21);
    const world = (over: Partial<World> = {}): World => emptyWorld({
        connections: [{ name: 'used' }, { name: 'free' }],
        references: [{ id: ref1, logicalName: 'sample_ref', displayName: 'Ref one', connection: 'USED' }],
        dependents: { [ref1]: [{ id: flow1, type: 29 }, { id: flow2, type: 29 }] },
        flows: { [flow1]: { name: 'Order sync', state: 1 }, [flow2]: { name: 'Nightly job', state: 0 } },
        agents: { [ref1]: [{ id: bot1, name: 'Help desk' }] },
        apps: [{ name: 'app-1', displayName: 'Orders app', connections: ['used'] }, { name: 'app-2', displayName: 'Other app', connections: ['elsewhere'] }],
        membership: { [ref1]: [g(900)], [flow1]: [g(900), g(901)] },
        solutions: { [g(900)]: 'Sales', [g(901)]: 'Shared' },
        ...over,
    });
    const read = async (w: World, name: string) => {
        const h = worldHost(w);
        const ctx = makeContext(h, 'env-1');
        return { report: await loadConnectionDependencies(h, ctx, row(name)), h };
    };

    it('finds the app, the reference, the flows and the agent of a used connection, by kind, with where they live', async () => {
        const { report } = await read(world(), 'used');
        expect(report.verdict).toBe('in-use');
        const by = (k: string) => report.dependents.filter(d => d.kind === k);
        expect(by('app').map(d => d.name)).toEqual(['Orders app']);
        expect(by('reference').map(d => [d.name, d.solutions])).toEqual([['Ref one', ['Sales']]]);
        expect(by('flow').map(d => d.name).sort()).toEqual(['Nightly job', 'Order sync']);
        expect(by('flow').find(d => d.name === 'Order sync')).toMatchObject({ state: 'On', via: 'Ref one', solutions: ['Sales', 'Shared'] });
        expect(by('agent').map(d => d.name)).toEqual(['Help desk']);
        expect(Object.values(report.sources).map(s => s.status)).toEqual(['ok', 'ok', 'ok', 'ok']);
    });
    it('a connection nothing uses says none-found with every source ok and a note, never "unused"', async () => {
        const { report } = await read(world(), 'free');
        expect(report.verdict).toBe('none-found');
        expect(report.dependents).toEqual([]);
        expect(report.note).toContain('Looked at: 2 apps, 1 connection reference (0 hold it), flows, agents.');
        expect(report.note.toLowerCase()).not.toContain('unused');
    });
    it('matches the connection name without case, in references and in apps', async () => {
        const { report } = await read(world({ apps: [{ name: 'a', displayName: 'App', connections: ['USED'] }] }), 'Used');
        expect(report.dependents.map(d => d.kind)).toContain('app');
        expect(report.dependents.map(d => d.kind)).toContain('reference');
    });
    it('finds a flow outside any solution by the connection name, once even when a reference finds it too', async () => {
        const { report, h } = await read(world({ byName: { used: [{ id: flow1, name: 'Order sync' }, { id: g(13), name: 'Loose flow' }] } }), 'used');
        expect(h.calls.searches).toEqual(['used', 'sample_ref']);
        const names = report.dependents.filter(d => d.kind === 'flow').map(d => d.name).sort();
        expect(names).toEqual(['Loose flow', 'Nightly job', 'Order sync']);
    });
    it('finds a flow that dependency tracking left out by searching the definitions for the name of the reference that holds the connection', async () => {
        const { report, h } = await read(world({ byName: { sample_ref: [{ id: g(14), name: 'FactoryHub-NotifDispatcherV2' }, { id: flow1, name: 'Order sync' }] } }), 'used');
        expect(h.calls.searches).toEqual(['used', 'sample_ref']); // the connection by name, then each reference that holds it
        const flows = report.dependents.filter(d => d.kind === 'flow');
        expect(flows.map(d => d.name).sort()).toEqual(['FactoryHub-NotifDispatcherV2', 'Nightly job', 'Order sync']); // Order sync once, though both sources found it
        expect(flows.find(d => d.name === 'FactoryHub-NotifDispatcherV2')!.via).toBe('Ref one');
        expect(flows.find(d => d.name === 'Order sync')!.solutions).toEqual(['Sales', 'Shared']); // the richer record of the tracking is kept
        expect(report.note).toContain('flows (dependency tracking; the search of their definitions for the reference gave back 2)');
    });
    it('a connection no reference holds is searched by its own name only', async () => {
        const { h } = await read(world(), 'free');
        expect(h.calls.searches).toEqual(['free']);
    });
    it('a refused search of the definitions is not scanned, and the flows found by tracking still show', async () => {
        const { report } = await read(world({ flowSearch: 'refused' }), 'used');
        expect(report.sources.flows.status).toBe('notScanned');
        expect(report.dependents.filter(d => d.kind === 'flow')).toHaveLength(2);
    });
    it('a refused apps list is named, the other sources still answer, and nothing is called free', async () => {
        const { report } = await read(world({ appsFail: 'Forbidden: administrator rights are needed' }), 'free');
        expect(report.sources.apps).toEqual({ status: 'failed', reason: 'Forbidden: administrator rights are needed' });
        expect(report.sources.references.status).toBe('ok');
        expect(report.verdict).toBe('unchecked-source');
        expect(report.note).toContain('Could not read the apps (Forbidden');
    });
    it('a refused apps list does not hide what the other sources found', async () => {
        const { report } = await read(world({ appsFail: 'x' }), 'used');
        expect(report.verdict).toBe('in-use');
        expect(report.dependents.filter(d => d.kind === 'flow')).toHaveLength(2);
    });
    it('a refused flow search is not scanned, never failed, and does not block none-found', async () => {
        const { report } = await read(world({ flowSearch: 'refused' }), 'free');
        expect(report.sources.flows.status).toBe('notScanned');
        expect(report.verdict).toBe('none-found');
        expect(report.note).toContain('Not scanned: flows');
    });
    it('when the references cannot be read the flows and agents are failed too, so a free-looking connection is unchecked', async () => {
        const { report } = await read(world({ referencesFail: 'no rights on connectionreference' }), 'free');
        expect(report.sources.references.status).toBe('failed');
        expect(report.sources.flows.status).toBe('failed');
        expect(report.sources.agents.status).toBe('failed');
        expect(report.verdict).toBe('unchecked-source');
    });
    it('when the type of a reference cannot be read the flows and agents are failed', async () => {
        const { report } = await read(world({ typeFail: true }), 'used');
        expect(report.sources.flows.status).toBe('failed');
        expect(report.sources.agents.status).toBe('failed');
        expect(report.verdict).toBe('in-use'); // the app and the reference were found anyway
    });
    it('when the dependents of a reference cannot be read the flows and agents are failed, the reference is still found', async () => {
        const { report } = await read(world({ dependentsFail: 'RetrieveDependentComponents refused' }), 'used');
        expect(report.sources.flows).toMatchObject({ status: 'failed' });
        expect(report.dependents.some(d => d.kind === 'reference')).toBe(true);
    });
    it('when the agents source cannot be read only the agents source fails', async () => {
        const { report } = await read(world({ agentsFail: true }), 'used');
        expect(report.sources.agents.status).toBe('failed');
        expect(report.sources.flows.status).toBe('ok');
    });
    it('reads the shared sources once for many connections, and again after invalidate', async () => {
        const h = worldHost(world());
        const ctx = makeContext(h, 'env-1');
        await loadConnectionDependencies(h, ctx, row('used'));
        await loadConnectionDependencies(h, ctx, row('free'));
        expect(h.calls.apps).toBe(1);
        expect(h.queries.filter(q => q.startsWith('connectionreferences?$select=connectionreferenceid,connectionreferencelogicalname,connectionreferencedisplayname,connectionid'))).toHaveLength(1);
        ctx.invalidate();
        await loadConnectionDependencies(h, ctx, row('free'));
        expect(h.calls.apps).toBe(2);
    });
    it('never writes', async () => {
        const { h } = await read(world(), 'used');
        expect(h.updates).toEqual([]);
        expect(h.calls.deleted).toEqual([]);
    });
    it('uses the component type that the environment reports for a connection reference', async () => {
        const { h } = await read(world(), 'used');
        expect(h.calls.dependents).toEqual([ref1]);
        expect(REF_TYPE).toBe(10001);
    });
});

describe('readable reasons', () => {
    it('cuts the wrapper of the remote call and says a permission refusal in words', async () => {
        const { message } = await import('../src/services/connections');
        expect(message(new Error("Error invoking remote method 'powerplatform.request': Error: Power Platform request failed: Forbidden: no rights"))).toBe('Forbidden: no rights');
        expect(message(new Error("Error invoking remote method 'x': Error: Power Platform request failed: ClientScopeAuthorizationFailed: The caller does not have permission"))).toContain('not allowed to call this API');
        expect(message('plain')).toBe('plain');
    });
});

describe('checkAll', () => {
    const names = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const setup = (over: Partial<World> = {}) => {
        const h = worldHost(emptyWorld({ connections: names.map(n => ({ name: n })), ...over }));
        const ctx = makeContext(h, 'env-1');
        const rows = names.map(row);
        const log = { steps: [] as string[], progress: [] as string[], results: new Map<string, unknown>() };
        let cancelAfter = Infinity;
        const hooks = {
            onStep: (s: string) => log.steps.push(s),
            onProgress: (d: number, t: number) => log.progress.push(`${d}/${t}`),
            onResult: (n: string, r: unknown) => log.results.set(n, r),
            cancelled: () => log.results.size >= cancelAfter,
        };
        return { h, ctx, rows, log, hooks, cancelAfter: (n: number) => { cancelAfter = n; } };
    };

    it('reads the two shared sources first, as steps, then every connection', async () => {
        const { h, ctx, rows, log, hooks } = setup();
        const r = await checkAll(h, ctx, rows, hooks);
        expect(log.steps).toEqual(['apps', 'references', 'connections']);
        expect(r).toEqual({ done: 7, cancelled: false });
        expect([...log.results.keys()].sort()).toEqual(names);
        expect(log.progress.at(-1)).toBe('7/7');
        expect(h.calls.apps).toBe(1);
    });
    it('never runs more than four at a time', async () => {
        const { h, ctx, rows, hooks } = setup();
        let running = 0;
        let peak = 0;
        const search = h.searchFlowsByConnection;
        h.searchFlowsByConnection = async n => {
            running++;
            peak = Math.max(peak, running);
            await new Promise(r => setTimeout(r, 5));
            const out = await search(n);
            running--;
            return out;
        };
        await checkAll(h, ctx, rows, hooks);
        expect(peak).toBeLessThanOrEqual(4);
        expect(peak).toBeGreaterThan(1);
    });
    it('a cancel keeps what was read and starts nothing new', async () => {
        const { h, ctx, rows, log, hooks, cancelAfter } = setup();
        cancelAfter(3);
        const r = await checkAll(h, ctx, rows, hooks);
        expect(r.cancelled).toBe(true);
        expect(log.results.size).toBeGreaterThanOrEqual(3);
        expect(log.results.size).toBeLessThan(7);
    });
    it('a failed apps read marks every connection as unchecked-source, none as free', async () => {
        const { h, ctx, rows, log, hooks } = setup({ appsFail: 'denied' });
        await checkAll(h, ctx, rows, hooks);
        for (const v of log.results.values()) expect((v as { verdict: string }).verdict).toBe('unchecked-source');
    });
    it('a failing listener never stops the run and an unexpected error in one connection is reported for it alone', async () => {
        const { h, ctx, rows, log, hooks } = setup();
        const search = h.searchFlowsByConnection;
        h.searchFlowsByConnection = async n => { if (n === 'c') throw new TypeError('boom'); return search(n); };
        // a thrown search is only "not scanned"; make the references read blow up for one connection instead
        const ctxRefs = ctx.references;
        let calls = 0;
        ctx.references = async () => { calls++; if (calls === 4) throw new Error('unexpected'); return ctxRefs(); };
        const r = await checkAll(h, ctx, rows, { ...hooks, onProgress: () => { throw new Error('listener'); } });
        expect(r.done).toBe(7);
        expect([...log.results.values()].some(v => (v as { error?: string }).error === 'unexpected')).toBe(true);
    });
});

describe('the connections that belong to a flow (the author, 2026-11-12: they confused the list)', () => {
    it('are not listed at all', async () => {
        const { emptyWorld, worldHost } = await import('./helpers/connectionsWorld');
        const { loadConnections } = await import('../src/services/connections');
        const h = worldHost(emptyWorld({ connections: [{ name: 'c1' }, { name: 'lf1', connector: 'shared_logicflows' }] }));
        const res = await loadConnections(h);
        expect(res.ok && res.value.rows.map(r => r.name)).toEqual(['c1']);
    });
});
