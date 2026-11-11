import { describe, expect, it } from 'vitest';
import { buildSnapshot } from '../src/model/analysis';
import type { Host, Record_ } from '../src/host';
import { emptyForm } from '../src/model/newReference';
import { createReference, loadLiveConnections, referenceComponentType } from '../src/services/dataverse';
import { fakeHost, guid, input, ref, solution } from './helpers/fixtures';

const A = '/providers/Microsoft.PowerApps/apis/shared_a';
const NEW = guid(700);
const seen = { status: 'ready' as const, error: '', items: [{ name: 'c1', connectorKey: 'a', displayName: '', createdTime: '' }] };
const form = (over = {}) => ({ ...emptyForm(A), displayName: 'My Ref', name: 'MyRef', reviewing: true, connectionId: 'c1', connectionSource: 'card' as const, live: seen, ...over });
const snap = (over = {}) => ({ ...buildSnapshot(input(over)), componentTypes: { [guid(1)]: 10001 } });

interface Opts { taken?: boolean; failAdd?: boolean; member?: boolean; stored?: Partial<Record<string, string>>; failRemove?: boolean; createdId?: string; stillThere?: boolean }

/** A host with just enough memory to follow one creation. */
function env(o: Opts = {}) {
    const log: string[] = [];
    let created = false;
    let removed = false;
    const h: Host = {
        ...fakeHost(() => []),
        async environmentId() { return 'env-1'; },
        async listConnections() { return { value: [{ id: '/providers/Microsoft.PowerApps/apis/shared_a/connections/c1', name: 'c1', properties: { displayName: 'c1@example.test' } }] } as Record_; },
        async query(q) {
            log.push(`query ${q}`);
            if (q.includes("connectionreferencelogicalname eq 'sample_MyRef'")) return created && !removed ? [{ connectionreferenceid: NEW }] : o.taken ? [{ connectionreferenceid: guid(1) }] : [];
            if (q.startsWith('solutioncomponents?$select=objectid')) return o.member === false ? [] : [{ objectid: NEW }];
            if (q.includes(`connectionreferenceid eq ${NEW}`) && q.includes('connectorid'))
                return [{ connectionreferenceid: NEW, connectionreferencelogicalname: 'sample_MyRef', connectionreferencedisplayname: 'My Ref', connectorid: A, connectionid: 'c1', ismanaged: false, _ownerid_value: '', _customconnectorid_value: '', ...o.stored } as Record_];
            if (q.includes(`connectionreferenceid eq ${NEW}`)) return created && !removed ? [{ connectionreferenceid: NEW }] : [];
            return [];
        },
        async create(entity, record) {
            log.push(`create ${entity} ${JSON.stringify(record)}`);
            created = true;
            return o.createdId ?? NEW;
        },
        async addToSolution(solutionName, id, type) {
            log.push(`add ${solutionName} ${id} ${type}`);
            if (o.failAdd) throw new Error('add refused');
        },
        async remove(entity, id) {
            log.push(`remove ${entity} ${id}`);
            if (o.failRemove) throw new Error('remove refused');
            if (!o.stillThere) removed = true;
        },
    };
    return { h, log };
}

describe('createReference', () => {
    it('creates, adds to the solution with the type that was read, reads back and returns the row', async () => {
        const { h, log } = env();
        const r = await createReference(h, snap(), form());
        expect(r.ok && r.value.reference).toMatchObject({ id: NEW, logicalName: 'sample_MyRef', connectorId: A });
        expect(r.ok && r.value.componentType).toBe(10001); // returned, so Remove and Delete know the new row at once
        expect(log.find(l => l.startsWith('create'))).toContain('"connectorid":"/providers/Microsoft.PowerApps/apis/shared_a"');
        expect(log).toContain(`add sample ${NEW} 10001`);
        expect(log.some(l => l.startsWith('remove'))).toBe(false);
    });
    it('writes nothing when the name already exists, when the form is invalid or the solution is managed', async () => {
        for (const [e, f, s] of [
            [env({ taken: true }), form(), snap()],
            [env(), form({ displayName: '' }), snap()],
            [env(), form(), { ...snap(), solution: solution(true) }],
        ] as const) {
            const r = await createReference(e.h, s, f);
            expect(r.ok).toBe(false);
            expect(e.log.some(l => l.startsWith('create') || l.startsWith('add'))).toBe(false);
        }
    });
    it('writes nothing when the component type cannot be read', async () => {
        const { h, log } = env();
        const r = await createReference(h, { ...snap(), componentTypes: {} }, form());
        expect(r).toMatchObject({ ok: false, error: expect.stringContaining('nothing was created') });
        expect(log.some(l => l.startsWith('create'))).toBe(false);
    });
    it('deletes the row again when it cannot be added to the solution, and says so', async () => {
        const { h, log } = env({ failAdd: true });
        const r = await createReference(h, snap(), form());
        expect(r).toMatchObject({ ok: false, error: expect.stringContaining('deleted again') });
        expect(log).toContain(`remove connectionreference ${NEW}`);
    });
    it('deletes the row again when the membership cannot be read back', async () => {
        const { h, log } = env({ member: false });
        const r = await createReference(h, snap(), form());
        expect(r).toMatchObject({ ok: false, error: expect.stringContaining('not in the solution') });
        expect(log).toContain(`remove connectionreference ${NEW}`);
    });
    it('deletes the row again when what is stored differs from what was asked', async () => {
        const { h } = env({ stored: { connectorid: '/providers/Microsoft.PowerApps/apis/shared_other' } });
        const r = await createReference(h, snap(), form());
        expect(r).toMatchObject({ ok: false, error: expect.stringContaining('not what was asked') });
    });
    it('names the row when it could not be deleted again', async () => {
        const { h } = env({ failAdd: true, failRemove: true });
        const r = await createReference(h, snap(), form());
        expect(r).toMatchObject({ ok: false, error: expect.stringContaining(`could not be deleted again`) });
        expect(!r.ok && r.error).toContain(NEW);
    });
    it('names the row when the delete was accepted but the row is still there', async () => {
        const { h } = env({ failAdd: true, stillThere: true });
        const r = await createReference(h, snap(), form());
        expect(!r.ok && r.error).toContain('could not be deleted again');
    });
    it('finds the id by name when the environment returns none', async () => {
        const { h, log } = env({ createdId: '' });
        const r = await createReference(h, snap(), form());
        expect(r.ok).toBe(true);
        expect(log).toContain(`add sample ${NEW} 10001`);
    });
    it('returns an error value, never throws, when the first read fails', async () => {
        const h: Host = { ...fakeHost(() => []), query: async () => { throw new Error('boom'); } };
        expect(await createReference(h, snap(), form())).toEqual({ ok: false, error: 'Could not create the reference: boom.' });
    });
});

describe('referenceComponentType', () => {
    const noMember = { ...snap(), componentTypes: {} };
    it('is read from the members of the solution first', async () => expect(await referenceComponentType(fakeHost(() => []), snap())).toBe(10001));
    it('then from any reference of the environment as stored in a solution', async () => {
        const h = fakeHost(q => (q.startsWith('solutioncomponents') ? [{ componenttype: 10150 }] : []));
        expect(await referenceComponentType(h, noMember)).toBe(10150);
    });
    it('then from the component definitions', async () => {
        const h = fakeHost(q => (q.startsWith('solutioncomponentdefinitions') ? [{ solutioncomponenttype: 10151 }] : []));
        expect(await referenceComponentType(h, noMember)).toBe(10151);
    });
    it('is undefined when no source answers', async () => {
        expect(await referenceComponentType(fakeHost(() => { throw new Error('x'); }), noMember)).toBeUndefined();
        expect(ref(1).id).toBeDefined();
    });
});

describe('owner emails of the references', () => {
    const base = (q: string) => {
        if (q.startsWith('solutioncomponents')) return [{ objectid: guid(1), componenttype: 10001 }];
        if (q.startsWith('connectionreferences?')) return [{ connectionreferenceid: guid(1), connectionreferencelogicalname: 'sample_a', connectionreferencedisplayname: 'A', connectorid: A, connectionid: 'c1', ismanaged: false, _ownerid_value: guid(60) }];
        if (q.startsWith('systemusers?') && q.includes('internalemailaddress')) return [{ systemuserid: guid(60), internalemailaddress: 'ann@example.test' }];
        if (q.startsWith('systemusers?')) return [{ systemuserid: guid(60), fullname: 'Ann' }];
        return [];
    };
    it('reads the email of the owner with one plain query and keeps it on the reference', async () => {
        const { loadSnapshotInput } = await import('../src/services/dataverse');
        const h = fakeHost(base);
        const r = await loadSnapshotInput(h, solution());
        expect(r.ok && r.value.references[0]).toMatchObject({ ownerName: 'Ann', ownerEmail: 'ann@example.test' });
        expect(h.queries.filter(q => q.includes('internalemailaddress'))).toHaveLength(1);
    });
    it('only leaves the email out when it cannot be read', async () => {
        const { loadSnapshotInput } = await import('../src/services/dataverse');
        const r = await loadSnapshotInput(fakeHost(q => { if (q.includes('internalemailaddress')) throw new Error('no'); return base(q); }), solution());
        expect(r.ok && r.value.references[0]).toMatchObject({ ownerName: 'Ann', ownerEmail: '' });
    });
});

describe('the connection is verified', () => {
    const conn = (name: string, key: string) => ({ id: `/providers/Microsoft.PowerApps/apis/shared_${key}/connections/${name}`, name, properties: { displayName: `${name}@example.test` } });
    const withList = (list: unknown[], over: Partial<Host> = {}, opts: Opts = {}) => {
        const { h, log } = env(opts);
        const host: Host = { ...h, async environmentId() { log.push('environment id'); return 'env-1'; }, async listConnections(id) { log.push(`list ${id}`); return { value: list } as Record_; }, ...over };
        return { host, log };
    };
    it('loadLiveConnections reads the environment id and then the list', async () => {
        const { host, log } = withList([conn('c1', 'a')]);
        const r = await loadLiveConnections(host);
        expect(r.ok && r.value).toEqual([{ name: 'c1', connectorKey: 'a', displayName: 'c1@example.test', createdTime: '' }]);
        expect(log).toEqual(['environment id', 'list env-1']);
    });
    it('loadLiveConnections gives an error value when the id or the list cannot be read', async () => {
        expect(await loadLiveConnections({ ...withList([]).host, environmentId: async () => '' })).toEqual({ ok: false, error: 'the environment id could not be read' });
        expect(await loadLiveConnections({ ...withList([]).host, listConnections: async () => { throw new Error('denied'); } })).toEqual({ ok: false, error: 'denied' });
    });
    it('creates with a connection that is found, and stores it', async () => {
        const { host, log } = withList([conn('c1', 'a')], {}, { stored: { connectionid: 'c1' } }); // what the environment stores and reads back
        const r = await createReference(host, snap(), form({ connectionId: 'c1', live: seen }));
        expect(log.find(l => l.startsWith('create'))).toContain('"connectionid":"c1"');
        expect(r.ok).toBe(true);
    });
    it('writes nothing when the connection is not found, belongs to another connector, or cannot be verified', async () => {
        const cases: [string, ReturnType<typeof withList>][] = [
            ['not found among your connections', withList([conn('other', 'a')])],
            ['belongs to another connector', withList([conn('c1', 'b')])],
            ['could not be verified', withList([], { listConnections: async () => { throw new Error('denied'); } })],
        ];
        for (const [text, { host, log }] of cases) {
            const r = await createReference(host, snap(), form({ connectionId: 'c1', live: seen })); // it was found when the panel read the list
            expect(!r.ok && r.error, text).toContain(text);
            expect(log.some(l => l.startsWith('create') || l.startsWith('add')), text).toBe(false);
        }
    });
    it('refuses a form without a connection and writes nothing', async () => {
        const { host, log } = withList([]);
        const r = await createReference(host, snap(), form({ connectionId: '', connectionSource: 'none' }));
        expect(r).toMatchObject({ ok: false, error: expect.stringContaining('Choose a connection') });
        expect(log.some(l => l.startsWith('create') || l.startsWith('add'))).toBe(false);
    });
});

describe('the steps of a creation are reported as they are reached', () => {
    const run = async (o: Opts = {}) => {
        const { h } = env(o);
        const steps: string[] = [];
        const r = await createReference(h, snap(), form(), s => steps.push(s));
        return { r, steps };
    };
    it('check, write, readback, in that order, once each', async () => {
        const { r, steps } = await run();
        expect(r.ok).toBe(true);
        expect(steps).toEqual(['check', 'write', 'readback']);
    });
    it('only as far as it got: a name already taken stops after the check', async () => {
        const { r, steps } = await run({ taken: true });
        expect(r.ok).toBe(false);
        expect(steps).toEqual(['check']);
    });
    it('a refused membership stops after the write (the read back is never reached)', async () => {
        expect((await run({ failAdd: true })).steps).toEqual(['check', 'write']);
    });
    it('a row that is not found in the solution has been through the read back', async () => {
        expect((await run({ member: false })).steps).toEqual(['check', 'write', 'readback']);
    });
    it('a listener that throws never stops the write', async () => {
        const { h } = env();
        const r = await createReference(h, snap(), form(), () => { throw new Error('listener'); });
        expect(r.ok).toBe(true);
    });
});
