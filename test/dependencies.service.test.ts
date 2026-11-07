import { describe, expect, it } from 'vitest';
import { buildSnapshot } from '../src/model/analysis';
import type { Host, Record_ } from '../src/host';
import { dependentLabels, loadDependencyReport } from '../src/services/dependencies';
import { fakeHost, flow, guid, input, ref, USER } from './helpers/fixtures';

/** Feature 023: the dependencies of a reference in the whole environment, over a fake environment. Synthetic data only. */

const REF = guid(1);
const FLOW_IN = guid(10); // a flow of the open solution
const FLOW_OUT = guid(80); // a flow of another solution
const AGENT = guid(81);
const APP = guid(82);
const ODD = guid(83); // a component of a type that is read from the definitions
const SALES = guid(901);
const snap = () => ({ ...buildSnapshot(input({ flows: [flow(10, ['sample_ref1'])] })), componentTypes: { [REF]: 10001, [FLOW_IN]: 29 } });

interface World { dependents?: { id: string; type: number }[]; failTables?: string[]; noDefinitions?: boolean; botsByRef?: Record_[]; botComponentsByRef?: Record_[] | 'fail'; noSolutions?: boolean }
const env = (w: World = {}) => {
    const queries: string[] = [];
    const h: Host = {
        ...fakeHost(() => []),
        async dependents() { return w.dependents ?? [{ id: FLOW_IN, type: 29 }, { id: FLOW_OUT, type: 29 }, { id: AGENT, type: 10110 }, { id: APP, type: 300 }, { id: ODD, type: 10200 }, { id: REF, type: 10001 }]; },
        async query(q) {
            queries.push(q);
            const fails = (_t: string) => w.failTables?.some(x => q.startsWith(`${x}?`));
            if (q.startsWith('solutioncomponentdefinitions?')) {
                if (w.noDefinitions) throw new Error('no');
                return [{ solutioncomponenttype: 10110, name: 'Agent', primaryentityname: 'bot' }, { solutioncomponenttype: 10200, name: 'Dataflow', primaryentityname: 'dataflow' }];
            }
            if (q.startsWith('workflows?')) { if (fails('workflows')) throw new Error('x'); return [{ workflowid: FLOW_IN, name: 'In flow', statecode: 1, category: 5, ismanaged: false, _ownerid_value: USER }, { workflowid: FLOW_OUT, name: 'Outside flow', statecode: 0, category: 5, ismanaged: true, _ownerid_value: USER }]; }
            if (q.startsWith('bots?$select=botid,name,statecode,ismanaged,_ownerid_value&$filter=_providerconnectionreferenceid_value')) { if (fails('bots')) throw new Error('x'); return w.botsByRef ?? []; }
            if (q.startsWith('bots?')) { if (fails('bots')) throw new Error('x'); return q.includes(`botid eq ${AGENT}`) ? [{ botid: AGENT, name: 'Help desk', ismanaged: false, _ownerid_value: USER }] : []; }
            if (q.startsWith('connectionreferences(')) { if (w.botComponentsByRef === 'fail') throw new Error('x'); return w.botComponentsByRef ?? []; }
            if (q.startsWith('canvasapps?')) return [{ canvasappid: APP, displayname: 'Orders app' }];
            if (q.startsWith('systemusers?')) return [{ systemuserid: USER, fullname: 'Owner A' }];
            if (q.startsWith('teams?')) return [];
            if (q.startsWith('solutioncomponents?$select=objectid,_solutionid_value')) {
                if (w.noSolutions) throw new Error('x');
                return [{ objectid: FLOW_IN, _solutionid_value: guid(900) }, { objectid: FLOW_OUT, _solutionid_value: SALES }, { objectid: FLOW_OUT, _solutionid_value: guid(902) }, { objectid: APP, _solutionid_value: SALES }];
            }
            if (q.startsWith('solutions?$select=solutionid,friendlyname,uniquename')) return [{ solutionid: guid(900), friendlyname: 'Sample', uniquename: 'sample' }, { solutionid: SALES, friendlyname: 'Sales', uniquename: 'sales' }, { solutionid: guid(902), friendlyname: 'Default Solution', uniquename: 'Default' }];
            return [];
        },
    };
    return { h, queries };
};

describe('loadDependencyReport', () => {
    it('lists everything that depends on the reference, in any solution, named, typed and located', async () => {
        const { h } = env();
        const r = await loadDependencyReport(h, snap(), ref(1));
        expect(r.ok).toBe(true);
        const items = r.ok ? r.value.items : [];
        expect(items.map(d => d.id).sort()).toEqual([FLOW_IN, FLOW_OUT, AGENT, APP, ODD].sort()); // the reference itself is left out
        const by = (id: string) => items.find(d => d.id === id)!;
        expect(by(FLOW_IN)).toMatchObject({ name: 'In flow', kind: 'flow', typeLabel: 'Cloud flow', state: 'On', owner: 'Owner A', inOpenSolution: true, solutions: ['Sample'] });
        expect(by(FLOW_OUT)).toMatchObject({ name: 'Outside flow', state: 'Off', managed: true, inOpenSolution: false, solutions: ['Sales'] }); // the default solution is not shown
        expect(by(AGENT)).toMatchObject({ name: 'Help desk', kind: 'agent', typeLabel: 'Agent', inOpenSolution: false });
        expect(by(APP)).toMatchObject({ name: 'Orders app', kind: 'app', typeLabel: 'Canvas app', solutions: ['Sales'] });
        expect(by(ODD)).toMatchObject({ kind: 'other', typeLabel: 'Dataflow' }); // the name of the type comes from the definitions
        expect(r.ok && r.value.notes).toEqual([]);
    });
    it('asks the environment for the dependents of the stored component type of the reference, in one place', async () => {
        const seen: [number, string][] = [];
        const { h } = env();
        await loadDependencyReport({ ...h, dependents: async (t, id) => { seen.push([t, id]); return []; } }, snap(), ref(1));
        expect(seen).toEqual([[10001, REF]]);
    });
    it('is empty, with nothing to note, when nothing depends on it', async () => {
        const r = await loadDependencyReport(env({ dependents: [] }).h, snap(), ref(1));
        expect(r).toEqual({ ok: true, value: { items: [], notes: [] } });
    });
    it('adds the agents that use it as their connection reference, and an agent the records already list is not listed twice', async () => {
        const { h } = env({ dependents: [], botsByRef: [{ botid: guid(90), name: 'Direct agent', ismanaged: false, _ownerid_value: USER }], botComponentsByRef: [{ botcomponentid: guid(91), name: 'Topic', ismanaged: false, _parentbotid_value: guid(90) }] });
        const r = await loadDependencyReport(h, snap(), ref(1));
        const items = r.ok ? r.value.items : [];
        expect(items.map(d => [d.name, d.kind, d.typeLabel])).toEqual(expect.arrayContaining([['Direct agent', 'agent', 'Agent'], ['Topic', 'agent', 'Agent component']]));
        expect(items.find(d => d.name === 'Topic')!.parent).toBe('Direct agent');
        const both = env({ dependents: [{ id: AGENT, type: 10110 }], botsByRef: [{ botid: AGENT, name: 'Help desk', ismanaged: false, _ownerid_value: USER }] });
        const twice = await loadDependencyReport(both.h, snap(), ref(1));
        expect(twice.ok && twice.value.items.filter(d => d.id === AGENT)).toHaveLength(1);
    });
    it('a source that cannot be read is named in a note and never hides the others', async () => {
        const r = await loadDependencyReport(env({ failTables: ['workflows'], botComponentsByRef: 'fail', noSolutions: true }).h, snap(), ref(1));
        expect(r.ok).toBe(true);
        const v = r.ok ? r.value : { items: [], notes: [] };
        expect(v.notes).toEqual(expect.arrayContaining(['The names of the flows could not be read.', 'The agent components that use it could not be read.', 'The solutions that hold the components could not be read.']));
        expect(v.items.find(d => d.id === FLOW_OUT)!.name).toBe(`Flow ${FLOW_OUT.slice(0, 8)}`); // no name read: its type and a short id
        expect(v.items.find(d => d.id === APP)!.name).toBe('Orders app'); // the others are intact
        expect(v.items.find(d => d.id === FLOW_IN)!.inOpenSolution).toBe(true); // still known from the solution
        expect(v.items.find(d => d.id === FLOW_OUT)!.inOpenSolution).toBe(false);
        expect(v.items.every(d => d.solutions.length === 0)).toBe(true);
    });
    it('says when the names of the types could not be read, and still lists the component', async () => {
        const r = await loadDependencyReport(env({ noDefinitions: true }).h, snap(), ref(1));
        expect(r.ok && r.value.notes).toContain('The names of some component types could not be read.');
        expect(r.ok && r.value.items.find(d => d.id === ODD)!.typeLabel).toBe('Component of type 10200');
    });
    it('fails with a message when the environment refuses the dependencies, or the type of the reference is not known', async () => {
        const bad = await loadDependencyReport({ ...env().h, dependents: async () => { throw new Error('privilege'); } }, snap(), ref(1));
        expect(bad).toEqual({ ok: false, error: 'privilege' });
        const none = await loadDependencyReport(fakeHost(() => []), { ...snap(), componentTypes: {} }, ref(1));
        expect(none.ok).toBe(false);
    });
    it('reads the names of the types once per host, not once per reference', async () => {
        const { h, queries } = env();
        await loadDependencyReport(h, snap(), ref(1));
        await loadDependencyReport(h, snap(), ref(1));
        expect(queries.filter(q => q.startsWith('solutioncomponentdefinitions?'))).toHaveLength(1);
    });
    it('asks in chunks, so a long list never makes a long query', async () => {
        const many = Array.from({ length: 45 }, (_, i) => ({ id: guid(1000 + i), type: 29 }));
        const { h, queries } = env({ dependents: many });
        await loadDependencyReport(h, snap(), ref(1));
        const flowQueries = queries.filter(q => q.startsWith('workflows?'));
        expect(flowQueries).toHaveLength(3);
        for (const q of flowQueries) expect(q.length).toBeLessThan(1500);
    });
});

describe('dependentLabels', () => {
    it('names the components that block a delete: name, kind and the solutions', async () => {
        const labels = await dependentLabels(env().h, snap(), [{ id: FLOW_OUT, type: 29 }, { id: APP, type: 300 }]);
        expect(labels[FLOW_OUT]).toBe('Outside flow (Cloud flow, in Sales)');
        expect(labels[APP]).toBe('Orders app (Canvas app, in Sales)');
    });
    it('is empty for nothing, and never throws when the names cannot be read', async () => {
        expect(await dependentLabels(env().h, snap(), [])).toEqual({});
        const broken: Host = { ...env().h, query: async () => { throw new Error('x'); } };
        const out = await dependentLabels(broken, snap(), [{ id: FLOW_OUT, type: 29 }]);
        expect(typeof out).toBe('object');
    });
});
