import { describe, expect, it } from 'vitest';
import { buildSnapshot } from '../src/model/analysis';
import { connectionImpact, repointImpact } from '../src/model/impact';
import { flow, guid, input, ref } from './helpers/fixtures';

/** Feature 010: what a choice will touch, computed from the choices and the selection only. */

const refs = [ref(1), ref(2), ref(3)];
const snap = () => buildSnapshot(input({
    references: refs,
    memberReferenceIds: refs.map(r => r.id),
    flows: [
        flow(10, ['sample_ref1', 'sample_ref2'], { name: 'Off both' }),
        flow(11, ['sample_ref1'], { name: 'On one', stateCode: 1 }),
        flow(12, ['sample_ref3'], { name: 'Other' }),
    ],
}));
const all = [guid(10), guid(11), guid(12)];

describe('repointImpact', () => {
    it('counts the selected flows that hold a chosen reference, those turned on, and those that hold none', () => {
        expect(repointImpact(snap(), all, ['sample_ref1'], 'sample_ref2')).toEqual({ affected: 2, turnedOn: 1, unrelated: 1 });
    });
    it('several sources count a flow once', () => {
        expect(repointImpact(snap(), all, ['sample_ref1', 'sample_ref2'], 'sample_ref3')).toEqual({ affected: 2, turnedOn: 1, unrelated: 1 });
    });
    it('the target is not a source: a flow that holds only the target is not affected', () => {
        expect(repointImpact(snap(), [guid(10), guid(12)], ['sample_ref1', 'sample_ref3'], 'sample_ref3')).toEqual({ affected: 1, turnedOn: 0, unrelated: 1 });
    });
    it('no source, or no target yet, still counts what the sources touch', () => {
        expect(repointImpact(snap(), all, [], '')).toEqual({ affected: 0, turnedOn: 0, unrelated: 3 });
        expect(repointImpact(snap(), all, ['sample_ref1'], '')).toEqual({ affected: 2, turnedOn: 1, unrelated: 1 });
    });
    it('ignores ids that are not flows of the solution', () => {
        expect(repointImpact(snap(), ['nope'], ['sample_ref1'], 'sample_ref2')).toEqual({ affected: 0, turnedOn: 0, unrelated: 0 });
    });
});

describe('connectionImpact', () => {
    it('counts the flows that use the chosen references once, and those turned on', () => {
        const s = snap();
        const ids = [refs[0]!.id, refs[1]!.id];
        expect(connectionImpact(s, ids)).toEqual({ references: 2, flows: 2, turnedOn: 1 });
    });
    it('nothing chosen touches nothing', () => {
        expect(connectionImpact(snap(), [])).toEqual({ references: 0, flows: 0, turnedOn: 0 });
    });
});
