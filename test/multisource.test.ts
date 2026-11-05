import { describe, expect, it } from 'vitest';
import { buildSnapshot } from '../src/model/analysis';
import { readReferenceNames, repointClientData } from '../src/model/clientdata';
import { isCompatibleTarget, repointSources, repointTargets, sourcesAreOneConnector } from '../src/model/repoint';
import { planRepoint, writableRows } from '../src/model/plans';
import { clientData, flow, guid, input, ref, solution } from './helpers/fixtures';

/** Feature 009: several references to replace, one to use instead. */

const B = '/providers/Microsoft.PowerApps/apis/shared_b';
// three references of connector A, one more of A outside the solution, two of B
const refs = [ref(1), ref(2), ref(3), ref(4), ref(5, { connectorId: B }), ref(6, { connectorId: B })];
const inSolution = refs.filter(r => r.logicalName !== 'sample_ref4');
const snap = (flows = [flow(10, ['sample_ref1', 'sample_ref2', 'sample_ref3'], { name: 'Three' })], over = {}) =>
    buildSnapshot(input({ solution: solution(), references: refs, memberReferenceIds: inSolution.map(r => r.id), flows, ...over }));

describe('repointClientData with several references to replace', () => {
    const names = (text: string) => { const r = readReferenceNames(text); return r.ok ? r.value : []; };
    it('replaces every chosen reference the flow holds by the new one, in one edit', () => {
        const src = clientData(['sample_ref1', 'sample_ref2', 'keep']);
        const r = repointClientData(src, ['sample_ref1', 'sample_ref2'], 'sample_ref3');
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(names(r.value)).toEqual(['sample_ref3', 'keep']);
            const doc = JSON.parse(r.value);
            expect(Object.values(doc.properties.connectionReferences).map((e: any) => e.connection.connectionReferenceLogicalName)).toEqual(['sample_ref3', 'sample_ref3', 'keep']);
        }
    });
    it('changes nothing else: the text differs only where the names were', () => {
        const src = '{ "properties" :{"connectionReferences":{"k1":{"connection":{"connectionReferenceLogicalName" : "a"}},"k2":{"connection":{"connectionReferenceLogicalName":"b"},"x":1.0}},"d":12345678901234567890},  "z":0.10 }';
        const r = repointClientData(src, ['a', 'b'], 'c');
        expect(r).toEqual({ ok: true, value: src.replace('"a"', '"c"').replace('"b"', '"c"') });
    });
    it('the new reference may be one of the chosen ones: it is not replaced by itself', () => {
        const src = clientData(['a', 'b', 'c']);
        const r = repointClientData(src, ['a', 'b', 'c'], 'c');
        expect(r.ok && names(r.value)).toEqual(['c']);
    });
    it('a flow that holds only some of the chosen references has only those replaced', () => {
        const r = repointClientData(clientData(['a', 'z']), ['a', 'b'], 'c');
        expect(r.ok && names(r.value)).toEqual(['c', 'z']);
    });
    it('fails when the flow holds none of them, or when nothing would change', () => {
        expect(repointClientData(clientData(['x', 'y']), ['a', 'b'], 'c').ok).toBe(false);
        expect(repointClientData(clientData(['c']), ['c'], 'c').ok).toBe(false);
        expect(repointClientData(clientData(['a']), [], 'c').ok).toBe(false);
    });
    it('one chosen reference given as a string works as before', () => {
        const r = repointClientData(clientData(['a']), 'a', 'b');
        expect(r.ok && names(r.value)).toEqual(['b']);
    });
    it('regex characters in names are not patterns, even with several', () => {
        const r = repointClientData(clientData(['a.b', 'c+d']), ['a.b', 'c+d'], 'x$&y');
        expect(r.ok && names(r.value)).toEqual(['x$&y']);
        expect(repointClientData(clientData(['aXb']), ['a.b', 'c+d'], 'z').ok).toBe(false);
    });
    // oracle: every shape x every subset of chosen references
    const shapes = [['a'], ['a', 'b'], ['a', 'b', 'c'], ['a', 'a', 'b'], []];
    for (const shape of shapes)
        for (const chosen of [['a'], ['a', 'b'], ['b', 'c'], ['a', 'b', 'c'], ['q']])
            for (const to of ['a', 'c', 'z'])
                it(`matrix: ${JSON.stringify(shape)} replace ${JSON.stringify(chosen)} by ${to}`, () => {
                    const src = clientData(shape);
                    const effective = chosen.filter(c => c !== to);
                    const holds = shape.some(n => effective.includes(n));
                    const r = repointClientData(src, chosen, to);
                    expect(r.ok).toBe(holds);
                    if (r.ok) {
                        const expected = JSON.parse(src);
                        for (const e of Object.values(expected.properties.connectionReferences ?? {}) as { connection: { connectionReferenceLogicalName: string } }[])
                            if (effective.includes(e.connection.connectionReferenceLogicalName)) e.connection.connectionReferenceLogicalName = to;
                        expect(JSON.parse(r.value)).toEqual(expected);
                    }
                });
});

describe('sources of one connector', () => {
    it('are accepted when they all exist and share a connector', () => {
        expect(sourcesAreOneConnector(snap(), ['sample_ref1', 'sample_ref2'])).toBe(true);
        expect(sourcesAreOneConnector(snap(), [])).toBe(false);
    });
    it('are refused when they mix connectors or one does not exist', () => {
        expect(sourcesAreOneConnector(snap(), ['sample_ref1', 'sample_ref5'])).toBe(false);
        expect(sourcesAreOneConnector(snap(), ['sample_ref1', 'ghost'])).toBe(false);
    });
});

describe('repointTargets for several references to replace', () => {
    const t = (from: string[]) => repointTargets(snap(), from).map(r => r.logicalName);
    it('are the references of that connector in the solution, the chosen ones included', () => {
        expect(t(['sample_ref1', 'sample_ref2'])).toEqual(['sample_ref1', 'sample_ref2', 'sample_ref3']);
    });
    it('with one chosen reference, that reference is not offered (nothing to replace)', () => {
        expect(t(['sample_ref1'])).toEqual(['sample_ref2', 'sample_ref3']);
    });
    it('never offer a reference of another connector or outside the solution', () => {
        for (const from of [['sample_ref1'], ['sample_ref1', 'sample_ref2'], ['sample_ref5'], ['sample_ref5', 'sample_ref6']]) {
            const kinds = new Set(repointTargets(snap(), from).map(r => r.connectorId));
            expect(kinds.size).toBeLessThanOrEqual(1);
            expect(t(from)).not.toContain('sample_ref4');
        }
        expect(t(['sample_ref5', 'sample_ref6'])).toEqual(['sample_ref5', 'sample_ref6']);
    });
    it('nothing is offered for no source, an unknown source or mixed connectors', () => {
        expect(t([])).toEqual([]);
        expect(t(['ghost'])).toEqual([]);
        expect(t(['sample_ref1', 'sample_ref5'])).toEqual([]);
    });
    it('a single string works as before', () => {
        expect(repointTargets(snap(), 'sample_ref1').map(r => r.logicalName)).toEqual(['sample_ref2', 'sample_ref3']);
        expect(isCompatibleTarget(snap(), ['sample_ref1', 'sample_ref2'], 'sample_ref3')).toBe(true);
        expect(isCompatibleTarget(snap(), ['sample_ref1', 'sample_ref2'], 'sample_ref5')).toBe(false);
    });
});

describe('repointSources groups what the selected flows use', () => {
    it('lists every reference used by the selected flows with its connector and how many flows use it', () => {
        const s = snap([flow(10, ['sample_ref1', 'sample_ref5'], { name: 'A' }), flow(11, ['sample_ref1', 'sample_ref2'], { name: 'B' })]);
        expect(repointSources(s, [guid(10), guid(11)]).map(x => [x.logicalName, x.connectorId.split('_').pop(), x.used, x.selected])).toEqual([
            ['sample_ref1', 'a', 2, 2], ['sample_ref2', 'a', 1, 2], ['sample_ref5', 'b', 1, 2],
        ]);
    });
});

describe('planRepoint with several references to replace', () => {
    const plan = (s = snap(), flows = [guid(10)], from: string[] = ['sample_ref1', 'sample_ref2'], to = 'sample_ref3') => planRepoint(s, flows, from, to);

    it('one row per flow, replacing every chosen reference it holds', () => {
        const s = snap([flow(10, ['sample_ref1', 'sample_ref2', 'sample_ref3'], { name: 'Three' }), flow(11, ['sample_ref1'], { name: 'One' })]);
        const p = plan(s, [guid(10), guid(11)]);
        expect(p.rows.map(r => [r.label, r.oldValue, r.newValue, r.blocked])).toEqual([
            ['Three', 'sample_ref1, sample_ref2', 'sample_ref3', undefined],
            ['One', 'sample_ref1', 'sample_ref3', undefined],
        ]);
        expect(JSON.parse(p.rows[0]!.payload).properties.connectionReferences.shared_k1.connection.connectionReferenceLogicalName).toBe('sample_ref3');
        expect(readReferenceNames(p.rows[0]!.payload)).toEqual({ ok: true, value: ['sample_ref3'] });
    });
    it('a flow that uses none of the chosen references is blocked with the reason, and not counted', () => {
        const s = snap([flow(10, ['sample_ref1'], { name: 'Uses' }), flow(11, ['sample_ref6'], { name: 'Other' })]);
        const p = plan(s, [guid(10), guid(11)]);
        expect(p.rows[1]!.blocked).toBe('The flow does not use any of the chosen references.');
        expect(writableRows(p).map(r => r.label)).toEqual(['Uses']);
    });
    it('a flow that holds two of the chosen references makes a warning, one that holds one does not', () => {
        const two = plan(snap([flow(10, ['sample_ref1', 'sample_ref2'], { name: 'Two' })]));
        expect(two.warnings.join(' ')).toMatch(/1 flow holds more than one of the chosen references/);
        const one = plan(snap([flow(10, ['sample_ref1'], { name: 'One' })]));
        expect(one.warnings.join(' ')).not.toMatch(/more than one/);
        const many = plan(snap([flow(10, ['sample_ref1', 'sample_ref2'], { name: 'A' }), flow(11, ['sample_ref1', 'sample_ref2'], { name: 'B' })]), [guid(10), guid(11)]);
        expect(many.warnings.join(' ')).toMatch(/2 flows hold more than one/);
    });
    it('the target may be one of the chosen references: the flow keeps it and the others become it', () => {
        const p = plan(snap([flow(10, ['sample_ref1', 'sample_ref2', 'sample_ref3'], { name: 'Three' })]), [guid(10)], ['sample_ref1', 'sample_ref2', 'sample_ref3'], 'sample_ref3');
        expect(p.rows[0]!.blocked).toBeUndefined();
        expect(p.rows[0]!.oldValue).toBe('sample_ref1, sample_ref2');
        expect(readReferenceNames(p.rows[0]!.payload)).toEqual({ ok: true, value: ['sample_ref3'] });
    });
    it('blocks every row when the chosen references are of different connectors, or the target is', () => {
        expect(plan(snap(), [guid(10)], ['sample_ref1', 'sample_ref5']).rows[0]!.blocked).toMatch(/different connectors/);
        expect(plan(snap(), [guid(10)], ['sample_ref1', 'sample_ref2'], 'sample_ref5').rows[0]!.blocked).toMatch(/different connector/);
    });
    it('blocks when a chosen reference or the target does not exist or is outside the solution', () => {
        expect(plan(snap(), [guid(10)], ['sample_ref1', 'ghost']).rows[0]!.blocked).toMatch(/does not exist/);
        expect(plan(snap(), [guid(10)], ['sample_ref1', 'sample_ref2'], 'sample_ref4').rows[0]!.blocked).toMatch(/not in this solution/);
    });
    it('keeps every other block: flows that are on, managed, suspended', () => {
        const s = snap([flow(10, ['sample_ref1'], { name: 'On', stateCode: 1 }), flow(11, ['sample_ref1'], { name: 'Susp', stateCode: 2 })]);
        const p = plan(s, [guid(10), guid(11)]);
        expect(p.rows.map(r => r.blocked)).toEqual(['The flow is turned on: turn it off first, or allow the tool to turn it off in the confirmation.', 'The flow is not off (suspended): turn it off first.']);
    });
    it('with one chosen reference given as a string it is the same plan as before', () => {
        const s = snap();
        const a = planRepoint(s, [guid(10)], 'sample_ref1', 'sample_ref3');
        const b = planRepoint(s, [guid(10)], ['sample_ref1'], 'sample_ref3');
        expect(a).toEqual(b);
        expect(a.rows[0]!.oldValue).toBe('sample_ref1');
    });
    it('keeps the exact stored definition for the check before the write', () => {
        const s = snap();
        expect(plan(s).rows[0]!.expectedCurrent).toBe(s.flows[0]!.flow.clientData);
    });
});
