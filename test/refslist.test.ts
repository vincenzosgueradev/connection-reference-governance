// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { buildSnapshot } from '../src/model/analysis';
import { planRepointGroups } from '../src/model/plans';
import { rowsOf } from '../src/views/confirm';
import { flow, guid, input, ref } from './helpers/fixtures';

/** A row that holds several references shows each one on its own line, never one joined text. */

const refs = [ref(1), ref(2), ref(3)];
const snap = buildSnapshot(input({ references: refs, memberReferenceIds: refs.map(r => r.id), flows: [flow(10, ['sample_ref1', 'sample_ref2'], { name: 'Two' })] }));

describe('rows with several references', () => {
    const plan = planRepointGroups(snap, [guid(10)], [{ connectorId: '', from: ['sample_ref1', 'sample_ref2'], target: 'sample_ref3' }]);
    const row = rowsOf(plan, snap)[0]!;
    it('the before side has one line per reference, each found by name', () => {
        const lines = [...(row.from as HTMLElement).querySelectorAll('.ref-inline')];
        expect(lines.map(l => l.querySelector('.conn-name')!.textContent)).toEqual(['Ref 1', 'Ref 2']);
        expect((row.from as HTMLElement).textContent).not.toContain('Not found');
    });
    it('the after side has one line for the new reference', () => {
        expect([...(row.to as HTMLElement).querySelectorAll('.conn-name')].map(l => l.textContent)).toEqual(['Ref 3']);
    });
    it('a single reference is still one line', () => {
        const one = rowsOf(planRepointGroups(snap, [guid(10)], [{ connectorId: '', from: ['sample_ref1'], target: 'sample_ref3' }]), snap)[0]!;
        expect((one.from as HTMLElement).querySelectorAll('.ref-inline')).toHaveLength(1);
    });
});
