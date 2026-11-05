import { describe, expect, it } from 'vitest';
import { buildSnapshot, ownersFound } from '../src/model/analysis';
import { clientData, flow, guid, input, ref } from './helpers/fixtures';

describe('flags (T6): only what the data proves', () => {
    it('flags a reference with no connection', () => {
        const i = input({ references: [ref(1, { connectionId: '' })], memberReferenceIds: [guid(1)], flows: [] });
        const s = buildSnapshot(i);
        expect(s.references[0]!.flags.map(f => f.kind)).toEqual(['no-connection']);
    });
    it('flags a missing reference on the flow', () => {
        const s = buildSnapshot(input({ flows: [flow(10, ['sample_ref1', 'ghost'])] }));
        const f = s.flows[0]!;
        expect(f.flags.map(x => x.kind)).toEqual(['missing-reference']);
        expect(f.flags[0]!.detail).toContain('ghost');
    });
    it('does not flag a healthy setup', () => {
        const s = buildSnapshot(input());
        expect(s.flows.every(f => f.flags.length === 0)).toBe(true);
        expect(s.references.every(r => r.flags.length === 0)).toBe(true);
    });

    // matrix: connection info present/absent x owner matches x connected x expected owner chosen
    for (const info of [undefined, { ownerName: 'Owner A', connected: true }, { ownerName: 'Owner B', connected: true }, { ownerName: 'Owner A', connected: false }, { ownerName: 'Owner B', connected: false }])
        for (const expected of ['', 'Owner A'])
            it(`connection info ${JSON.stringify(info)} expected "${expected}"`, () => {
                const r = ref(1);
                const i = input({ references: [r], memberReferenceIds: [r.id], flows: [], connections: info ? { [r.connectionId]: info } : {} });
                const kinds = buildSnapshot(i, expected).references[0]!.flags.map(f => f.kind);
                const want: string[] = [];
                if (info && expected !== '' && info.ownerName !== expected) want.push('other-owner');
                if (info && !info.connected) want.push('not-connected');
                expect(kinds).toEqual(want);
            });

    it('never reports an owner flag before an owner is chosen', () => {
        const r = ref(1);
        const s = buildSnapshot(input({ references: [r], memberReferenceIds: [r.id], flows: [], connections: { [r.connectionId]: { ownerName: 'X', connected: true } } }));
        expect(s.references[0]!.flags).toEqual([]);
    });
});

describe('views agree', () => {
    it('reference -> flows equals flow -> references for the same fixtures', () => {
        const s = buildSnapshot(input());
        for (const rv of s.references)
            for (const fv of s.flows)
                expect(rv.flowIds.includes(fv.flow.id)).toBe(fv.uses.some(u => u.logicalName === rv.reference.logicalName));
    });
    it('lists an unused reference with zero flows', () => {
        const s = buildSnapshot(input());
        expect(s.references.find(r => r.reference.id === guid(3))!.flowIds).toEqual([]);
    });
    it('lists only members of the solution', () => {
        const i = input();
        const s = buildSnapshot({ ...i, memberReferenceIds: [guid(1)] });
        expect(s.references.map(r => r.reference.id)).toEqual([guid(1)]);
        expect(s.allReferences.length).toBe(3);
    });
});

describe('edge cases', () => {
    it('keeps a flow with no references', () => {
        const s = buildSnapshot(input({ flows: [flow(10, [])] }));
        expect(s.flows[0]!.uses).toEqual([]);
        expect(s.flows[0]!.unreadable).toBe(false);
    });
    it('marks an unreadable definition without crashing', () => {
        const s = buildSnapshot(input({ flows: [flow(10, [], { clientData: 'broken' })] }));
        expect(s.flows[0]!.unreadable).toBe(true);
    });
    it('handles an empty solution', () => {
        const s = buildSnapshot(input({ flows: [], references: [], memberReferenceIds: [] }));
        expect(s.flows).toEqual([]);
        expect(s.references).toEqual([]);
    });
    it('ownersFound lists distinct sorted owners', () => {
        expect(ownersFound(input({ connections: { a: { ownerName: 'B', connected: true }, b: { ownerName: 'A', connected: true }, c: { ownerName: 'B', connected: true } } }))).toEqual(['A', 'B']);
    });
    it('clientData helper declares what it says', () => {
        expect(JSON.parse(clientData(['x'])).properties.connectionReferences.shared_k0.connection.connectionReferenceLogicalName).toBe('x');
    });
});
