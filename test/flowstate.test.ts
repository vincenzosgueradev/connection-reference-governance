import { describe, expect, it } from 'vitest';
import { buildSnapshot } from '../src/model/analysis';
import { planRepointGroups, turnOffRows } from '../src/model/plans';
import { applyPlan } from '../src/services/dataverse';
import { clientData, flow, guid, input } from './helpers/fixtures';
import { REQUEST, defaultReferences, scenario, type ScenarioOptions } from './helpers/scenario';

/** Feature 011: flows that are on are turned off for the write and on again after it, only with permission. */

const mk = (n: number, stateCode: number, name = `F${n}`) => flow(n, ['sample_ref1'], { name, stateCode, clientData: clientData(['sample_ref1'], {}, REQUEST) });
const GROUP = { connectorId: '', from: ['sample_ref1'], target: 'sample_ref2' };

function setup(flows: ReturnType<typeof mk>[], opts: ScenarioOptions = {}, manage = true) {
    const sc = scenario({ flows, ...opts });
    const refs = defaultReferences();
    const snap = buildSnapshot(input({ references: refs, memberReferenceIds: refs.map(r => r.id), flows }));
    const plan = planRepointGroups(snap, flows.map(f => f.id), [GROUP], '', manage);
    return { ...sc, plan };
}
const names = (calls: { updates: { id: string; record: Record<string, unknown> }[] }) => calls.updates.map(u => `${u.id.slice(-2)}:${Object.keys(u.record).join('+')}${'statecode' in u.record ? '=' + u.record['statecode'] + '/' + u.record['statuscode'] : ''}`);

describe('the plan with permission to manage the state', () => {
    it('without permission a flow that is on stays blocked and nothing is marked for turning off', () => {
        const { plan } = setup([mk(10, 1), mk(11, 0)], {}, false);
        expect(plan.rows.map(r => r.blocked)).toEqual(['The flow is turned on: turn it off first.', undefined]);
        expect(plan.manageState).toBeFalsy();
        expect(turnOffRows(plan)).toEqual([]);
    });
    it('with permission a flow that is on is written and marked, one that is off is not marked', () => {
        const { plan } = setup([mk(10, 1), mk(11, 0)]);
        expect(plan.rows.map(r => [r.blocked, r.turnOff])).toEqual([[undefined, true], [undefined, undefined]]);
        expect(plan.manageState).toBe(true);
        expect(turnOffRows(plan).map(r => r.label)).toEqual(['F10']);
    });
    it('suspended and managed flows stay blocked whatever the permission', () => {
        const { plan } = setup([mk(10, 2), flow(11, ['sample_ref1'], { name: 'M', managed: true, clientData: clientData(['sample_ref1']) })]);
        expect(plan.rows.map(r => [r.blocked !== undefined, r.turnOff])).toEqual([[true, undefined], [true, undefined]]);
        expect(turnOffRows(plan)).toEqual([]);
    });
    it('a blocked row for another reason is not marked for turning off', () => {
        const flows = [flow(10, ['sample_ref3'], { name: 'Other', stateCode: 1 })];
        const refs = defaultReferences();
        const snap = buildSnapshot(input({ references: refs, memberReferenceIds: refs.map(r => r.id), flows }));
        const plan = planRepointGroups(snap, [guid(10)], [GROUP], '', true);
        expect(plan.rows[0]!.blocked).toMatch(/does not use any/);
        expect(plan.rows[0]!.turnOff).toBeUndefined();
    });
});

describe('applyPlan with flows that are turned off and on', () => {
    it('turns off, writes, reads back, turns on, reads back: in that order, with the official state and status values', async () => {
        const s = setup([mk(10, 1)]);
        const out = await applyPlan(s.host, s.plan);
        expect(names(s.calls)).toEqual(['10:statecode+statuscode=0/1', '10:clientdata', '10:statecode+statuscode=1/2']);
        expect(s.flows[0]!.stateCode).toBe(1);
        expect(out).toEqual([{ id: guid(10), label: 'F10', status: 'done', message: 'Written and read back.', stateChange: 'back-on' }]);
    });
    it('a flow that was off is never turned on or off', async () => {
        const s = setup([mk(10, 0), mk(11, 1)]);
        await applyPlan(s.host, s.plan);
        expect(names(s.calls).filter(n => n.startsWith('10:'))).toEqual(['10:clientdata']);
        expect(s.flows[0]!.stateCode).toBe(0);
    });
    it('the phases come in order: off, write, on, and a plan without state changes has only the write', async () => {
        const a = setup([mk(10, 1), mk(11, 0)]);
        const seen: string[] = [];
        await applyPlan(a.host, a.plan, undefined, p => seen.push(p));
        expect(seen).toEqual(['off', 'write', 'on']);
        const b = setup([mk(10, 0)]);
        const seen2: string[] = [];
        await applyPlan(b.host, b.plan, undefined, p => seen2.push(p));
        expect(seen2).toEqual(['write']);
    });
    it('every flow turned off is turned on again, also when its write failed', async () => {
        const s = setup([mk(10, 1), mk(11, 1)], { failUpdate: id => (id === guid(10) ? 'No privilege' : undefined) });
        const out = await applyPlan(s.host, s.plan);
        expect(s.flows.map(f => f.stateCode)).toEqual([1, 1]);
        expect(out.map(o => [o.status, o.stateChange])).toEqual([['failed', 'back-on'], ['done', 'back-on']]);
        expect(out[0]!.message).toBe('No privilege');
    });
    it('a flow that cannot be turned off is not written, is reported, and is not turned on', async () => {
        const s = setup([mk(10, 1), mk(11, 1)], { failState: (id, to) => (id === guid(10) && to === 'off' ? 'Not allowed' : undefined) });
        const out = await applyPlan(s.host, s.plan);
        expect(out[0]).toMatchObject({ status: 'failed' });
        expect(out[0]!.message).toContain('could not be turned off');
        expect(out[0]!.message).toContain('Not allowed');
        expect(out[0]!.message).toContain('Nothing was written');
        expect(out[0]!.stateChange).toBeUndefined();
        expect(names(s.calls).filter(n => n.startsWith('10:'))).toEqual([]);
        expect(out[1]).toMatchObject({ status: 'done', stateChange: 'back-on' });
    });
    it('a flow that cannot be turned on again is failed by name, with the instruction, and marked as left off', async () => {
        const s = setup([mk(10, 1)], { failState: (_id, to) => (to === 'on' ? 'A connection is not valid' : undefined) });
        const out = await applyPlan(s.host, s.plan);
        expect(out[0]).toMatchObject({ status: 'failed', stateChange: 'left-off' });
        expect(out[0]!.message).toContain('F10');
        expect(out[0]!.message).toContain('could not be turned on again');
        expect(out[0]!.message).toContain('A connection is not valid');
        expect(out[0]!.message).toContain('maker portal');
        expect(s.flows[0]!.stateCode).toBe(0);
    });
    it('a change of state that is accepted but not stored is a failure, not a success', async () => {
        const s = setup([mk(10, 1)], { ignoreState: true });
        const out = await applyPlan(s.host, s.plan);
        expect(out[0]!.status).toBe('failed');
        expect(out[0]!.message).toContain('could not be turned off');
        expect(names(s.calls)).toEqual(['10:statecode+statuscode=0/1']);
    });
    it('a flow that is no longer on when the run starts is skipped and left alone', async () => {
        const s = setup([mk(10, 1)]);
        s.flows[0]!.stateCode = 0; // someone turned it off after the preview
        const out = await applyPlan(s.host, s.plan);
        expect(out[0]).toMatchObject({ status: 'skipped' });
        expect(out[0]!.message).toContain('state changed');
        expect(s.calls.updates).toEqual([]);
    });
    it('the rows are reported as they finish: a flow that is turned off is reported after it is on again', async () => {
        const s = setup([mk(10, 1), mk(11, 0)]);
        const order: string[] = [];
        await applyPlan(s.host, s.plan, o => order.push(o.label));
        expect(order).toEqual(['F11', 'F10']);
    });
    it('without any state change the behaviour is exactly the old one', async () => {
        const s = setup([mk(10, 0), mk(11, 0)], {}, false);
        const out = await applyPlan(s.host, s.plan);
        expect(names(s.calls)).toEqual(['10:clientdata', '11:clientdata']);
        expect(out.every(o => o.status === 'done' && o.stateChange === undefined)).toBe(true);
    });
});
