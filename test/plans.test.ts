import { describe, expect, it } from 'vitest';
import { buildSnapshot } from '../src/model/analysis';
import { affectedFlowTotal, planConnectionChange, planRepoint, writableRows } from '../src/model/plans';
import { flow, guid, input, OTHER_USER, ref, solution, USER } from './helpers/fixtures';

const snap = (over = {}) => buildSnapshot(input(over));

describe('planConnectionChange', () => {
    it('lists exactly the selected rows with old/new value and flows affected', () => {
        const p = planConnectionChange(snap(), [guid(1), guid(2)], 'new-conn');
        expect(p.entity).toBe('connectionreference');
        expect(p.rows.map(r => [r.id, r.oldValue, r.newValue, r.payload, r.affectedFlows, r.blocked])).toEqual([
            [guid(1), 'conn-1', 'new-conn', 'new-conn', 2, undefined],
            [guid(2), 'conn-2', 'new-conn', 'new-conn', 1, undefined],
        ]);
        expect(affectedFlowTotal(p)).toBe(3);
    });
    it('ignores ids that are not references of the solution', () => {
        expect(planConnectionChange(snap(), [guid(99)], 'x').rows).toEqual([]);
    });
    // negative matrix
    it('blocks every row of a managed solution', () => {
        const p = planConnectionChange(snap({ solution: solution(true) }), [guid(1)], 'x');
        expect(writableRows(p)).toEqual([]);
    });
    it('blocks a managed reference', () => {
        const s = snap({ references: [ref(1, { managed: true })], memberReferenceIds: [guid(1)] });
        expect(writableRows(planConnectionChange(s, [guid(1)], 'x'))).toEqual([]);
    });
    it('blocks an empty or blank target', () => {
        for (const v of ['', '  ']) expect(writableRows(planConnectionChange(snap(), [guid(1)], v))).toEqual([]);
    });
    it('blocks when the connection is unchanged', () => {
        expect(planConnectionChange(snap(), [guid(1)], 'conn-1').rows[0]!.blocked).toBeTruthy();
    });
    it('empty selection gives an empty plan', () => {
        expect(planConnectionChange(snap(), [], 'x').rows).toEqual([]);
    });
    it('hard stop when the selection mixes connectors', () => {
        const p = planConnectionChange(snap(), [guid(1), guid(3)], 'x');
        expect(writableRows(p)).toEqual([]);
        expect(p.rows.every(r => /different connectors/.test(r.blocked ?? ''))).toBe(true);
    });
    it('warns about a connection id no reference of the connector uses', () => {
        expect(planConnectionChange(snap(), [guid(1)], 'never-seen').warnings.join(' ')).toMatch(/not used by any reference of this connector/);
    });
    it('does not warn about a connection id already used by the same connector', () => {
        expect(planConnectionChange(snap(), [guid(1)], 'conn-2').warnings.join(' ')).not.toMatch(/not used by any/);
    });
    it('a connection id used only by another connector still warns', () => {
        expect(planConnectionChange(snap(), [guid(1)], 'conn-3').warnings.join(' ')).toMatch(/not used by any reference of this connector/);
    });
    it('counts affected flows that are turned on and says so', () => {
        const s = snap({ flows: [flow(10, ['sample_ref1'], { stateCode: 1 }), flow(11, ['sample_ref1'])] });
        const p = planConnectionChange(s, [guid(1)], 'conn-2');
        expect(p.rows[0]!.affectedOn).toBe(1);
        expect(p.warnings.join(' ')).toMatch(/1 affected flows are turned on/);
    });
    it('warns about references owned by someone else only when the current user is known', () => {
        const s = snap({ references: [ref(1, { ownerId: OTHER_USER })], memberReferenceIds: [guid(1)] });
        expect(planConnectionChange(s, [guid(1)], 'conn-9', USER).warnings.join(' ')).toMatch(/owned by someone else/);
        expect(planConnectionChange(s, [guid(1)], 'conn-9', '').warnings.join(' ')).not.toMatch(/owned by someone else/);
    });
    it('remembers the current connection so apply can detect a change', () => {
        expect(planConnectionChange(snap(), [guid(1)], 'x').rows[0]!.expectedCurrent).toBe('conn-1');
    });
});

describe('planRepoint', () => {
    it('rewrites only the reference name', () => {
        const p = planRepoint(snap(), [guid(10)], 'sample_ref1', 'sample_ref2');
        const row = p.rows[0]!;
        expect(row.blocked).toBeUndefined();
        expect(row.field).toBe('clientdata');
        expect(JSON.parse(row.payload).properties.connectionReferences.shared_k0.connection.connectionReferenceLogicalName).toBe('sample_ref2');
        expect([row.oldValue, row.newValue]).toEqual(['sample_ref1', 'sample_ref2']);
    });
    const blocked = (s: ReturnType<typeof snap>, ids: string[], from: string, to: string) => planRepoint(s, ids, from, to).rows[0]!.blocked;
    it('hard stop on a different connector', () => expect(blocked(snap(), [guid(10)], 'sample_ref1', 'sample_ref3')).toMatch(/connector/));
    it('blocks a target that does not exist', () => expect(blocked(snap(), [guid(10)], 'sample_ref1', 'nope')).toMatch(/does not exist/));
    it('blocks a target outside the solution', () => {
        const s = snap({ memberReferenceIds: [guid(1), guid(3)] });
        expect(blocked(s, [guid(10)], 'sample_ref1', 'sample_ref2')).toMatch(/not in this solution/);
    });
    it('blocks a flow that is turned on', () => {
        const s = snap({ flows: [flow(10, ['sample_ref1'], { stateCode: 1 })] });
        expect(blocked(s, [guid(10)], 'sample_ref1', 'sample_ref2')).toMatch(/turn it off/);
    });
    // matrix over flow state: only a flow that is off is rewritten
    for (const [state, allowed] of [[0, true], [1, false], [2, false], [7, false]] as const)
        it(`flow state ${state} ${allowed ? 'is allowed' : 'is blocked'}`, () => {
            const s = snap({ flows: [flow(10, ['sample_ref1'], { stateCode: state })] });
            expect(blocked(s, [guid(10)], 'sample_ref1', 'sample_ref2') === undefined).toBe(allowed);
        });
    it('warns when the target reference belongs to someone else', () => {
        const s = snap({ references: [ref(1), ref(2, { ownerId: OTHER_USER })], memberReferenceIds: [guid(1), guid(2)] });
        expect(planRepoint(s, [guid(10)], 'sample_ref1', 'sample_ref2', USER).warnings.join(' ')).toMatch(/owned by someone else/);
        expect(planRepoint(s, [guid(10)], 'sample_ref1', 'sample_ref2', OTHER_USER).warnings).toEqual([]);
        expect(planRepoint(s, [guid(10)], 'sample_ref1', 'sample_ref2', '').warnings).toEqual([]);
    });
    it('keeps the exact current definition so apply can detect a change', () => {
        const s = snap();
        expect(planRepoint(s, [guid(10)], 'sample_ref1', 'sample_ref2').rows[0]!.expectedCurrent).toBe(s.flows[0]!.flow.clientData);
    });
    it('blocks managed solution and managed flow', () => {
        expect(blocked(snap({ solution: solution(true) }), [guid(10)], 'sample_ref1', 'sample_ref2')).toBeTruthy();
        expect(blocked(snap({ flows: [flow(10, ['sample_ref1'], { managed: true })] }), [guid(10)], 'sample_ref1', 'sample_ref2')).toBeTruthy();
    });
    it('blocks a flow that does not use the reference', () => {
        expect(blocked(snap(), [guid(10)], 'sample_ref2', 'sample_ref1')).toMatch(/does not use any of the chosen references/);
    });
    it('blocks the same reference', () => expect(blocked(snap(), [guid(10)], 'sample_ref1', 'sample_ref1')).toBeTruthy());
    it('blocks an unreadable definition', () => {
        const s = snap({ flows: [flow(10, [], { clientData: 'broken' })] });
        expect(blocked(s, [guid(10)], 'sample_ref1', 'sample_ref2')).toBeTruthy();
    });
    it('one bad row does not block the others', () => {
        const s = snap({ flows: [flow(10, ['sample_ref1'], { stateCode: 1 }), flow(11, ['sample_ref1'])] });
        const p = planRepoint(s, [guid(10), guid(11)], 'sample_ref1', 'sample_ref2');
        expect(writableRows(p).map(r => r.id)).toEqual([guid(11)]);
    });
    it('empty solution and empty selection give empty plans', () => {
        expect(planRepoint(snap({ flows: [] }), [guid(10)], 'a', 'b').rows).toEqual([]);
        expect(planRepoint(snap(), [], 'a', 'b').rows).toEqual([]);
    });
});
