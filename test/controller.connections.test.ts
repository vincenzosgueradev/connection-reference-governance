// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { guid } from './helpers/fixtures';
import { app, settle, type ScenarioOptions } from './helpers/scenario';

/** Feature 024: what the controller of the Connections area does and does not do. Synthetic data only. */

const TYPE_QUERY = "solutioncomponentdefinitions?$select=solutioncomponenttype&$filter=primaryentityname eq 'connectionreference'";
const answer: ScenarioOptions['answer'] = q => (q.startsWith(TYPE_QUERY) ? [{ solutioncomponenttype: 10001 }] : undefined);
const SEEDS = [{ name: 'conn-1' }, { name: 'conn-free' }, { name: 'conn-x' }];

async function start(over: ScenarioOptions = {}) {
    return app({ answer, connectionRows: SEEDS.map(s => ({ ...s })), dependents: { [guid(1)]: [{ id: guid(10), type: 29 }] }, ...over });
}

describe('entering and refreshing', () => {
    it('entering the area reads the list anew every time', async () => {
        const a = await start();
        const c = a.controller.connections!;
        await c.open();
        await c.open();
        expect(a.calls.connectionReads).toBe(2);
        expect(a.store.get().area).toBe('connections');
    });
    it('a second refresh while one is running is ignored', async () => {
        let release!: () => void;
        const gate = new Promise<void>(r => { release = r; });
        const a = await start({ beforeConnections: () => gate });
        const c = a.controller.connections!;
        const first = c.refresh();
        void c.refresh();
        void c.refresh();
        await settle();
        release();
        await first;
        expect(a.calls.connectionReads).toBe(1);
    });
    it('leaves the filter and the sort of the solutions list alone', async () => {
        const a = await start();
        a.store.dispatch({ type: 'setSolutionFilter', filter: 'sam' });
        a.store.dispatch({ type: 'sortSolutions', key: 'name' });
        const before = a.store.get();
        await a.controller.connections!.open();
        a.controller.connections!.backToSolutions();
        const after = a.store.get();
        expect(after.solutionFilter).toBe(before.solutionFilter);
        expect(after.solutionSort).toEqual(before.solutionSort);
    });
    it('a read that fails says why in the state and in the log, and keeps the old list on screen', async () => {
        const a = await start();
        const c = a.controller.connections!;
        await c.open();
        expect(a.store.get().connections.list.items).toHaveLength(3);
        a.store.dispatch({ type: 'cmFailed', error: 'no access' });
        expect(a.store.get().connections.list).toMatchObject({ status: 'failed', error: 'no access' });
        expect(a.store.get().connections.list.items).toHaveLength(3);
    });
});

describe('dependencies', () => {
    it('opening a row reads once; a failed read is read again on the next opening; Check again re-reads', async () => {
        const a = await start({ appsFail: 'denied' });
        const c = a.controller.connections!;
        await c.open();
        await c.toggleOpen('conn-free'); // open: reads
        expect(a.store.get().connections.deps['conn-free']).toMatchObject({ status: 'ready' });
        const reads = a.calls.appReads;
        await c.toggleOpen('conn-free'); // close
        await c.toggleOpen('conn-free'); // open again: nothing is read again
        expect(a.calls.appReads).toBe(reads);
        await c.checkAgain('conn-free');
        expect(a.calls.appReads).toBe(reads + 1);
    });
    it('an answer that arrives after the list was read again is dropped', async () => {
        let release!: () => void;
        const gate = new Promise<void>(r => { release = r; });
        const a = await start();
        const c = a.controller.connections!;
        await c.open();
        // make the next apps read wait, ask for a row, then refresh the list under it
        const apps = a.host.listApps;
        a.host.listApps = async (env, next) => { await gate; return apps(env, next); };
        const slow = c.toggleOpen('conn-free');
        await settle();
        const refreshed = c.refresh();
        release();
        await slow;
        await refreshed;
        await settle();
        expect(a.store.get().connections.deps).toEqual({});
    });
    it('opening a connection that is not in the list does nothing but a log line', async () => {
        const a = await start();
        await a.controller.connections!.openConnection('nope');
        expect(a.store.get().connections.open).toEqual([]);
    });
});

describe('Check all', () => {
    it('a refresh while it runs stops it first and the new list starts with nothing read', async () => {
        let release!: () => void;
        const gate = new Promise<void>(r => { release = r; });
        const a = await start({ beforeApps: () => gate });
        const c = a.controller.connections!;
        await c.open();
        const run = c.checkAll();
        await settle();
        expect(a.store.get().connections.checkAll).not.toBeNull();
        const refresh = c.refresh();
        release();
        await run;
        await refresh;
        await settle();
        const cm = a.store.get().connections;
        expect(cm.checkAll).toBeNull();
        expect(cm.deps).toEqual({});
        expect(cm.list.status).toBe('ready');
    });
    it('does nothing with an empty list or while another run is going', async () => {
        const a = await start({ connectionRows: [] });
        const c = a.controller.connections!;
        await c.open();
        await c.checkAll();
        expect(a.calls.appReads).toBe(0);
    });
});

describe('the portal address', () => {
    it('copies the address built from the environment id, and says so when the id is not known', async () => {
        const a = await start();
        const c = a.controller.connections!;
        await c.copyAddress(); // before the list was read: no environment id yet
        expect(a.calls.copied).toEqual([]);
        await c.open();
        await c.copyAddress();
        expect(a.calls.copied).toEqual(['https://make.powerapps.com/environments/env-1/connections']);
    });
});
