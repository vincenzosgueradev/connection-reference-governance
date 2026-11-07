import { describe, expect, it } from 'vitest';
import { buildSnapshot } from '../src/model/analysis';
import { planConnectionChange, planRepoint } from '../src/model/plans';
import { applyPlan, loadFlowCounts, loadSnapshotInput, loadSolutions, VERIFIED, WORKFLOW_COMPONENT_TYPE } from '../src/services/dataverse';
import { clientData, fakeHost, flow, guid, input, memoryHost, ref, solution } from './helpers/fixtures';


describe('loadSolutions', () => {
    it('maps rows and drops rows with a bad id', async () => {
        const h = fakeHost(() => [
            { solutionid: guid(1), friendlyname: 'One', uniquename: 'one', ismanaged: false },
            { solutionid: 'bad', friendlyname: 'Bad', uniquename: 'bad', ismanaged: false },
            { solutionid: guid(2), friendlyname: '', uniquename: 'two', ismanaged: true },
        ]);
        const r = await loadSolutions(h);
        expect(r.ok && r.value.map(s => [s.name, s.managed])).toEqual([['One', false], ['two', true]]);
    });
    it('returns an error value when the environment fails', async () => {
        const h = fakeHost(() => { throw new Error('boom'); });
        const r = await loadSolutions(h);
        expect(r).toEqual({ ok: false, error: 'Could not read solutions: boom' });
    });
});

describe('loadSolutions: publisher, version and fallback', () => {
    it('maps version, created date and the publisher name from the expand', async () => {
        const h = fakeHost(() => [{ solutionid: guid(1), friendlyname: 'One', uniquename: 'one', ismanaged: false, version: '1.0.0.5', createdon: '2026-01-02T03:04:05Z', publisherid: { friendlyname: 'Pub X' } }]);
        const r = await loadSolutions(h);
        expect(r.ok && r.value[0]).toMatchObject({ version: '1.0.0.5', createdOn: '2026-01-02T03:04:05Z', publisher: 'Pub X' });
        expect(h.queries[0]).toContain('$expand=publisherid($select=friendlyname,customizationprefix)');
    });
    it('reads again without the publisher when the expand is refused', async () => {
        const h = fakeHost(q => {
            if (q.includes('$expand')) throw new Error('bad navigation property');
            return [{ solutionid: guid(1), friendlyname: 'One', uniquename: 'one', ismanaged: false }];
        });
        const r = await loadSolutions(h);
        expect(r.ok && r.value[0]).toMatchObject({ name: 'One', publisher: '' });
        expect(h.queries).toHaveLength(2);
    });
    it('fails with one message only when both reads fail', async () => {
        const r = await loadSolutions(fakeHost(() => { throw new Error('boom'); }));
        expect(r).toEqual({ ok: false, error: 'Could not read solutions: boom' });
    });
});

describe('loadSnapshotInput', () => {
    const sol = solution();
    const answer = (q: string) => {
        if (q.startsWith('solutioncomponents'))
            return [
                { objectid: guid(1), componenttype: 10001 },
                { objectid: guid(10), componenttype: WORKFLOW_COMPONENT_TYPE },
                { objectid: guid(11), componenttype: WORKFLOW_COMPONENT_TYPE },
            ];
        if (q.startsWith('systemusers')) return [{ systemuserid: guid(700), fullname: 'Owner A' }];
        if (q.startsWith('teams')) return [];
        if (q.startsWith('connectionreferences'))
            return [
                { connectionreferenceid: guid(1), connectionreferencelogicalname: 'sample_ref1', connectionreferencedisplayname: 'R1', connectorid: '/c/a', connectionid: 'c1', ismanaged: false, _ownerid_value: guid(700) },
                { connectionreferenceid: guid(2), connectionreferencelogicalname: 'sample_ref2', connectionreferencedisplayname: 'R2', connectorid: '/c/a', connectionid: null, ismanaged: false },
            ];
        return [
            { workflowid: guid(11), name: 'B flow', statecode: 1, ismanaged: false, clientdata: clientData(['sample_ref1']) },
            { workflowid: guid(10), name: 'A flow', statecode: 0, ismanaged: false, clientdata: clientData([]) },
        ];
    };
    it('resolves membership by objectid without a hard-coded reference component type', async () => {
        const r = await loadSnapshotInput(fakeHost(answer), sol);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.value.memberReferenceIds).toEqual([guid(1)]);
        expect(r.value.references[0]!.ownerName).toBe('Owner A');
        expect(r.value.references[1]!.connectionId).toBe('');
        expect(r.value.flows.map(f => f.name)).toEqual(['A flow', 'B flow']);
    });
    it('reads definition rows of modern flows only (category 5, type 1)', async () => {
        const h = fakeHost(answer);
        await loadSnapshotInput(h, sol);
        expect(h.queries.some(q => q.includes('category eq 5 and type eq 1'))).toBe(true);
    });
    it('reads the owner id of each reference in lower case', async () => {
        const h = fakeHost(q => (q.startsWith('connectionreferences') ? [{ connectionreferenceid: guid(1), connectionreferencelogicalname: 'a', _ownerid_value: 'ABCDEF00-0000-4000-8000-000000000001' }] : []));
        const r = await loadSnapshotInput(h, sol);
        expect(r.ok && r.value.references[0]!.ownerId).toBe('abcdef00-0000-4000-8000-000000000001');
    });
    it('names no code for connection references', async () => {
        const h = fakeHost(answer);
        await loadSnapshotInput(h, sol);
        expect(h.queries.some(q => q.includes('category eq 5'))).toBe(true);
        expect(h.queries.join('\n')).not.toMatch(/componenttype eq/);
    });
    it('reads flows in chunks so the URL stays short', async () => {
        const many = Array.from({ length: 60 }, (_, i) => ({ objectid: guid(1000 + i), componenttype: WORKFLOW_COMPONENT_TYPE }));
        const h = fakeHost(q => (q.startsWith('solutioncomponents') ? many : []));
        await loadSnapshotInput(h, sol);
        const wf = h.queries.filter(q => q.startsWith('workflows'));
        expect(wf.length).toBe(3);
        expect(Math.max(...wf.map(q => q.length))).toBeLessThan(1500);
    });
    it('reads the description, dates and owner of each flow, and the owner name from users or teams', async () => {
        const h = fakeHost(q => {
            if (q.startsWith('solutioncomponents')) return [{ objectid: guid(10), componenttype: WORKFLOW_COMPONENT_TYPE }];
            if (q.startsWith('workflows')) return [{ workflowid: guid(10), name: 'F', statecode: 0, ismanaged: false, clientdata: clientData([]), description: 'D', createdon: '2026-01-02T00:00:00Z', modifiedon: '2026-01-03T00:00:00Z', _ownerid_value: guid(800).toUpperCase() }];
            if (q.startsWith('systemusers')) return [{ systemuserid: guid(800), fullname: 'Ann' }];
            return [];
        });
        const r = await loadSnapshotInput(h, sol);
        expect(r.ok && r.value.flows[0]).toMatchObject({ description: 'D', createdOn: '2026-01-02T00:00:00Z', modifiedOn: '2026-01-03T00:00:00Z', ownerId: guid(800), ownerName: 'Ann' });
        expect(h.queries.find(q => q.startsWith('workflows'))).toContain('description,createdon,modifiedon,_ownerid_value');
    });
    it('a flow without owner or description is read as empty, not as an error', async () => {
        const h = fakeHost(q => {
            if (q.startsWith('solutioncomponents')) return [{ objectid: guid(10), componenttype: WORKFLOW_COMPONENT_TYPE }];
            if (q.startsWith('workflows')) return [{ workflowid: guid(10), name: 'F', statecode: 0, ismanaged: false, clientdata: '' }];
            return [];
        });
        const r = await loadSnapshotInput(h, sol);
        expect(r.ok && r.value.flows[0]).toMatchObject({ description: '', ownerId: '', ownerName: '', createdOn: '', modifiedOn: '' });
    });
    it('empty solution gives empty lists, not an error', async () => {
        const r = await loadSnapshotInput(fakeHost(() => []), sol);
        expect(r.ok && r.value.flows).toEqual([]);
    });
    it('rejects an invalid solution id before any query', async () => {
        const h = fakeHost(() => []);
        const r = await loadSnapshotInput(h, { ...sol, id: "x' or 1 eq 1" });
        expect(r.ok).toBe(false);
        expect(h.queries).toEqual([]);
    });
    it('returns an error value when a query fails', async () => {
        const r = await loadSnapshotInput(fakeHost(() => { throw new Error('denied'); }), sol);
        expect(r).toEqual({ ok: false, error: 'Could not read the solution: denied' });
    });
});

describe('applyPlan', () => {
    const sameConnector = [ref(1), ref(2), ref(3)];
    const snap = () => buildSnapshot(input({ references: sameConnector, memberReferenceIds: sameConnector.map(r => r.id), flows: [flow(10, ['sample_ref1']), flow(11, ['sample_ref1'])] }));
    const connRows = () => ({ [guid(1)]: { connectionid: 'conn-1' }, [guid(2)]: { connectionid: 'conn-2' }, [guid(3)]: { connectionid: 'conn-3' } });

    it('reports each row and keeps going after a failure', async () => {
        const plan = planConnectionChange(snap(), [guid(1), guid(2), guid(3)], 'new');
        const h = memoryHost(connRows(), { failUpdate: id => (id === guid(2) ? 'No privilege' : undefined) });
        const out = await applyPlan(h, plan);
        expect(out.map(o => [o.id, o.status, o.message])).toEqual([[guid(1), 'done', VERIFIED], [guid(2), 'failed', 'No privilege'], [guid(3), 'done', VERIFIED]]);
        expect(h.updates.map(u => u.id)).toEqual([guid(1), guid(3)]);
        expect(h.updates[0]).toMatchObject({ entity: 'connectionreference', record: { connectionid: 'new' } });
    });
    it('never writes blocked rows', async () => {
        const plan = planConnectionChange(buildSnapshot(input({ solution: solution(true) })), [guid(1)], 'new');
        const h = memoryHost(connRows());
        const out = await applyPlan(h, plan);
        expect(h.updates).toEqual([]);
        expect(out[0]!.status).toBe('skipped');
    });
    it('writes nothing for an empty plan', async () => {
        const h = memoryHost({});
        expect(await applyPlan(h, { kind: 'connection', entity: 'connectionreference', rows: [], warnings: [] })).toEqual([]);
        expect(h.updates).toEqual([]);
    });
    it('refuses a row changed by someone else since the preview, and writes the others', async () => {
        const plan = planConnectionChange(snap(), [guid(1), guid(2)], 'new');
        const h = memoryHost(connRows());
        h.rows.set(guid(1), { connectionid: 'changed-meanwhile' });
        const out = await applyPlan(h, plan);
        expect(out.map(o => o.status)).toEqual(['skipped', 'done']);
        expect(out[0]!.message).toMatch(/Changed by someone else/);
        expect(h.updates.map(u => u.id)).toEqual([guid(2)]);
    });
    it('skips a row that cannot be read again', async () => {
        const plan = planConnectionChange(snap(), [guid(1)], 'new');
        const h = memoryHost({});
        const out = await applyPlan(h, plan);
        expect(out[0]!.status).toBe('skipped');
        expect(h.updates).toEqual([]);
    });
    it('reports failed when the stored value cannot be confirmed after the write', async () => {
        const plan = planConnectionChange(snap(), [guid(1)], 'new');
        const h = memoryHost(connRows(), { persist: false });
        const out = await applyPlan(h, plan);
        expect(out[0]).toMatchObject({ status: 'failed' });
        expect(out[0]!.message).toMatch(/could not be confirmed/);
    });
    it('re-point: writes the new definition and confirms it by reading the references back', async () => {
        const s = snap();
        const plan = planRepoint(s, [guid(10)], 'sample_ref1', 'sample_ref2');
        const h = memoryHost({ [guid(10)]: { clientdata: s.flows[0]!.flow.clientData } });
        const out = await applyPlan(h, plan);
        expect(out[0]!.status).toBe('done');
        expect(h.updates[0]).toMatchObject({ entity: 'workflow', record: { clientdata: plan.rows[0]!.payload } });
    });
    it('re-point: reports failed when the stored definition still holds the old reference', async () => {
        const s = snap();
        const plan = planRepoint(s, [guid(10)], 'sample_ref1', 'sample_ref2');
        const h = memoryHost({ [guid(10)]: { clientdata: s.flows[0]!.flow.clientData } }, { store: () => ({ clientdata: clientData(['sample_ref1', 'sample_ref2']) }) });
        const out = await applyPlan(h, plan);
        expect(out[0]!.status).toBe('failed');
    });
    it('re-point: reports failed when the stored definition lacks the new reference', async () => {
        const s = snap();
        const plan = planRepoint(s, [guid(10)], 'sample_ref1', 'sample_ref2');
        const h = memoryHost({ [guid(10)]: { clientdata: s.flows[0]!.flow.clientData } }, { store: () => ({ clientdata: clientData([]) }) });
        expect((await applyPlan(h, plan))[0]!.status).toBe('failed');
    });
    it('re-point: refuses when the definition changed since the preview', async () => {
        const s = snap();
        const plan = planRepoint(s, [guid(10)], 'sample_ref1', 'sample_ref2');
        const h = memoryHost({ [guid(10)]: { clientdata: clientData(['sample_ref1', 'sample_ref2']) } });
        const out = await applyPlan(h, plan);
        expect(out[0]!.status).toBe('skipped');
        expect(h.updates).toEqual([]);
    });
    it('rejects a row id that is not a guid before any query', async () => {
        const plan = { kind: 'connection' as const, entity: 'connectionreference' as const, warnings: [], rows: [{ id: "x' or 1 eq 1", label: 'x', field: 'connectionid' as const, oldValue: '', newValue: 'n', payload: 'n', affectedFlows: 0, affectedOn: 0, expectedCurrent: '' }] };
        const h = memoryHost({});
        const out = await applyPlan(h, plan);
        expect(out[0]!.status).toBe('skipped');
        expect(h.queries).toEqual([]);
        expect(h.updates).toEqual([]);
    });
});

describe('owner names', () => {
    const refRow = (n: number, owner: string) => ({ connectionreferenceid: guid(n), connectionreferencelogicalname: `r${n}`, _ownerid_value: owner });
    const base = (extra: (q: string) => Record<string, unknown>[] | undefined) => (q: string) => extra(q) ?? (q.startsWith('connectionreferences') ? [refRow(1, guid(700)), refRow(2, guid(701)), refRow(3, guid(700))] : []);

    it('sends no custom request header and no annotations', async () => {
        const h = fakeHost(base(() => undefined));
        await loadSnapshotInput(h, solution());
        expect(h.queries.join('\n')).not.toMatch(/Prefer|annotations|FormattedValue/i);
        expect(h.query.length).toBe(1); // the Host takes only the query: there is no way to pass headers
    });
    it('resolves users and teams with one filter per distinct owner', async () => {
        const h = fakeHost(base(q => (q.startsWith('systemusers') ? [{ systemuserid: guid(700).toUpperCase(), fullname: 'Ann' }] : q.startsWith('teams') ? [{ teamid: guid(701), name: 'Team X' }] : undefined)));
        const r = await loadSnapshotInput(h, solution());
        expect(r.ok && r.value.references.map(x => x.ownerName)).toEqual(['Ann', 'Team X', 'Ann']);
        const users = h.queries.filter(q => q.startsWith('systemusers') && !q.includes('internalemailaddress'));
        expect(users).toHaveLength(1);
        expect(users[0]!.match(/eq/g)).toHaveLength(2);
    });
    it('a failure reading names does not fail the read and leaves names empty', async () => {
        const h = fakeHost(q => {
            if (q.startsWith('systemusers') || q.startsWith('teams')) throw new Error('no privilege');
            return base(() => undefined)(q);
        });
        const r = await loadSnapshotInput(h, solution());
        expect(r.ok && r.value.references.map(x => [x.ownerName, x.ownerId])).toEqual([['', guid(700)], ['', guid(701)], ['', guid(700)]]);
    });
    it('does not query names when no reference has an owner id', async () => {
        const h = fakeHost(q => (q.startsWith('connectionreferences') ? [{ connectionreferenceid: guid(1), connectionreferencelogicalname: 'a' }] : []));
        await loadSnapshotInput(h, solution());
        expect(h.queries.some(q => q.startsWith('systemusers') || q.startsWith('teams'))).toBe(false);
    });
});

describe('loadFlowCounts', () => {
    const flowRows = (ids: number[]) => ids.map(n => ({ workflowid: guid(n).toUpperCase() }));
    const comps = (pairs: [number, number][]) => pairs.map(([sol, obj]) => ({ _solutionid_value: guid(sol), objectid: guid(obj) }));
    const host = (flows: number[], pairs: [number, number][]) => fakeHost(q => (q.startsWith('workflows') ? flowRows(flows) : comps(pairs)));

    it('counts the modern flows of each solution, once each, and the distinct total', async () => {
        // flow 10 is in solutions 1 and 2; 11 only in 1; 12 is not a modern flow (not in the first query)
        const r = await loadFlowCounts(host([10, 11], [[1, 10], [1, 11], [1, 11], [2, 10], [2, 12]]), [guid(1), guid(2), guid(3)]);
        expect(r.ok && r.value.perSolution).toEqual({ [guid(1)]: 2, [guid(2)]: 1, [guid(3)]: 0 });
        expect(r.ok && r.value.total).toBe(2);
    });
    it('ignores solutions that were not asked for', async () => {
        const r = await loadFlowCounts(host([10], [[1, 10], [9, 10]]), [guid(1)]);
        expect(r.ok && r.value).toEqual({ perSolution: { [guid(1)]: 1 }, total: 1 });
    });
    it('reads the flow definition rows of modern flows and the workflow components, with no custom header', async () => {
        const h = host([], []);
        await loadFlowCounts(h, [guid(1)]);
        expect(h.queries[0]).toContain('category eq 5 and type eq 1');
        expect(h.queries[1]).toContain(`componenttype eq ${WORKFLOW_COMPONENT_TYPE}`);
    });
    it('an empty environment gives zeros', async () => {
        const r = await loadFlowCounts(host([], []), [guid(1)]);
        expect(r.ok && r.value).toEqual({ perSolution: { [guid(1)]: 0 }, total: 0 });
    });
    it('a result that may have been cut is an error, never a wrong number', async () => {
        const many = Array.from({ length: 5000 }, (_, i) => i + 1);
        const r = await loadFlowCounts(host(many, []), [guid(1)]);
        expect(r.ok).toBe(false);
    });
    it('a failing query is an error value', async () => {
        const r = await loadFlowCounts(fakeHost(() => { throw new Error('denied'); }), [guid(1)]);
        expect(r).toEqual({ ok: false, error: 'Could not count flows: denied' });
    });
});

describe('applyPlan progress', () => {
    const sameConnector = [ref(1), ref(2), ref(3)];
    const snap = () => buildSnapshot(input({ references: sameConnector, memberReferenceIds: sameConnector.map(r => r.id), flows: [] }));
    const rows = () => ({ [guid(1)]: { connectionid: 'conn-1' }, [guid(2)]: { connectionid: 'conn-2' }, [guid(3)]: { connectionid: 'conn-3' } });

    it('reports each row as soon as it is finished, with its position and the total', async () => {
        const plan = planConnectionChange(snap(), [guid(1), guid(2), guid(3)], 'new');
        const calls: [string, string, number, number][] = [];
        await applyPlan(memoryHost(rows()), plan, (o, done, total) => calls.push([o.id, o.status, done, total]));
        expect(calls).toEqual([[guid(1), 'done', 1, 3], [guid(2), 'done', 2, 3], [guid(3), 'done', 3, 3]]);
    });
    it('reports a row before the next row is touched', async () => {
        const plan = planConnectionChange(snap(), [guid(1), guid(2)], 'new');
        const h = memoryHost(rows());
        const seen: number[] = [];
        await applyPlan(h, plan, () => seen.push(h.queries.length));
        // row 1 needs two reads (before and after the write): the report comes right after them, before row 2 is read
        expect(seen).toEqual([2, 4]);
    });
    it('reports failed, skipped and blocked rows too, and a failure does not stop the others', async () => {
        const plan = planConnectionChange(snap(), [guid(1), guid(2), guid(3)], 'new');
        const h = memoryHost(rows(), { failUpdate: id => (id === guid(2) ? 'No privilege' : undefined) });
        h.rows.set(guid(3), { connectionid: 'changed' });
        const calls: string[] = [];
        await applyPlan(h, plan, o => calls.push(`${o.status}:${o.message}`));
        expect(calls).toEqual([`done:${VERIFIED}`, 'failed:No privilege', expect.stringMatching(/^skipped:Changed by someone else/)]);
    });
    it('a listener that throws does not stop the run', async () => {
        const plan = planConnectionChange(snap(), [guid(1), guid(2)], 'new');
        const h = memoryHost(rows());
        const out = await applyPlan(h, plan, () => { throw new Error('listener'); });
        expect(out.map(o => o.status)).toEqual(['done', 'done']);
        expect(h.updates).toHaveLength(2);
    });
    it('calls nothing for an empty plan', async () => {
        const calls: unknown[] = [];
        await applyPlan(memoryHost({}), { kind: 'connection', entity: 'connectionreference', rows: [], warnings: [] }, o => calls.push(o));
        expect(calls).toEqual([]);
    });
});
