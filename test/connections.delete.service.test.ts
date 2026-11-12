import { describe, expect, it, vi } from 'vitest';
import { allOk, mergeReport } from '../src/model/connectionDeps';
import { planConnectionDeletion } from '../src/model/connectionPlan';
import type { ConnectionRow } from '../src/types';
import { emptyWorld, worldHost, type World } from './helpers/connectionsWorld';

// Feature 024: the guarded deletion of connections. With the real flag (off) nothing is ever sent; with the flag mocked on,
// the checks before and after each row. Synthetic data only.

const row = (name: string): ConnectionRow => ({ name, connectorKey: 'a', connectorName: 'A', displayName: `${name} display`, status: 'connected', statusDetail: '', createdTime: '', modifiedTime: '', creator: { name: 'Ann', email: '' } });
const free = () => mergeReport([], allOk());
const used = () => mergeReport([{ kind: 'app', id: 'a1', name: 'An app', state: '', ownerName: '', solutions: [], via: '' }], allOk());

const planFor = (rows: ConnectionRow[], names: string[]) => planConnectionDeletion(rows, Object.fromEntries(rows.map(r => [r.name, { status: 'ready' as const, report: free() }])), names);

describe('with the flag off, which is how it ships', () => {
    it('never calls the host and skips every row with the reason', async () => {
        vi.resetModules();
        vi.doMock('../src/features', () => ({ features: { connectionDelete: false } }));
        const { applyConnectionDeletion, SWITCHED_OFF } = await import('../src/services/connections');
        const rows = [row('c1'), row('c2')];
        const h = worldHost(emptyWorld({ connections: [{ name: 'c1' }, { name: 'c2' }] }));
        const out = await applyConnectionDeletion(h, 'env-1', planFor(rows, ['c1', 'c2']), rows, async () => free());
        expect(out.map(o => [o.id, o.status, o.message])).toEqual([['c1', 'skipped', SWITCHED_OFF], ['c2', 'skipped', SWITCHED_OFF]]);
        expect(h.calls.deleted).toEqual([]);
        expect(h.calls.lists).toEqual([]);
        expect(h.updates).toEqual([]);
        vi.doUnmock('../src/features');
    });
});

describe('with the flag on (mocked)', () => {
    const load = async () => {
        vi.resetModules();
        vi.doMock('../src/features', () => ({ features: { connectionDelete: true } }));
        return import('../src/services/connections');
    };
    const setup = (w: Partial<World> = {}, names = ['c1', 'c2', 'c3']) => {
        const rows = names.map(row);
        const h = worldHost(emptyWorld({ connections: names.map(n => ({ name: n })), ...w }));
        return { rows, h, plan: planFor(rows, names) };
    };

    it('deletes each row after checking it again and reads the list back: done only when the connection is gone', async () => {
        const { applyConnectionDeletion } = await load();
        const { rows, h, plan } = setup();
        const seen: string[] = [];
        const out = await applyConnectionDeletion(h, 'env-1', plan, rows, async r => { seen.push(r.name); return free(); }, o => seen.push(`row:${o.id}`));
        expect(out.map(o => o.status)).toEqual(['done', 'done', 'done']);
        expect(out[0]!.message).toBe('Deleted and read back.');
        expect(h.calls.deleted).toEqual(['c1', 'c2', 'c3']);
        expect(seen.slice(0, 3)).toEqual(['c1', 'row:c1', 'c2']);
        vi.doUnmock('../src/features');
    });
    it('a dependency that appeared since the check skips that row and the others go on', async () => {
        const { applyConnectionDeletion } = await load();
        const { rows, h, plan } = setup();
        const out = await applyConnectionDeletion(h, 'env-1', plan, rows, async r => (r.name === 'c2' ? used() : free()));
        expect(out.map(o => o.status)).toEqual(['done', 'skipped', 'done']);
        expect(out[1]!.message).toContain('Checked again just before');
        expect(h.calls.deleted).toEqual(['c1', 'c3']);
        vi.doUnmock('../src/features');
    });
    it('a connection that is already gone is skipped, not an error', async () => {
        const { applyConnectionDeletion } = await load();
        const { rows, h, plan } = setup();
        h.world.connections = h.world.connections.filter(c => c.name !== 'c2');
        const out = await applyConnectionDeletion(h, 'env-1', plan, rows, async () => free());
        expect(out[1]).toMatchObject({ status: 'skipped', message: expect.stringContaining('already gone') });
        expect(h.calls.deleted).toEqual(['c1', 'c3']);
        vi.doUnmock('../src/features');
    });
    it('a row that stays in the list after the request is failed, never done', async () => {
        const { applyConnectionDeletion } = await load();
        const { rows, h, plan } = setup({}, ['c1']);
        h.deleteConnection = async (_e, _c, name) => { h.calls.deleted.push(name); }; // accepted, nothing changes
        const out = await applyConnectionDeletion(h, 'env-1', plan, rows, async () => free());
        expect(out[0]).toMatchObject({ status: 'failed', message: expect.stringContaining('still listed') });
        vi.doUnmock('../src/features');
    });
    it('a failed read-back is reported as failed with the reason', async () => {
        const { applyConnectionDeletion } = await load();
        const { rows, h, plan } = setup({}, ['c1']);
        const list = h.listConnections;
        let n = 0;
        h.listConnections = async (e, next) => { n++; if (n === 2) throw new Error('list down'); return list(e, next); };
        const out = await applyConnectionDeletion(h, 'env-1', plan, rows, async () => free());
        expect(out[0]).toMatchObject({ status: 'failed', message: expect.stringContaining('list down') });
        vi.doUnmock('../src/features');
    });
    it('a refused route stops the run: the first row says so and nothing else is attempted', async () => {
        const { applyConnectionDeletion } = await load();
        const { rows, h, plan } = setup();
        h.deleteConnection = async (_e, _c, name) => { h.calls.deleted.push(name); throw new Error('404 route not found'); };
        const out = await applyConnectionDeletion(h, 'env-1', plan, rows, async () => free());
        expect(out.map(o => o.status)).toEqual(['failed', 'skipped', 'skipped']);
        expect(out[0]!.message).toContain('route for deleting a connection was refused');
        expect(out[1]!.message).toContain('Not attempted');
        expect(h.calls.deleted).toEqual(['c1']);
        vi.doUnmock('../src/features');
    });
    it('another error fails only its own row', async () => {
        const { applyConnectionDeletion } = await load();
        const { rows, h, plan } = setup();
        const del = h.deleteConnection;
        h.deleteConnection = async (e, c, name) => { if (name === 'c2') throw new Error('Forbidden: not your connection'); return del(e, c, name); };
        const out = await applyConnectionDeletion(h, 'env-1', plan, rows, async () => free());
        expect(out.map(o => o.status)).toEqual(['done', 'failed', 'done']);
        expect(out[1]!.message).toContain('Forbidden');
        vi.doUnmock('../src/features');
    });
    it('a blocked row of the plan is skipped with its reason and never sent', async () => {
        const { applyConnectionDeletion } = await load();
        const rows = [row('c1'), row('c2')];
        const h = worldHost(emptyWorld({ connections: [{ name: 'c1' }, { name: 'c2' }] }));
        const plan = planConnectionDeletion(rows, { c1: { status: 'ready', report: free() }, c2: { status: 'ready', report: used() } }, ['c1', 'c2']);
        const out = await applyConnectionDeletion(h, 'env-1', plan, rows, async () => free());
        expect(out.map(o => o.status)).toEqual(['done', 'skipped']);
        expect(out[1]!.message).toContain('Something depends on it');
        expect(h.calls.deleted).toEqual(['c1']);
        vi.doUnmock('../src/features');
    });
    it('a failing listener never stops the run', async () => {
        const { applyConnectionDeletion } = await load();
        const { rows, h, plan } = setup({}, ['c1', 'c2']);
        const out = await applyConnectionDeletion(h, 'env-1', plan, rows, async () => free(), () => { throw new Error('listener'); });
        expect(out.map(o => o.status)).toEqual(['done', 'done']);
        vi.doUnmock('../src/features');
    });
});
