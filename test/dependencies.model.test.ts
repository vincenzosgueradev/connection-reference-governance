import { describe, expect, it } from 'vitest';
import { describeDependent, groupDependents, infoOf, kindOf, summarize, summaryLine, typeLabelOf, type DependencyReport, type ResolvedDependent } from '../src/model/dependencies';

/** Feature 023: kinds, labels, grouping and the summary of what depends on a reference. Synthetic data only. */

const dep = (over: Partial<ResolvedDependent> = {}): ResolvedDependent => ({
    id: 'id', type: 29, kind: 'flow', typeLabel: 'Cloud flow', name: 'A flow', state: 'On', managed: false, owner: '', parent: '', solutions: [], inOpenSolution: true, ...over,
});
const report = (items: ResolvedDependent[], notes: string[] = []): DependencyReport => ({ items, notes });

describe('kinds and labels', () => {
    it('knows the fixed codes and reads the others from the definitions, never guessing', () => {
        expect(kindOf(29)).toBe('flow');
        expect(kindOf(300)).toBe('app');
        expect(kindOf(380)).toBe('other');
        expect(kindOf(10042)).toBe('other'); // an unknown code is not guessed
        expect(kindOf(10042, { name: 'Agent', entity: 'bot' })).toBe('agent');
        expect(kindOf(10043, { name: 'Agent component', entity: 'botcomponent' })).toBe('agent');
        expect(kindOf(10044, { name: 'Model-driven app', entity: 'appmodule' })).toBe('app');
        expect(kindOf(10045, { name: 'Process', entity: 'WORKFLOW' })).toBe('flow');
        expect(typeLabelOf(29)).toBe('Flow');
    });
    it('names a type from what was read, then from the fixed codes, then says it is unknown', () => {
        expect(typeLabelOf(300)).toBe('Canvas app');
        expect(typeLabelOf(10042, { name: 'Agent', entity: 'bot' })).toBe('Agent');
        expect(typeLabelOf(10042)).toBe('Component of type 10042');
    });
    it('infoOf prefers what was read over the fixed codes', () => {
        const read = new Map([[300, { name: 'Renamed', entity: 'canvasapp' }]]);
        expect(infoOf(300, read)!.name).toBe('Renamed');
        expect(infoOf(300)!.name).toBe('Canvas app');
        expect(infoOf(9999, read)).toBeUndefined();
    });
});

describe('summarize and summaryLine', () => {
    it('counts what is in the open solution, what is outside and each kind', () => {
        const s = summarize(report([dep({ id: '1' }), dep({ id: '2', inOpenSolution: false }), dep({ id: '3', kind: 'agent', inOpenSolution: false }), dep({ id: '4', kind: 'app' })]));
        expect(s).toEqual({ total: 4, inSolution: 2, outside: 2, byKind: { flow: 2, agent: 1, app: 1, other: 0 } });
    });
    it('says nothing depends on it, in plain words', () => expect(summaryLine(summarize(report([])))).toBe('Nothing depends on it anywhere in the environment.'));
    it('says how many are in this solution and how many outside, or that all are in it', () => {
        expect(summaryLine(summarize(report([dep({ id: '1' }), dep({ id: '2', inOpenSolution: false })])))).toBe('2 components depend on it: 1 in this solution, 1 outside.');
        expect(summaryLine(summarize(report([dep()])))).toBe('1 component depends on it: all in this solution.');
    });
});

describe('groupDependents', () => {
    it('groups by kind in a fixed order, leaves empty kinds out, and puts what is outside the solution first, then by name', () => {
        const g = groupDependents(report([
            dep({ id: '1', name: 'Zed' }),
            dep({ id: '2', name: 'Beta', inOpenSolution: false }),
            dep({ id: '3', name: 'Alpha', inOpenSolution: false }),
            dep({ id: '4', name: 'An app', kind: 'app' }),
            dep({ id: '5', name: 'An agent', kind: 'agent' }),
        ]));
        expect(g.map(x => x.kind)).toEqual(['flow', 'agent', 'app']);
        expect(g[0]!.items.map(i => i.name)).toEqual(['Alpha', 'Beta', 'Zed']);
        expect(g[0]!.label).toBe('Flows');
    });
});

describe('describeDependent', () => {
    it('gives the name, the kind and where it is, for a message', () => {
        expect(describeDependent(dep({ name: 'Order sync', solutions: ['Sales', 'Shared'], inOpenSolution: false }))).toBe('Order sync (Cloud flow, in Sales and Shared)');
        expect(describeDependent(dep({ name: 'X', solutions: [], inOpenSolution: false }))).toBe('X (Cloud flow, outside this solution)');
        expect(describeDependent(dep({ name: 'X', solutions: [], inOpenSolution: true }))).toBe('X (Cloud flow, in this solution)');
    });
});
