import { describe, expect, it } from 'vitest';
import { buildSnapshot } from '../src/model/analysis';
import { repointSources, repointTargets } from '../src/model/repoint';
import { flow, guid, input, ref } from './helpers/fixtures';

const B = '/providers/Microsoft.PowerApps/apis/shared_b';
const refs = [ref(1), ref(2), ref(3, { connectorId: B }), ref(4, { connectorId: B }), ref(5)];
const snap = (over = {}) => buildSnapshot(input({ references: refs, memberReferenceIds: refs.map(r => r.id), ...over }));

describe('repointTargets: only what the planner would accept', () => {
    it('offers the other references of the same connector, by name', () => {
        const s = snap();
        expect(repointTargets(s, 'sample_ref1').map(r => r.logicalName)).toEqual(['sample_ref2', 'sample_ref5']);
        expect(repointTargets(s, 'sample_ref3').map(r => r.logicalName)).toEqual(['sample_ref4']);
    });
    it('never offers the reference to replace itself, nor another connector', () => {
        const s = snap();
        for (const r of refs) {
            const t = repointTargets(s, r.logicalName);
            expect(t.map(x => x.logicalName)).not.toContain(r.logicalName);
            expect(t.every(x => x.connectorId === r.connectorId)).toBe(true);
        }
    });
    it('offers only references of this solution', () => {
        const s = snap({ memberReferenceIds: [guid(1), guid(2)] });
        expect(repointTargets(s, 'sample_ref1').map(r => r.logicalName)).toEqual(['sample_ref2']);
    });
    it('offers nothing for an empty or unknown reference to replace', () => {
        expect(repointTargets(snap(), '')).toEqual([]);
        expect(repointTargets(snap(), 'ghost')).toEqual([]);
    });
    it('offers nothing when there is no other reference of that connector', () => {
        expect(repointTargets(snap({ references: [ref(1), ref(3, { connectorId: B })], memberReferenceIds: [guid(1), guid(3)] }), 'sample_ref1')).toEqual([]);
    });
    it('is sorted by name, ignoring case', () => {
        const s = snap({ references: [ref(1), ref(2, { displayName: 'zeta' }), ref(5, { displayName: 'Alpha' })], memberReferenceIds: [guid(1), guid(2), guid(5)] });
        expect(repointTargets(s, 'sample_ref1').map(r => r.displayName)).toEqual(['Alpha', 'zeta']);
    });
});

describe('repointSources: the references used by the selected flows', () => {
    const flows = [flow(10, ['sample_ref1', 'sample_ref3']), flow(11, ['sample_ref1']), flow(12, ['sample_ref2'])];
    const s = () => snap({ flows });

    it('lists each used reference once, with how many of the selected flows use it', () => {
        const r = repointSources(s(), [guid(10), guid(11), guid(12)]);
        expect(r.map(x => [x.logicalName, x.used, x.selected])).toEqual([['sample_ref1', 2, 3], ['sample_ref2', 1, 3], ['sample_ref3', 1, 3]]);
    });
    it('counts only the selected flows', () => {
        expect(repointSources(s(), [guid(11)]).map(x => [x.logicalName, x.used, x.selected])).toEqual([['sample_ref1', 1, 1]]);
    });
    it('is empty for no selection and ignores ids that are not flows', () => {
        expect(repointSources(s(), [])).toEqual([]);
        expect(repointSources(s(), ['nope'])).toEqual([]);
    });
    it('skips references that do not exist in the environment (nothing to replace them with a compatible one)', () => {
        const r = repointSources(snap({ flows: [flow(10, ['ghost', 'sample_ref1'])] }), [guid(10)]);
        expect(r.map(x => x.logicalName)).toEqual(['sample_ref1']);
    });
});
