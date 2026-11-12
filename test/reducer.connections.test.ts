import { describe, expect, it, vi } from 'vitest';
import { allOk, mergeReport, type SourceName, type SourceState } from '../src/model/connectionDeps';
import { planConnectionDeletion } from '../src/model/connectionPlan';
import { actionRunning } from '../src/state/running';
import { CONN_PAGE, connectionsStep, emptyConnections, shownNames, type ConnectionsAction, type ConnectionsState } from '../src/state/connectionsState';
import { initialState, reducer } from '../src/state/reducer';
import type { ConnectionDependent, ConnectionRow } from '../src/types';

// Feature 024: the state of the Connections area. Pure; synthetic data only.

const row = (name: string, over: Partial<ConnectionRow> = {}): ConnectionRow => ({
    name, connectorKey: 'alpha', connectorName: 'Alpha', displayName: name, status: 'connected', statusDetail: '', createdTime: '', modifiedTime: '', creator: { name: 'Ann', email: 'ann@example.test' }, ...over,
});
const dep: ConnectionDependent = { kind: 'flow', id: 'f1', name: 'Flow', state: 'On', ownerName: '', solutions: [], via: '' };
const report = (found: ConnectionDependent[] = [], over: Partial<Record<SourceName, SourceState>> = {}) => mergeReport(found, { ...allOk(), ...over });
const run = (c: ConnectionsState, ...actions: ConnectionsAction[]) => actions.reduce(connectionsStep, c);
const loaded = (names: string[] = ['a', 'b', 'c']) => run(emptyConnections(), { type: 'cmLoading' }, { type: 'cmLoaded', items: names.map(n => row(n)), environmentId: 'env-1' });

describe('loading the list', () => {
    it('loading drops what was read about the old list but keeps filter, search and sort', () => {
        let c = run(loaded(), { type: 'cmFilter', filter: 'broken' }, { type: 'cmSearch', text: 'x' }, { type: 'cmSort', key: 'status' }, { type: 'cmDepsLoaded', name: 'a', report: report() }, { type: 'cmToggle', name: 'a' });
        expect(c.selected).toEqual(['a']);
        c = run(c, { type: 'cmLoading' });
        expect(c).toMatchObject({ filter: 'broken', search: 'x', sort: { key: 'status', dir: 'asc' }, deps: {}, selected: [], checkAll: null });
        expect(c.list.status).toBe('loading');
    });
    it('counts the pages that arrive only while loading', () => {
        expect(run(emptyConnections(), { type: 'cmPage', count: 5 }).list.read).toBe(0);
        expect(run(emptyConnections(), { type: 'cmLoading' }, { type: 'cmPage', count: 5 }).list.read).toBe(5);
    });
    it('a loaded list closes the rows that are gone and drops deps, selection and the check', () => {
        let c = run(loaded(), { type: 'cmToggleOpen', name: 'a' }, { type: 'cmToggleOpen', name: 'b' }, { type: 'cmDepsLoaded', name: 'a', report: report() }, { type: 'cmToggle', name: 'a' }, { type: 'cmCheckAllStarted', total: 2, now: 1 });
        c = run(c, { type: 'cmLoaded', items: [row('b'), row('z')], environmentId: 'env-1' });
        expect(c.open).toEqual(['b']);
        expect(c).toMatchObject({ selected: [], deps: {}, checkAll: null });
        expect(c.list).toMatchObject({ status: 'ready', read: 2 });
    });
    it('a failure keeps what was on the screen and says why', () => {
        const c = run(loaded(), { type: 'cmFailed', error: 'no access' });
        expect(c.list).toMatchObject({ status: 'failed', error: 'no access' });
        expect(c.list.items).toHaveLength(3);
    });
});

describe('filter, search, sort, paging, open rows', () => {
    it('sort toggles the direction on the same key and starts ascending on a new one', () => {
        let c = run(emptyConnections(), { type: 'cmSort', key: 'name' });
        expect(c.sort).toEqual({ key: 'name', dir: 'desc' });
        c = run(c, { type: 'cmSort', key: 'status' });
        expect(c.sort).toEqual({ key: 'status', dir: 'asc' });
    });
    it('Show more adds a page and a new filter or search goes back to the first page', () => {
        let c = run(emptyConnections(), { type: 'cmShowMore' });
        expect(c.shown).toBe(CONN_PAGE * 2);
        c = run(c, { type: 'cmSearch', text: 'q' });
        expect(c.shown).toBe(CONN_PAGE);
    });
    it('a row opens and closes', () => {
        const c = run(emptyConnections(), { type: 'cmToggleOpen', name: 'a' });
        expect(c.open).toEqual(['a']);
        expect(run(c, { type: 'cmToggleOpen', name: 'a' }).open).toEqual([]);
    });
    it('the selection keeps only the rows still shown and still eligible', () => {
        let c = run(loaded(['xq', 'b', 'c']), { type: 'cmDepsLoaded', name: 'xq', report: report() }, { type: 'cmDepsLoaded', name: 'b', report: report() }, { type: 'cmToggle', name: 'xq' }, { type: 'cmToggle', name: 'b' });
        expect(c.selected).toEqual(['xq', 'b']);
        c = run(c, { type: 'cmSearch', text: 'xq' });
        expect(c.selected).toEqual(['xq']);
        expect(shownNames(c)).toEqual(['xq']);
    });
});

describe('dependencies and eligibility', () => {
    it('loading marks the names, a loaded answer fills it, a failed one says why', () => {
        let c = run(loaded(), { type: 'cmDepsLoading', names: ['a', 'b'] });
        expect(c.deps['a']).toEqual({ status: 'loading' });
        c = run(c, { type: 'cmDepsLoaded', name: 'a', report: report([dep]) }, { type: 'cmDepsFailed', name: 'b', error: 'boom' });
        expect(c.deps['a']).toMatchObject({ status: 'ready' });
        expect(c.deps['b']).toEqual({ status: 'failed', error: 'boom' });
    });
    it('an answer for a connection that left the list is ignored', () => {
        const c = run(loaded(), { type: 'cmDepsLoaded', name: 'gone', report: report() }, { type: 'cmDepsFailed', name: 'gone', error: 'x' });
        expect(c.deps).toEqual({});
    });
    it('only an eligible connection can be ticked: unchecked, in use or with a failed source are refused', () => {
        let c = run(loaded(['a', 'b', 'c', 'd']),
            { type: 'cmDepsLoaded', name: 'a', report: report() },
            { type: 'cmDepsLoaded', name: 'b', report: report([dep]) },
            { type: 'cmDepsLoaded', name: 'c', report: report([], { apps: { status: 'failed', reason: 'x' } }) });
        for (const n of ['a', 'b', 'c', 'd']) c = run(c, { type: 'cmToggle', name: n });
        expect(c.selected).toEqual(['a']);
        c = run(c, { type: 'cmToggle', name: 'a' });
        expect(c.selected).toEqual([]);
    });
    it('Select eligible ticks exactly the eligible rows that are shown, and Clear empties it', () => {
        let c = run(loaded(['a', 'b', 'c']), { type: 'cmDepsLoaded', name: 'a', report: report() }, { type: 'cmDepsLoaded', name: 'b', report: report() }, { type: 'cmDepsLoaded', name: 'c', report: report([dep]) });
        c = run(c, { type: 'cmSelectEligible' });
        expect(c.selected).toEqual(['a', 'b']);
        expect(run(c, { type: 'cmClearSelection' }).selected).toEqual([]);
    });
    it('a dependency read that shows a row in use drops it from the selection', () => {
        let c = run(loaded(['a']), { type: 'cmDepsLoaded', name: 'a', report: report() }, { type: 'cmToggle', name: 'a' });
        expect(c.selected).toEqual(['a']);
        c = run(c, { type: 'cmDepsLoaded', name: 'a', report: report([dep]) });
        expect(c.selected).toEqual([]);
    });
});

describe('Check all', () => {
    it('starts, steps, progresses, can be cancelled and finishes', () => {
        let c = run(loaded(), { type: 'cmCheckAllStarted', total: 3, now: 10 });
        expect(c.checkAll).toMatchObject({ total: 3, done: 0, step: 'apps', cancelled: false, startedAt: 10 });
        c = run(c, { type: 'cmCheckAllStep', step: 'connections' }, { type: 'cmCheckAllProgress', done: 2, now: 50 }, { type: 'cmCheckAllCancel' });
        expect(c.checkAll).toMatchObject({ step: 'connections', done: 2, now: 50, cancelled: true });
        expect(run(c, { type: 'cmCheckAllFinished' }).checkAll).toBeNull();
    });
    it('a step, progress or cancel with no run does nothing', () => {
        const c = loaded();
        expect(run(c, { type: 'cmCheckAllStep', step: 'apps' }, { type: 'cmCheckAllProgress', done: 1, now: 1 }, { type: 'cmCheckAllCancel' })).toEqual(c);
    });
});

describe('the area switch and the running rule', () => {
    it('switches the area, and the Connections area cannot be left while a run is going', () => {
        let s = reducer(initialState(), { type: 'setArea', area: 'connections' });
        expect(s.area).toBe('connections');
        s = reducer(s, { type: 'cmLoading' });
        s = reducer(s, { type: 'cmLoaded', items: [row('a')], environmentId: 'e' });
        s = reducer(s, { type: 'cmCheckAllStarted', total: 1, now: 1 });
        expect(reducer(s, { type: 'setArea', area: 'solutions' }).area).toBe('connections');
        s = reducer(s, { type: 'cmCheckAllFinished' });
        expect(reducer(s, { type: 'setArea', area: 'solutions' }).area).toBe('solutions');
    });
    it('counts a list reading, a dependency reading, Check all and an apply as an action running', () => {
        const base = initialState();
        expect(actionRunning(base)).toBe(false);
        expect(actionRunning(reducer(base, { type: 'cmLoading' }))).toBe(true);
        let s = reducer(reducer(base, { type: 'cmLoading' }), { type: 'cmLoaded', items: [row('a')], environmentId: 'e' });
        expect(actionRunning(s)).toBe(false);
        expect(actionRunning(reducer(s, { type: 'cmDepsLoading', names: ['a'] }))).toBe(true);
        s = reducer(s, { type: 'cmCheckAllStarted', total: 1, now: 1 });
        expect(actionRunning(s)).toBe(true);
    });
});

describe('the deletion dialog', () => {
    const ready = () => run(loaded(['a', 'b']), { type: 'cmDepsLoaded', name: 'a', report: report() }, { type: 'cmDepsLoaded', name: 'b', report: report() }, { type: 'cmToggle', name: 'a' });
    const plan = (c: ConnectionsState) => planConnectionDeletion(c.list.items, c.deps, c.selected);

    it('cannot be opened while the flag is off, which is how it ships', async () => {
        vi.resetModules();
        vi.doMock('../src/features', () => ({ features: { connectionDelete: false } }));
        const m = await import('../src/state/connectionsState');
        const c = ready();
        expect(m.connectionsStep(c, { type: 'cmDeletionOpen', plan: plan(c), code: 'DELETE-AB12' }).deletion).toBeNull();
        vi.doUnmock('../src/features');
    });

    describe('with the flag on (mocked)', () => {
        const withFlag = async () => {
            vi.resetModules();
            vi.doMock('../src/features', () => ({ features: { connectionDelete: true } }));
            return import('../src/state/connectionsState');
        };
        const setup = (m: typeof import('../src/state/connectionsState')) => {
            const step = (c: ConnectionsState, ...as: ConnectionsAction[]) => as.reduce(m.connectionsStep, c);
            let c = step(m.emptyConnections(), { type: 'cmLoading' }, { type: 'cmLoaded', items: [row('a'), row('b')], environmentId: 'e' }, { type: 'cmDepsLoaded', name: 'a', report: report() }, { type: 'cmToggle', name: 'a' });
            const p = planConnectionDeletion(c.list.items, c.deps, c.selected);
            return { step, c, p };
        };

        it('opens from a plan with something to write and not from an empty one, and not twice', async () => {
            const m = await withFlag();
            const { step, c, p } = setup(m);
            const opened = step(c, { type: 'cmDeletionOpen', plan: p, code: 'DELETE-AB12' });
            expect(opened.deletion).toMatchObject({ step: 'preview', typedCode: '', ack: false, backupSaved: false });
            expect(step(opened, { type: 'cmDeletionOpen', plan: p, code: 'OTHER' }).deletion!.code).toBe('DELETE-AB12');
            const empty = planConnectionDeletion(c.list.items, c.deps, []);
            expect(step(c, { type: 'cmDeletionOpen', plan: empty, code: 'X' }).deletion).toBeNull();
            vi.doUnmock('../src/features');
        });

        it('Apply needs the exact code and the acknowledgement, and is never reachable otherwise', async () => {
            const m = await withFlag();
            const { step, c, p } = setup(m);
            let d = step(c, { type: 'cmDeletionOpen', plan: p, code: 'DELETE-AB12' }, { type: 'cmDeletionPortalAll', on: true }); // the portal is confirmed: only the code and the acknowledgement can stop it
            expect(step(d, { type: 'cmDeletionApply', now: 1 }).deletion!.step).toBe('preview');
            d = step(d, { type: 'cmDeletionTyped', text: 'delete-ab12' });
            d = step(d, { type: 'cmDeletionAck', on: true });
            expect(step(d, { type: 'cmDeletionApply', now: 1 }).deletion!.step).toBe('preview'); // wrong case
            d = step(d, { type: 'cmDeletionTyped', text: ' DELETE-AB12 ' });
            expect(step(d, { type: 'cmDeletionApply', now: 1 }).deletion!.step).toBe('apply'); // the exact code, the acknowledgement and the portal: it starts
            // the portal confirmation is a third lock of its own
            d = step(d, { type: 'cmDeletionPortalAll', on: false });
            expect(step(d, { type: 'cmDeletionApply', now: 1 }).deletion!.step).toBe('preview'); // not confirmed in the portal yet
            expect(step(d, { type: 'cmDeletionPortal', name: 'zzz', on: true }).deletion!.portalChecked).toEqual([]); // not a row of the run
            d = step(d, { type: 'cmDeletionPortal', name: 'a', on: true });
            expect(d.deletion!.portalChecked).toEqual(['a']);
            expect(step(d, { type: 'cmDeletionApply', now: 1 }).deletion!.step).toBe('apply');
            expect(step(d, { type: 'cmDeletionPortal', name: 'a', on: false }, { type: 'cmDeletionApply', now: 1 }).deletion!.step).toBe('preview');
            d = step(c, { type: 'cmDeletionOpen', plan: p, code: 'DELETE-AB12' }, { type: 'cmDeletionTyped', text: 'DELETE-AB12' }, { type: 'cmDeletionPortalAll', on: true });
            expect(step(d, { type: 'cmDeletionApply', now: 1 }).deletion!.step).toBe('preview'); // no acknowledgement
            vi.doUnmock('../src/features');
        });

        it('runs: rows arrive, the run ends in the result, and the dialog cannot be left during the run', async () => {
            const m = await withFlag();
            const { step, c, p } = setup(m);
            let d = step(c, { type: 'cmDeletionOpen', plan: p, code: 'K' }, { type: 'cmDeletionTyped', text: 'K' }, { type: 'cmDeletionAck', on: true }, { type: 'cmDeletionPortal', name: 'a', on: true }, { type: 'cmDeletionApply', now: 5 });
            expect(d.deletion).toMatchObject({ step: 'apply', total: 1, startedAt: 5 });
            d = step(d, { type: 'cmDeletionRow', outcome: { id: 'a', label: 'a', status: 'done', message: 'Deleted and read back.' }, now: 9 });
            expect(d.deletion!.live).toHaveLength(1);
            expect(step(d, { type: 'cmDeletionClose' }).deletion).not.toBeNull(); // never abandoned
            expect(step(d, { type: 'cmDeletionAck', on: false }).deletion!.ack).toBe(true); // locked controls stay locked
            d = step(d, { type: 'cmDeletionDone', results: d.deletion!.live, refreshFailed: false, now: 11 });
            expect(d.deletion).toMatchObject({ step: 'result', refreshFailed: false });
            const closed = step(d, { type: 'cmDeletionClose' });
            expect(closed.deletion).toBeNull();
            expect(closed.selected).toEqual([]);
            expect(closed.search).toBe(''); // the search that found it does not hide the rest
            vi.doUnmock('../src/features');
        });

        it('closing from the preview keeps the selection', async () => {
            const m = await withFlag();
            const { step, c, p } = setup(m);
            const closed = step(c, { type: 'cmDeletionOpen', plan: p, code: 'K' }, { type: 'cmDeletionClose' });
            expect(closed.deletion).toBeNull();
            expect(closed.selected).toEqual(['a']);
            vi.doUnmock('../src/features');
        });
    });
});

describe('a reload after a deletion (the author, 2026-11-12: closing meant checking everything again)', () => {
    it('keeps what was read about the connections that are still there and drops the others', () => {
        let c = run(loaded(['a', 'b', 'c']), { type: 'cmDepsLoaded', name: 'a', report: report() }, { type: 'cmDepsLoaded', name: 'b', report: report() });
        c = run(c, { type: 'cmLoaded', items: [row('a'), row('c')], environmentId: 'env-1', keepDeps: true });
        expect(Object.keys(c.deps)).toEqual(['a']);
        expect(run(c, { type: 'cmLoaded', items: [row('a')], environmentId: 'env-1' }).deps).toEqual({});
    });
});

describe('closing the Result of a deletion (the author, 2026-11-12: the search stayed and hid everything)', () => {
    it('clears the search, but a Preview closed without a run keeps it', async () => {
        vi.resetModules();
        vi.doMock('../src/features', () => ({ features: { connectionDelete: true } }));
        const m = await import('../src/state/connectionsState');
        const base = [row('a'), row('b')];
        let c = m.connectionsStep(m.connectionsStep(m.emptyConnections(), { type: 'cmLoaded', items: base, environmentId: 'env-1' }), { type: 'cmSearch', text: 'a' });
        c = m.connectionsStep(c, { type: 'cmDepsLoaded', name: 'a', report: report() });
        c = m.connectionsStep(c, { type: 'cmToggle', name: 'a' });
        const plan = planConnectionDeletion(base, c.deps, ['a']);
        const open = m.connectionsStep(c, { type: 'cmDeletionOpen', plan, code: 'K' });
        expect(m.connectionsStep(open, { type: 'cmDeletionClose' }).search).toBe('a');
        const result = { ...open, deletion: { ...open.deletion!, step: 'result' as const, results: [] } };
        expect(m.connectionsStep(result, { type: 'cmDeletionClose' })).toMatchObject({ search: '', deletion: null, selected: [] });
        vi.doUnmock('../src/features');
    });
});
