import { describe, expect, it } from 'vitest';
import { allOk, type ConnectionDependencyReport, type DepState, type SourceState } from '../src/model/connectionDeps';
import { mergeReport } from '../src/model/connectionDeps';
import { canSelect, connectorsOf, dependencyLabel, eligibleNames, figuresOf, filterRows, isBroken, sortRows, type Deps } from '../src/model/connections';
import type { ConnectionDependent, ConnectionRow } from '../src/types';

// Feature 024: figures, filters, search, sorting, eligibility. Synthetic data only.

const row = (name: string, over: Partial<ConnectionRow> = {}): ConnectionRow => ({
    name, connectorKey: 'alpha', connectorName: 'Alpha', displayName: `${name}@example.test`, status: 'connected', statusDetail: '', createdTime: '2026-01-01T00:00:00Z', modifiedTime: '2026-01-02T00:00:00Z', creator: { name: 'Ann', email: 'ann@example.test' }, ...over,
});
const dep = (n: number): ConnectionDependent => ({ kind: 'flow', id: `f${n}`, name: `Flow ${n}`, state: 'On', ownerName: '', solutions: [], via: '' });
const ready = (found: ConnectionDependent[] = [], sources: Record<string, SourceState> = {}): DepState => ({ status: 'ready', report: mergeReport(found, { ...allOk(), ...sources } as ReturnType<typeof allOk>) });

describe('figures', () => {
    const rows = [row('a'), row('b', { status: 'error' }), row('c', { status: 'reconnect' }), row('d'), row('e')];
    const deps: Deps = { a: ready([dep(1)]), d: ready(), e: ready([], { apps: { status: 'failed', reason: 'denied' } }) };
    it('counts the total and the broken ones (Needs reconnect or Error) always', () => {
        const f = figuresOf(rows, {});
        expect(f).toMatchObject({ total: 5, broken: 2, noneFound: 0, inUse: 0, checked: 0 });
    });
    it('counts no dependency found and in use only for the connections that were read, and not a failed one as free', () => {
        const f = figuresOf(rows, deps);
        expect(f).toMatchObject({ noneFound: 1, inUse: 1, checked: 3 });
    });
    it('a connection still loading or that failed to read at all is not counted', () => {
        const f = figuresOf(rows, { a: { status: 'loading' }, d: { status: 'failed', error: 'x' } });
        expect(f).toMatchObject({ noneFound: 0, inUse: 0, checked: 0 });
    });
});

describe('isBroken and the filters', () => {
    const rows = [row('a'), row('b', { status: 'error' }), row('c', { status: 'reconnect' }), row('d', { connectorKey: 'beta', connectorName: 'Beta' }), row('e', { status: 'unknown' })];
    const deps: Deps = { a: ready([dep(1)]), d: ready() };
    it('unknown is not broken', () => expect(rows.filter(isBroken).map(r => r.name)).toEqual(['b', 'c']));
    it('All keeps everything', () => expect(filterRows(rows, deps, 'all', '', '')).toHaveLength(5));
    it('Broken keeps the broken ones', () => expect(filterRows(rows, deps, 'broken', '', '').map(r => r.name)).toEqual(['b', 'c']));
    it('No dependency found keeps only the checked ones with nothing found', () => expect(filterRows(rows, deps, 'none', '', '').map(r => r.name)).toEqual(['d']));
    it('In use keeps only the checked ones with a dependent', () => expect(filterRows(rows, deps, 'inuse', '', '').map(r => r.name)).toEqual(['a']));
    it('the connector filter keeps one connector', () => expect(filterRows(rows, deps, 'all', 'beta', '').map(r => r.name)).toEqual(['d']));
    it('search looks at name, display name, connector, creator and id, without case', () => {
        expect(filterRows(rows, deps, 'all', '', 'BETA').map(r => r.name)).toEqual(['d']);
        expect(filterRows(rows, deps, 'all', '', 'ann@EXAMPLE').length).toBe(5);
        expect(filterRows(rows, deps, 'all', '', 'e@example').map(r => r.name)).toEqual(['e']);
        expect(filterRows(rows, deps, 'all', '', 'zzz')).toEqual([]);
        expect(filterRows(rows, deps, 'all', '', '   ')).toHaveLength(5);
    });
    it('filters combine', () => expect(filterRows(rows, deps, 'broken', 'beta', '')).toEqual([]));
});

describe('sorting', () => {
    const rows = [row('b', { displayName: 'Bee', modifiedTime: '2026-03-01', connectorName: 'Zed', status: 'connected' }), row('a', { displayName: 'Ant', modifiedTime: '2026-01-01', connectorName: 'Alpha', status: 'error' }), row('c', { displayName: 'Cat', modifiedTime: '2026-02-01', connectorName: 'Mid', status: 'reconnect' })];
    it('by name, either way', () => {
        expect(sortRows(rows, { key: 'name', dir: 'asc' }).map(r => r.name)).toEqual(['a', 'b', 'c']);
        expect(sortRows(rows, { key: 'name', dir: 'desc' }).map(r => r.name)).toEqual(['c', 'b', 'a']);
    });
    it('by connector', () => expect(sortRows(rows, { key: 'connector', dir: 'asc' }).map(r => r.name)).toEqual(['a', 'c', 'b']));
    it('by status the broken ones come first', () => expect(sortRows(rows, { key: 'status', dir: 'asc' }).map(r => r.name)).toEqual(['a', 'c', 'b']));
    it('by last modified', () => expect(sortRows(rows, { key: 'modified', dir: 'desc' }).map(r => r.name)).toEqual(['b', 'c', 'a']));
    it('does not change the list it was given', () => {
        const copy = [...rows];
        sortRows(rows, { key: 'modified', dir: 'asc' });
        expect(rows).toEqual(copy);
    });
});

describe('who can be ticked', () => {
    const rows = [row('a'), row('b'), row('c'), row('d'), row('e'), row('f', { status: 'error' })];
    const deps: Deps = {
        a: ready(), // nothing found, every source answered
        b: ready([dep(1)]), // in use
        c: ready([], { apps: { status: 'failed', reason: 'denied' } }), // a source failed
        d: { status: 'loading' },
        f: ready(), // broken and nothing found: eligible too
    };
    it('only a connection with nothing found and no failed source', () => {
        expect(rows.map(r => canSelect(r, deps))).toEqual([true, false, false, false, false, true]);
        expect(eligibleNames(rows, deps)).toEqual(['a', 'f']);
    });
    it('a not-scanned source does not make it ineligible, a failed one does', () => {
        expect(canSelect(rows[0]!, { a: ready([], { flows: { status: 'notScanned', reason: 'refused' } }) })).toBe(true);
        expect(canSelect(rows[0]!, { a: ready([], { flows: { status: 'failed', reason: 'refused' } }) })).toBe(false);
    });
    it('an unchecked connection is never eligible', () => expect(canSelect(rows[4]!, deps)).toBe(false));
});

describe('the wording of a row', () => {
    const report = (r: ConnectionDependencyReport): DepState => ({ status: 'ready', report: r });
    it('says Not checked, Checking, In use (N), No dependency found and Could not be checked, and never unused', () => {
        const deps: Deps = { l: { status: 'loading' }, i: ready([dep(1), dep(2)]), n: ready(), x: ready([], { apps: { status: 'failed', reason: 'r' } }), f: { status: 'failed', error: 'e' }, z: report(mergeReport([], allOk())) };
        const texts = ['q', 'l', 'i', 'n', 'x', 'f'].map(k => dependencyLabel(deps, k).text);
        expect(texts).toEqual(['Not checked', 'Checking...', 'In use (2)', 'No dependency found', 'Could not be checked', 'Could not be checked']);
        for (const t of texts) expect(t.toLowerCase()).not.toContain('unused');
    });
    it('says Held by N references when only connection references hold the connection, with the reason, and In use (N) as soon as anything else does', () => {
        const ref = (n: number): ConnectionDependent => ({ kind: 'reference', id: `r${n}`, name: `Ref ${n}`, state: '', ownerName: '', solutions: [], via: '' });
        const deps: Deps = { one: ready([ref(1)]), two: ready([ref(1), ref(2)]), mixed: ready([ref(1), dep(1)]) };
        expect(dependencyLabel(deps, 'one').text).toBe('Held by 1 reference');
        expect(dependencyLabel(deps, 'one').title).toContain('no flow, app or agent was found');
        expect(dependencyLabel(deps, 'two').text).toBe('Held by 2 references');
        expect(dependencyLabel(deps, 'mixed').text).toBe('In use (2)');
        expect(dependencyLabel(deps, 'mixed').title).toBeUndefined();
    });
});

describe('connectorsOf', () => {
    it('lists each connector once, by name', () => {
        const rows = [row('a', { connectorKey: 'b', connectorName: 'Beta' }), row('b', { connectorKey: 'a', connectorName: 'Alpha' }), row('c', { connectorKey: 'a', connectorName: 'Alpha' }), row('d', { connectorKey: '', connectorName: '' })];
        expect(connectorsOf(rows)).toEqual([{ key: 'a', name: 'Alpha' }, { key: 'b', name: 'Beta' }]);
    });
});

describe('shortId', () => {
    it('is the first eight hex digits of the unique part of the id, or the last eight characters', async () => {
        const { shortId } = await import('../src/model/connections');
        expect(shortId('shared-webcontents-4B648095-8190-4e4d-9d4e-a5b49bc49528')).toBe('4b648095');
        expect(shortId('conn-free')).toBe('onn-free');
        expect(shortId('ab')).toBe('ab');
    });
});

describe('the Check all pipeline', () => {
    const r = (name: string, key: string, cname: string): ConnectionRow => row(name, { connectorKey: key, connectorName: cname });
    const rows = [r('b2', 'beta', 'Beta'), r('a1', 'alpha', 'Alpha'), r('a2', 'alpha', 'Alpha'), r('b1', 'beta', 'Beta')];
    it('reads by connector, then by name', async () => {
        const { checkOrder } = await import('../src/model/connections');
        expect(checkOrder(rows).map(x => x.name)).toEqual(['a1', 'a2', 'b1', 'b2']);
    });
    it('while the apps are read only the apps are active, and every connector waits', async () => {
        const { pipelineOf } = await import('../src/model/connections');
        const p = pipelineOf(rows, {}, 'apps');
        expect(p).toMatchObject({ apps: 'active', references: 'pending', total: 4, done: 0 });
        expect(p.connectors.map(c => c.state)).toEqual(['pending', 'pending']);
    });
    it('then the references, then the connectors: the first one that is not finished is the active one', async () => {
        const { pipelineOf } = await import('../src/model/connections');
        expect(pipelineOf(rows, {}, 'references')).toMatchObject({ apps: 'done', references: 'active' });
        const none: Deps = {};
        const p0 = pipelineOf(rows, none, 'connections');
        expect(p0).toMatchObject({ apps: 'done', references: 'done' });
        expect(p0.connectors.map(c => [c.name, c.state, c.done, c.total])).toEqual([['Alpha', 'active', 0, 2], ['Beta', 'pending', 0, 2]]);
        const mid: Deps = { a1: ready(), a2: ready(), b1: { status: 'loading' } };
        const p1 = pipelineOf(rows, mid, 'connections');
        expect(p1.connectors.map(c => [c.name, c.state, c.done])).toEqual([['Alpha', 'done', 2], ['Beta', 'active', 0]]);
        expect(p1.done).toBe(2);
    });
    it('a connection whose read failed counts as read, so a connector can finish', async () => {
        const { pipelineOf } = await import('../src/model/connections');
        const p = pipelineOf(rows, { a1: { status: 'failed', error: 'x' }, a2: ready() }, 'connections');
        expect(p.connectors[0]).toMatchObject({ state: 'done', done: 2 });
    });
});

describe('a connection that belongs to a flow (the author, 2026-11-12: the environment refused it)', () => {
    const lf = row('lf', { connectorKey: 'shared_logicflows', connectorName: 'Logicflows' });
    it('is never eligible, never counted as free, left out of the no-dependency filter and says why', () => {
        const deps: Deps = { lf: ready(), a: ready() };
        const rows = [lf, row('a')];
        expect(canSelect(lf, deps)).toBe(false);
        expect(eligibleNames(rows, deps)).toEqual(['a']);
        expect(figuresOf(rows, deps).noneFound).toBe(1);
        expect(filterRows(rows, deps, 'none', '', '').map(r => r.name)).toEqual(['a']);
        expect(dependencyLabel(deps, 'lf', lf)).toMatchObject({ text: 'Belongs to a flow' });
    });
});
