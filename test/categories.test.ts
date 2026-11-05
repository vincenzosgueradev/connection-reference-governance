import { describe, expect, it } from 'vitest';
import { buildSnapshot } from '../src/model/analysis';
import { categoriesOf, stepStatus } from '../src/model/repoint';
import { flow, guid, input, ref } from './helpers/fixtures';

/** Feature 014: the connectors a re-point goes through, one step each, and how each step stands. */

const B = '/providers/Microsoft.PowerApps/apis/shared_b';
const refs = [ref(1), ref(2), ref(3, { connectorId: B }), ref(4, { connectorId: B })];
const snap = buildSnapshot(input({
    references: refs,
    memberReferenceIds: refs.map(r => r.id),
    flows: [flow(10, ['sample_ref1', 'sample_ref3'], { name: 'F10' }), flow(11, ['sample_ref3'], { name: 'F11' }), flow(12, ['sample_ref2'], { name: 'F12' })],
}));

describe('categoriesOf', () => {
    it('one category per connector used by the selected flows, in the order of the references (most used first)', () => {
        const c = categoriesOf(snap, [guid(10), guid(11), guid(12)]);
        expect(c.map(x => [x.connectorId.split('_').pop(), x.sources.map(s => s.logicalName)])).toEqual([['b', ['sample_ref3']], ['a', ['sample_ref1', 'sample_ref2']]]);
    });
    it('only the connectors the selection uses', () => {
        expect(categoriesOf(snap, [guid(12)]).map(x => x.sources.map(s => s.logicalName))).toEqual([['sample_ref2']]);
    });
    it('no selection, or flows that are not in the solution, give no category', () => {
        expect(categoriesOf(snap, [])).toEqual([]);
        expect(categoriesOf(snap, ['nope'])).toEqual([]);
    });
});

describe('stepStatus', () => {
    const g = (from: string[], target: string) => ({ connectorId: 'x', from, target });
    it('not changed when nothing is chosen for the connector', () => expect(stepStatus(undefined)).toBe('empty'));
    it('incomplete when references are ticked and no new reference is chosen', () => expect(stepStatus(g(['a'], ''))).toBe('incomplete'));
    it('done when both are chosen', () => expect(stepStatus(g(['a'], 'b'))).toBe('done'));
    it('a group with no references is not changed', () => expect(stepStatus(g([], 'b'))).toBe('empty'));
});
