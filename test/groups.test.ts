import { describe, expect, it } from 'vitest';
import { buildSnapshot } from '../src/model/analysis';
import { readReferenceNames } from '../src/model/clientdata';
import { groupsImpact, usageShare } from '../src/model/impact';
import { planRepointGroups, writableRows } from '../src/model/plans';
import { clientData, flow, guid, input, ref } from './helpers/fixtures';

/** Feature 013: several categories (connectors) re-pointed in one operation, every flow written once. */

const B = '/providers/Microsoft.PowerApps/apis/shared_b';
const refs = [ref(1), ref(2), ref(3), ref(5, { connectorId: B }), ref(6, { connectorId: B }), ref(7, { connectorId: B })];
const snap = (flows = [
    flow(10, ['sample_ref1', 'sample_ref5'], { name: 'Both' }),
    flow(11, ['sample_ref2'], { name: 'Only A' }),
    flow(12, ['sample_ref6', 'sample_ref5'], { name: 'Only B' }),
    flow(13, ['sample_ref3'], { name: 'Neither' }),
]) => buildSnapshot(input({ references: refs, memberReferenceIds: refs.map(r => r.id), flows }));
const A_GROUP = { connectorId: '/providers/Microsoft.PowerApps/apis/shared_a', from: ['sample_ref1', 'sample_ref2'], target: 'sample_ref3' };
const B_GROUP = { connectorId: B, from: ['sample_ref5', 'sample_ref6'], target: 'sample_ref7' };
const all = [guid(10), guid(11), guid(12), guid(13)];
const names = (payload: string) => { const r = readReferenceNames(payload); return r.ok ? r.value : []; };

describe('planRepointGroups', () => {
    const plan = (groups = [A_GROUP, B_GROUP], ids = all, s = snap()) => planRepointGroups(s, ids, groups);

    it('one row per flow, each flow rewritten once for every group it holds', () => {
        const p = plan();
        expect(p.rows.map(r => [r.label, r.oldValue, r.newValue, r.blocked])).toEqual([
            ['Both', 'sample_ref1, sample_ref5', 'sample_ref3, sample_ref7', undefined],
            ['Only A', 'sample_ref2', 'sample_ref3', undefined],
            ['Only B', 'sample_ref5, sample_ref6', 'sample_ref7', undefined],
            ['Neither', 'sample_ref1, sample_ref2, sample_ref5, sample_ref6', 'sample_ref3, sample_ref7', 'The flow does not use any of the chosen references.'],
        ]);
        expect(names(p.rows[0]!.payload)).toEqual(['sample_ref3', 'sample_ref7']);
        expect(names(p.rows[1]!.payload)).toEqual(['sample_ref3']);
        expect(names(p.rows[2]!.payload)).toEqual(['sample_ref7']);
        expect(writableRows(p)).toHaveLength(3);
        expect(p.rows.every(r => r.affectedFlows === 1)).toBe(true);
    });
    it('a group that has no reference ticked is left alone and does not block', () => {
        const p = plan([A_GROUP, { ...B_GROUP, from: [], target: '' }]);
        expect(p.rows.map(r => r.blocked)).toEqual([undefined, undefined, 'The flow does not use any of the chosen references.', 'The flow does not use any of the chosen references.']);
        expect(names(p.rows[0]!.payload)).toEqual(['sample_ref3', 'sample_ref5']);
    });
    it('only the groups a flow holds are applied to it, the rest of the definition is untouched', () => {
        const s = snap();
        const p = plan([A_GROUP, B_GROUP], [guid(11)], s);
        expect(p.rows[0]!.payload).toBe(s.flows[1]!.flow.clientData.replace('"sample_ref2"', '"sample_ref3"'));
        expect(p.rows[0]!.expectedCurrent).toBe(s.flows[1]!.flow.clientData);
    });
    it('a group without a new reference blocks every row with the reason', () => {
        const p = plan([A_GROUP, { ...B_GROUP, target: '' }]);
        expect(p.rows.every(r => r.blocked !== undefined)).toBe(true);
        expect(p.rows[0]!.blocked).toMatch(/target reference .* does not exist|does not exist/);
    });
    it('a group that mixes connectors, or whose new reference is of another connector, blocks all rows', () => {
        expect(plan([{ ...A_GROUP, from: ['sample_ref1', 'sample_ref5'] }]).rows[0]!.blocked).toMatch(/different connectors/);
        expect(plan([A_GROUP, { ...B_GROUP, target: 'sample_ref3' }]).rows[0]!.blocked).toMatch(/different connector/);
    });
    it('flows that are on, suspended or managed are blocked as before', () => {
        const s = snap([flow(10, ['sample_ref1', 'sample_ref5'], { name: 'On', stateCode: 1 }), flow(11, ['sample_ref2'], { name: 'Susp', stateCode: 2 })]);
        expect(plan([A_GROUP, B_GROUP], [guid(10), guid(11)], s).rows.map(r => r.blocked)).toEqual(['The flow is turned on: turn it off first.', 'The flow is not off (suspended): turn it off first.']);
    });
    it('warns once for the flows that hold more than one chosen reference, and keeps the owner warnings of every new reference', () => {
        const s = snap([flow(10, ['sample_ref1', 'sample_ref2', 'sample_ref5'], { name: 'Two of A' }), flow(11, ['sample_ref6', 'sample_ref5'], { name: 'Two of B' }), flow(12, ['sample_ref1'], { name: 'One' })]);
        const p = plan([A_GROUP, B_GROUP], [guid(10), guid(11), guid(12)], s);
        expect(p.warnings.join(' ')).toMatch(/2 flows hold more than one of the chosen references/);
    });
    it('with one group it is the same plan as the single-category planner', async () => {
        const { planRepoint } = await import('../src/model/plans');
        const s = snap();
        expect(planRepointGroups(s, all, [A_GROUP])).toEqual(planRepoint(s, all, A_GROUP.from, A_GROUP.target));
    });
    it('no group at all, or only empty ones, is an empty choice', () => {
        expect(plan([]).rows.every(r => r.blocked === 'No reference to replace was chosen.')).toBe(true);
        expect(plan([{ ...A_GROUP, from: [], target: '' }]).rows.every(r => r.blocked === 'No reference to replace was chosen.')).toBe(true);
    });
    it('a flow whose clientdata has a shape of its own still keeps everything else', () => {
        const odd = '{ "properties" :{"connectionReferences":{"k":{"connection":{"connectionReferenceLogicalName" : "sample_ref1"}},"j":{"connection":{"connectionReferenceLogicalName":"sample_ref5"}}},"n":12345678901234567890}, "z":0.10 }';
        const s = snap([flow(10, ['sample_ref1', 'sample_ref5'], { name: 'Odd', clientData: odd })]);
        const p = plan([A_GROUP, B_GROUP], [guid(10)], s);
        expect(p.rows[0]!.payload).toBe(odd.replace('"sample_ref1"', '"sample_ref3"').replace('"sample_ref5"', '"sample_ref7"'));
    });
});

describe('groupsImpact and usage shares', () => {
    it('counts the categories ticked, the flows affected once, those turned on, and those with none of them', () => {
        const s = snap([flow(10, ['sample_ref1', 'sample_ref5'], { name: 'Both', stateCode: 1 }), flow(11, ['sample_ref2']), flow(12, ['sample_ref3'])]);
        expect(groupsImpact(s, [guid(10), guid(11), guid(12)], [A_GROUP, B_GROUP])).toEqual({ categories: 2, affected: 2, turnedOn: 1, unrelated: 1 });
    });
    it('a group without references is not a category, the target is never a source', () => {
        const s = snap();
        expect(groupsImpact(s, all, [A_GROUP, { ...B_GROUP, from: [], target: '' }]).categories).toBe(1);
        expect(groupsImpact(s, [guid(13)], [{ ...A_GROUP, from: ['sample_ref3', 'sample_ref1'] }])).toMatchObject({ affected: 0, unrelated: 1 });
    });
    it('the share is a whole percentage of the selected flows, 0 for none', () => {
        expect(usageShare(1, 3)).toBe(33);
        expect(usageShare(2, 3)).toBe(67);
        expect(usageShare(3, 3)).toBe(100);
        expect(usageShare(0, 3)).toBe(0);
        expect(usageShare(0, 0)).toBe(0);
    });
});

describe('clientData stays valid when many groups edit one flow', () => {
    it('every flow of the matrix is valid JSON after the chained edits', () => {
        const names = ['sample_ref1', 'sample_ref2', 'sample_ref5', 'sample_ref6'];
        for (let mask = 1; mask < 16; mask++) {
            const held = names.filter((_, i) => (mask >> i) & 1);
            const s = snap([flow(10, held, { name: 'F', clientData: clientData(held) })]);
            const p = planRepointGroups(s, [guid(10)], [A_GROUP, B_GROUP]);
            expect(p.rows[0]!.blocked, held.join()).toBeUndefined();
            expect(() => JSON.parse(p.rows[0]!.payload)).not.toThrow();
            expect(names.some(n => readReferenceNames(p.rows[0]!.payload).ok && (readReferenceNames(p.rows[0]!.payload) as { value: string[] }).value.includes(n))).toBe(false);
        }
    });
});

describe('the new reference is one of the chosen ones (hand test)', () => {
    const both = { connectorId: '', from: ['sample_ref1', 'sample_ref2'], target: 'sample_ref1' };
    const s = () => snap([flow(10, ['sample_ref1'], { name: 'Has target' }), flow(11, ['sample_ref2'], { name: 'Has other' }), flow(12, ['sample_ref1', 'sample_ref2'], { name: 'Has both' }), flow(13, ['sample_ref3'], { name: 'Neither' })]);
    it('a flow that already uses it is not an error: it says so and nothing is written for it', () => {
        const p = planRepointGroups(s(), all, [both]);
        expect(p.rows.map(r => r.blocked)).toEqual(['Already uses the new reference: nothing to change.', undefined, undefined, 'The flow does not use any of the chosen references.']);
        expect(writableRows(p).map(r => r.label)).toEqual(['Has other', 'Has both']);
    });
    it('a flow that holds the target and another chosen reference is rewritten to hold the target only', () => {
        const p = planRepointGroups(s(), all, [both]);
        expect(names(p.rows[2]!.payload)).toEqual(['sample_ref1']);
        expect(names(p.rows[1]!.payload)).toEqual(['sample_ref1']);
    });
    it('does not count as affected: the figures say it is without the references to replace', () => {
        expect(groupsImpact(s(), all, [both])).toMatchObject({ affected: 2, unrelated: 2 });
    });
});
