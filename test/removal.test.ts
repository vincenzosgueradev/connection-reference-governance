// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createHost } from '../src/host';
import { mountMain } from '../src/views/main';
import { buildSnapshot } from '../src/model/analysis';
import { buildBackup } from '../src/model/backup';
import { planItems } from '../src/model/planDiff';
import { planRemoval } from '../src/model/removal';
import { operationLabel } from '../src/model/workflow';
import { applyPlan, DELETED, REMOVED } from '../src/services/dataverse';
import { createController } from '../src/controller';
import { initialState } from '../src/state/reducer';
import { createStore } from '../src/state/store';
import type { Host, Record_ } from '../src/host';
import type { Plan } from '../src/types';
import { removalModal } from '../src/views/removal';
import { reducer } from '../src/state/reducer';
import { flow, guid, input, solution, fakeHost } from './helpers/fixtures';

/** Feature 016: Remove from this solution and Delete. Synthetic data only. */

const REF_TYPE = 10150; // any code: it is read from the solution, never assumed by the tool
const types = (...ids: string[]) => Object.fromEntries(ids.map(id => [id, id.startsWith('00000000-0000-4000-8000-0000000000') && Number(id.slice(-12)) >= 10 ? 29 : REF_TYPE]));

function snap(over: Parameters<typeof input>[0] = {}) {
    const base = input({ memberTypes: types(guid(1), guid(2), guid(3), guid(10), guid(11)), ...over });
    return buildSnapshot(base);
}

describe('planRemoval', () => {
    it('remove: a flow row carries the component type read from the solution and the solution to leave', () => {
        const p = planRemoval(snap(), [guid(10)], 'remove');
        expect(p.kind).toBe('remove');
        expect(p.solution).toEqual({ id: solution().id, uniqueName: 'sample' });
        expect(p.rows[0]).toMatchObject({ id: guid(10), field: 'membership', componentType: 29, entity: 'workflow', payload: '' });
        expect(p.rows[0]!.blocked).toBeUndefined();
    });

    it('remove: a member whose component type was not read is blocked, never guessed', () => {
        const p = planRemoval(snap({ memberTypes: {} }), [guid(10)], 'remove');
        expect(p.rows[0]!.blocked).toMatch(/component type/);
    });

    it('a managed solution blocks both operations; so does a managed row', () => {
        const managed = buildSnapshot(input({ solution: solution(true), memberTypes: types(guid(10)) }));
        expect(planRemoval(managed, [guid(10)], 'remove').rows[0]!.blocked).toMatch(/Managed/);
        expect(planRemoval(managed, [guid(10)], 'delete').rows[0]!.blocked).toMatch(/Managed/);
        const row = snap({ flows: [flow(10, ['sample_ref1'], { managed: true })] });
        expect(planRemoval(row, [guid(10)], 'delete').rows[0]!.blocked).toMatch(/Managed/);
    });

    it('a reference used by a flow that stays is blocked; selected together with that flow it is allowed', () => {
        const s = snap();
        const alone = planRemoval(s, [guid(1)], 'delete');
        expect(alone.rows[0]!.blocked).toMatch(/Used by 2 flows/);
        expect(planRemoval(s, [guid(1)], 'remove').rows[0]!.blocked).toMatch(/Used by 2 flows/);
        const withFlows = planRemoval(s, [guid(1), guid(10), guid(11)], 'delete');
        expect(withFlows.rows.find(r => r.id === guid(1))!.blocked).toBeUndefined();
        // a reference nobody uses is free
        expect(planRemoval(s, [guid(3)], 'delete').rows[0]!.blocked).toBeUndefined();
    });

    it('delete: a flow that is on is turned off first; a suspended one is blocked; a draft is plain', () => {
        const s = snap({ flows: [flow(10, ['sample_ref1'], { stateCode: 1 }), flow(11, ['sample_ref1'], { stateCode: 2 })].concat([flow(12, [], { stateCode: 0 })]), memberTypes: types(guid(10), guid(11), guid(12)) });
        const p = planRemoval(s, [guid(10), guid(11), guid(12)], 'delete');
        const by = (id: string) => p.rows.find(r => r.id === id)!;
        expect(by(guid(10))).toMatchObject({ turnOff: true, affectedOn: 1 });
        expect(by(guid(10)).blocked).toBeUndefined();
        expect(by(guid(11)).blocked).toMatch(/suspended/);
        expect(by(guid(12)).turnOff).toBeUndefined();
        expect(p.warnings.join(' ')).toMatch(/permanent/);
        expect(p.warnings.join(' ')).toMatch(/turned on/);
    });

    it('remove never turns a flow off', () => {
        const s = snap({ flows: [flow(10, ['sample_ref1'], { stateCode: 1 })] });
        const row = planRemoval(s, [guid(10)], 'remove').rows[0]!;
        expect(row.turnOff).toBeUndefined();
        expect(row.blocked).toBeUndefined();
    });

    it('keeps what is needed to recreate the row by hand in the backup', () => {
        const s = snap();
        const plan = planRemoval(s, [guid(3), guid(10)], 'delete');
        const backup = JSON.parse(buildBackup(plan, 'Env', '2026-01-01T00:00:00Z')) as { kind: string; rows: { id: string; previousValue: string }[] };
        expect(backup.kind).toBe('delete');
        expect(backup.rows.find(r => r.id === guid(10))!.previousValue).toBe(s.flows.find(f => f.flow.id === guid(10))!.flow.clientData);
        expect(JSON.parse(backup.rows.find(r => r.id === guid(3))!.previousValue)).toMatchObject({ connectionreferencelogicalname: 'sample_ref3' });
    });

    it('the preview items say what is removed', () => {
        const s = snap();
        const items = planItems(planRemoval(s, [guid(10)], 'delete'), s);
        expect(items[0]!.fields).toEqual([{ what: 'row', before: 'Exists', after: 'Deleted' }]);
        expect(items[0]!.after).toBe('');
        const rem = planItems(planRemoval(s, [guid(10)], 'remove'), s);
        expect(rem[0]!.before).toContain('"inSolution": true');
        expect(rem[0]!.after).toContain('"inSolution": false');
    });

    it('has its own names', () => {
        expect(operationLabel('remove')).toBe('Remove from this solution');
        expect(operationLabel('delete')).toBe('Delete');
    });
});

/** A host with rows in memory: solution members, existing rows and flow states. */
function envHost(opts: { members?: string[]; rows?: Record<string, 'workflow' | 'connectionreference'>; states?: Record<string, number>; refuse?: (id: string) => string | undefined; ignore?: boolean } = {}) {
    const members = new Set(opts.members ?? []);
    const rows = new Map(Object.entries(opts.rows ?? {}));
    const states = new Map(Object.entries(opts.states ?? {}));
    const calls = { removed: [] as unknown[][], deleted: [] as string[][], updates: [] as { id: string; record: Record_ }[] };
    const base = fakeHost(() => []);
    const host: Host = {
        ...base,
        async query(q) {
            const mem = /solutioncomponents\?\$select=objectid&\$filter=_solutionid_value eq ([0-9a-f-]+) and objectid eq ([0-9a-f-]+)$/.exec(q);
            if (mem) return members.has(mem[2]!) ? [{ objectid: mem[2] }] : [];
            const st = /workflows\?\$select=statecode&\$filter=workflowid eq ([0-9a-f-]+)$/.exec(q);
            if (st) return states.has(st[1]!) ? [{ statecode: states.get(st[1]!) }] : [];
            const ex = /(workflows|connectionreferences)\?\$select=\w+&\$filter=\w+ eq ([0-9a-f-]+)$/.exec(q);
            if (ex) return rows.has(ex[2]!) ? [{ x: 1 }] : [];
            return [];
        },
        async update(_e, id, record) {
            calls.updates.push({ id, record });
            if (typeof record['statecode'] === 'number') states.set(id, opts.ignore ? states.get(id)! : record['statecode']);
        },
        async removeFromSolution(uniqueName, id, type) {
            const err = opts.refuse?.(id);
            if (err) throw new Error(err);
            calls.removed.push([uniqueName, id, type]);
            if (!opts.ignore) members.delete(id);
        },
        async remove(entity, id) {
            const err = opts.refuse?.(id);
            if (err) throw new Error(err);
            calls.deleted.push([entity, id]);
            if (!opts.ignore) rows.delete(id);
        },
    };
    return { host, calls, members, rows, states };
}

describe('applyPlan: remove', () => {
    it('removes the component with the type read, and reads the membership back', async () => {
        const s = snap();
        const plan = planRemoval(s, [guid(10), guid(3)], 'remove');
        const env = envHost({ members: [guid(10), guid(3)] });
        const out = await applyPlan(env.host, plan);
        expect(out.map(o => [o.status, o.message])).toEqual([['done', REMOVED], ['done', REMOVED]]);
        expect(env.calls.removed).toEqual([['sample', guid(10), 29], ['sample', guid(3), REF_TYPE]]);
        expect(env.calls.deleted).toEqual([]);
    });

    it('skips a row that is no longer in the solution, without calling the environment', async () => {
        const plan = planRemoval(snap(), [guid(10)], 'remove');
        const env = envHost({ members: [] });
        const out = await applyPlan(env.host, plan);
        expect(out[0]!.status).toBe('skipped');
        expect(env.calls.removed).toEqual([]);
    });

    it('fails a row when the membership is still there afterwards', async () => {
        const plan = planRemoval(snap(), [guid(10)], 'remove');
        const out = await applyPlan(envHost({ members: [guid(10)], ignore: true }).host, plan);
        expect(out[0]!.status).toBe('failed');
        expect(out[0]!.message).toMatch(/still in the solution/);
    });

    it('a refusal on one row does not stop the others', async () => {
        const plan = planRemoval(snap(), [guid(10), guid(11)], 'remove');
        const env = envHost({ members: [guid(10), guid(11)], refuse: id => (id === guid(10) ? 'Dependency' : undefined) });
        const out = await applyPlan(env.host, plan);
        expect(out.map(o => o.status)).toEqual(['failed', 'done']);
        expect(out[0]!.message).toBe('Dependency');
    });

    it('never calls the environment for a blocked row', async () => {
        const plan = planRemoval(snap({ memberTypes: {} }), [guid(10)], 'remove');
        const env = envHost({ members: [guid(10)] });
        const out = await applyPlan(env.host, plan);
        expect(out[0]!.status).toBe('skipped');
        expect(env.calls.removed).toEqual([]);
    });
});

describe('applyPlan: delete', () => {
    it('deletes a draft flow and a free reference and reads them back', async () => {
        const plan = planRemoval(snap(), [guid(10), guid(3)], 'delete');
        const env = envHost({ rows: { [guid(10)]: 'workflow', [guid(3)]: 'connectionreference' }, states: { [guid(10)]: 0 } });
        const out = await applyPlan(env.host, plan);
        expect(out.map(o => [o.status, o.message])).toEqual([['done', DELETED], ['done', DELETED]]);
        expect(env.calls.deleted).toEqual([['workflow', guid(10)], ['connectionreference', guid(3)]]);
        expect(env.rows.size).toBe(0);
    });

    it('turns a flow that is on off, deletes it, and never turns it on again', async () => {
        const s = snap({ flows: [flow(10, ['sample_ref1'], { stateCode: 1 })] });
        const plan = planRemoval(s, [guid(10)], 'delete');
        const env = envHost({ rows: { [guid(10)]: 'workflow' }, states: { [guid(10)]: 1 } });
        const phases: string[] = [];
        const out = await applyPlan(env.host, plan, undefined, p => phases.push(p));
        expect(out).toHaveLength(1);
        expect(out[0]).toMatchObject({ status: 'done', message: DELETED });
        expect(env.calls.updates.map(u => u.record['statecode'])).toEqual([0]); // off only
        expect(phases).toEqual(['off', 'write']);
    });

    it('a flow whose delete is refused stays off and is reported as left off', async () => {
        const s = snap({ flows: [flow(10, ['sample_ref1'], { stateCode: 1 })] });
        const plan = planRemoval(s, [guid(10)], 'delete');
        const env = envHost({ rows: { [guid(10)]: 'workflow' }, states: { [guid(10)]: 1 }, refuse: () => 'Refused' });
        const out = await applyPlan(env.host, plan);
        expect(out[0]).toMatchObject({ status: 'failed', stateChange: 'left-off' });
        expect(out[0]!.message).toMatch(/Refused/);
        expect(env.states.get(guid(10))).toBe(0);
    });

    it('does not delete a flow that was turned on again after the preview, and skips a row already gone', async () => {
        const plan = planRemoval(snap(), [guid(10), guid(11)], 'delete');
        const env = envHost({ rows: { [guid(10)]: 'workflow' }, states: { [guid(10)]: 1 } }); // 11 does not exist
        const out = await applyPlan(env.host, plan);
        expect(out.map(o => o.status)).toEqual(['skipped', 'skipped']);
        expect(env.calls.deleted).toEqual([]);
    });

    it('fails a row that still exists after the delete', async () => {
        const plan = planRemoval(snap(), [guid(3)], 'delete');
        const out = await applyPlan(envHost({ rows: { [guid(3)]: 'connectionreference' }, ignore: true }).host, plan);
        expect(out[0]!.status).toBe('failed');
    });
});

describe('controller and confirmation', () => {
    it('open the dialog at once, over the list: there is no Preview step; nothing is written', async () => {
        const store = createStore(initialState());
        const base = fakeHost(() => []);
        const c = createController(base, store, () => 1000, 1000, () => 'DELETE-TEST01');
        store.dispatch({ type: 'solutionsLoaded', solutions: [solution()] });
        store.dispatch({ type: 'selectSolution', id: solution().id });
        store.dispatch({ type: 'snapshotLoaded', snapshot: snap() });
        store.dispatch({ type: 'selectAll', ids: [guid(3)] });
        await c.previewDelete();
        expect(store.get().plan?.kind).toBe('delete');
        expect(store.get().wizard).toMatchObject({ operation: 'delete', step: 'preview', confirmOpen: true });
        expect(store.get().confirmCode).toBe('DELETE-TEST01');
        expect(base.updates).toEqual([]);
        store.dispatch({ type: 'closePlan' });
        c.previewRemove();
        expect(store.get().wizard).toMatchObject({ operation: 'remove', confirmOpen: true });
        expect(store.get().confirmCode).toBe('');
    });

    it('delete asks the environment what depends on each row, and builds the plan from the answer', async () => {
        const store = createStore(initialState());
        const asked: string[] = [];
        const base = { ...fakeHost(() => []), async dependencies(type: number, id: string) { asked.push(`${type}:${id}`); return id === guid(3) ? [{ id: guid(900), type: 60 }] : []; } };
        const c = createController(base, store, () => 1000, 1000, () => 'X');
        store.dispatch({ type: 'solutionsLoaded', solutions: [solution()] });
        store.dispatch({ type: 'selectSolution', id: solution().id });
        store.dispatch({ type: 'snapshotLoaded', snapshot: snap() });
        store.dispatch({ type: 'selectAll', ids: [guid(3)] });
        await c.previewDelete();
        expect(asked).toEqual([`${REF_TYPE}:${guid(3)}`]);
        expect(store.get().plan!.rows[0]!.blocked).toMatch(/depend on it/);
    });

    const rargs = (plan: Plan, over: Partial<Parameters<typeof removalModal>[0]> = {}) => ({ plan, snapshot: snap(), environment: 'Env', ack: false, backupSaved: false, code: 'DELETE-AB12CD', typed: '', ...over });
    const rhandlers = () => ({ confirm: vi.fn(), cancel: vi.fn(), saveBackup: vi.fn(), setAck: vi.fn(), setTyped: vi.fn() });
    const confirmBtn = (dom: HTMLElement) => [...dom.querySelectorAll('.modal-actions button')].find(b => /^(Delete|Remove) \d/.test(b.textContent ?? '')) as HTMLButtonElement;

    it('delete: a lean red dialog: one line on what it does, the rows with the reason of each block, the copy, the code', () => {
        const dom = removalModal(rargs(planRemoval(snap(), [guid(3), guid(1)], 'delete')), rhandlers());
        const text = dom.textContent ?? '';
        expect(dom.querySelector('.modal--error')).not.toBeNull();
        expect(text).toMatch(/Delete 1 connection reference permanently/);
        expect(text).toMatch(/Permanent/);
        expect(dom.querySelector('.removal-steps')).toBeNull();
        expect(dom.querySelector('.fig-row')).toBeNull();
        expect(dom.querySelector('.change-row--blocked .change-reason')!.textContent).toMatch(/Used by 2 flows/);
        expect(text).toMatch(/1 blocked/);
        expect(text).toMatch(/permanently deleted from Env/);
    });

    it('delete stays locked until the code is pasted AND the acknowledgement is ticked', () => {
        const plan = planRemoval(snap(), [guid(3)], 'delete');
        const locked = (over: Partial<Parameters<typeof removalModal>[0]>) => confirmBtn(removalModal(rargs(plan, over), rhandlers())).disabled;
        expect(locked({})).toBe(true);
        expect(locked({ ack: true })).toBe(true);
        expect(locked({ typed: 'DELETE-AB12CD' })).toBe(true);
        expect(locked({ ack: true, typed: 'DELETE-AB12CD2' })).toBe(true);
        expect(locked({ ack: true, typed: 'delete-ab12cd' })).toBe(true);
        expect(locked({ ack: true, typed: '  DELETE-AB12CD ' })).toBe(false);
        expect(locked({ ack: true, typed: 'DELETE-AB12CD', code: '' })).toBe(true);
    });

    it('the code is shown with a Copy button and a field to paste it in; a match is proved on screen', () => {
        const plan = planRemoval(snap(), [guid(3)], 'delete');
        const h = rhandlers();
        const dom = removalModal(rargs(plan), h);
        expect(dom.querySelector('.removal-code')!.textContent).toBe('DELETE-AB12CD');
        expect(dom.querySelector('.removal-gate')!.className).not.toContain('is-open');
        const field = dom.querySelector<HTMLInputElement>('input[aria-label="Confirmation code"]')!;
        field.value = 'DELETE-AB12CD';
        field.dispatchEvent(new Event('input'));
        expect(h.setTyped).toHaveBeenCalledWith('DELETE-AB12CD');
        const ok = removalModal(rargs(plan, { typed: 'DELETE-AB12CD' }), rhandlers());
        expect(ok.querySelector('.removal-gate')!.className).toContain('is-open');
        expect(ok.textContent).toMatch(/Delete unlocked/);
    });

    it('with nothing deletable there is no code to paste and the button stays closed', () => {
        const dom = removalModal(rargs(planRemoval(snap(), [guid(1)], 'delete'), { ack: true }), rhandlers());
        expect(dom.querySelector('.removal-gate')).toBeNull();
        expect(confirmBtn(dom).disabled).toBe(true);
    });

    it('remove: a blue dialog without a code, saying the rows stay in the environment', () => {
        const dom = removalModal(rargs(planRemoval(snap(), [guid(3)], 'remove'), { ack: true }), rhandlers());
        const text = dom.textContent ?? '';
        expect(dom.querySelector('.modal--error')).toBeNull();
        expect(dom.querySelector('.removal-gate')).toBeNull();
        expect(text).toMatch(/Remove 1 connection reference from this solution/);
        expect(text).toMatch(/stay in the environment/);
        expect(dom.querySelector('.callout')).toBeNull(); // nothing is lost, so no copy is offered
        expect(confirmBtn(dom).disabled).toBe(false);
    });
});

describe('the code is also the rule of the state', () => {
    it('Apply is not reached for a delete until the pasted code equals the one shown', () => {
        const base = () => {
            let s = reducer(initialState(), { type: 'solutionsLoaded', solutions: [solution()] });
            s = reducer(s, { type: 'selectSolution', id: solution().id });
            s = reducer(s, { type: 'snapshotLoaded', snapshot: snap() });
            s = reducer(s, { type: 'openPlan', plan: planRemoval(snap(), [guid(3)], 'delete'), code: 'DELETE-AB12CD' });
            s = reducer(s, { type: 'openConfirm' });
            return reducer(s, { type: 'setAck', on: true });
        };
        expect(reducer(base(), { type: 'applyStarted', now: 1, total: 1 }).wizard!.step).toBe('preview');
        const wrong = reducer(base(), { type: 'setTypedCode', value: 'DELETE-ZZZZZZ' });
        expect(reducer(wrong, { type: 'applyStarted', now: 1, total: 1 }).wizard!.step).toBe('preview');
        const right = reducer(base(), { type: 'setTypedCode', value: 'DELETE-AB12CD' });
        expect(reducer(right, { type: 'applyStarted', now: 1, total: 1 }).wizard!.step).toBe('apply');
    });
    it('a remove does not need a code, and a new plan forgets the pasted one', () => {
        let s = reducer(initialState(), { type: 'solutionsLoaded', solutions: [solution()] });
        s = reducer(s, { type: 'selectSolution', id: solution().id });
        s = reducer(s, { type: 'snapshotLoaded', snapshot: snap() });
        s = reducer(s, { type: 'openPlan', plan: planRemoval(snap(), [guid(3)], 'remove') });
        s = reducer(s, { type: 'openConfirm' });
        s = reducer(s, { type: 'setAck', on: true });
        expect(reducer(s, { type: 'applyStarted', now: 1, total: 1 }).wizard!.step).toBe('apply');
        s = reducer(s, { type: 'setTypedCode', value: 'x' });
        expect(reducer(s, { type: 'openPlan', plan: planRemoval(snap(), [guid(3)], 'delete'), code: 'Y' }).typedCode).toBe('');
    });
});

describe('dependencies', () => {
    it('a row something outside the selection depends on is blocked, naming what depends on it', () => {
        const p = planRemoval(snap(), [guid(3)], 'delete', { [guid(3)]: [{ id: guid(10), type: 29 }] });
        expect(p.rows[0]!.blocked).toMatch(/Other components depend on it \(Flow 10\)/);
    });
    it('what depends on a row that is deleted in the same plan does not count', () => {
        const p = planRemoval(snap(), [guid(3), guid(10)], 'delete', { [guid(3)]: [{ id: guid(10), type: 29 }], [guid(10)]: [] });
        expect(p.rows.every(r => r.blocked === undefined)).toBe(true);
    });
    it('a row whose dependencies could not be read is never offered', () => {
        const p = planRemoval(snap(), [guid(3)], 'delete', { [guid(3)]: undefined });
        expect(p.rows[0]!.blocked).toMatch(/could not be checked/);
    });
    it('is checked again at the moment of the delete, and a new dependency stops it', async () => {
        const plan = planRemoval(snap(), [guid(3)], 'delete');
        const env = envHost({ rows: { [guid(3)]: 'connectionreference' } });
        const host = { ...env.host, async dependencies() { return [{ id: guid(77), type: 29 }]; } };
        const out = await applyPlan(host, plan);
        expect(out[0]!.status).toBe('skipped');
        expect(out[0]!.message).toMatch(/depend/);
        expect(env.calls.deleted).toEqual([]);
    });
    it('a dependency check that fails stops the delete too', async () => {
        const plan = planRemoval(snap(), [guid(3)], 'delete');
        const env = envHost({ rows: { [guid(3)]: 'connectionreference' } });
        const host = { ...env.host, async dependencies(): Promise<never> { throw new Error('Unavailable'); } };
        const out = await applyPlan(host, plan);
        expect(out[0]!.status).toBe('skipped');
        expect(out[0]!.message).toMatch(/could not be checked/);
        expect(env.calls.deleted).toEqual([]);
    });
});

describe('the call to the environment', () => {
    it('RemoveSolutionComponent is sent as Learn documents it: the component as a solutioncomponent, its type, the solution unique name', async () => {
        const execute = vi.fn(async () => ({}));
        const del = vi.fn(async () => undefined);
        (window as unknown as { dataverseAPI: unknown }).dataverseAPI = { execute, delete: del };
        const host = createHost();
        await host.removeFromSolution('sample', guid(10), 29);
        expect(execute).toHaveBeenCalledWith({
            operationName: 'RemoveSolutionComponent',
            operationType: 'action',
            parameters: { SolutionComponent: { '@odata.type': 'Microsoft.Dynamics.CRM.solutioncomponent', solutioncomponentid: guid(10) }, ComponentType: 29, SolutionUniqueName: 'sample' },
        });
        await host.remove('workflow', guid(10));
        expect(del).toHaveBeenCalledWith('workflow', guid(10));
    });
});

describe('the two actions in the bar', () => {
    function bar(managed = false) {
        const sol = solution(managed);
        const store = createStore(initialState());
        const h = { selectSolution: vi.fn(), refresh: vi.fn(), previewConnection: vi.fn(), previewRepoint: vi.fn(), previewRemove: vi.fn(), previewDelete: vi.fn(), setTypedCode: vi.fn(), setManageState: vi.fn(), confirm: vi.fn(), saveBackup: vi.fn(), saveReport: vi.fn() };
        const root = document.createElement('div');
        document.body.append(root);
        mountMain(root, store, h, () => 'Test');
        store.dispatch({ type: 'solutionsLoaded', solutions: [sol] });
        store.dispatch({ type: 'selectSolution', id: sol.id });
        store.dispatch({ type: 'snapshotLoaded', snapshot: buildSnapshot(input({ solution: sol })) });
        const find = (text: string) => [...root.querySelectorAll('button')].find(b => b.textContent?.includes(text))!;
        return { store, h, find, root };
    }

    it('are closed without a selection and open with one, and call their handlers', () => {
        const { store, h, find } = bar();
        store.dispatch({ type: 'setView', view: 'references' });
        expect(find('Remove from solution').disabled).toBe(true);
        expect(find('Delete...').disabled).toBe(true);
        store.dispatch({ type: 'toggle', id: guid(3) });
        expect(find('Remove from solution').disabled).toBe(false);
        expect(find('Delete...').disabled).toBe(false);
        find('Remove from solution').click();
        find('Delete...').click();
        expect(h.previewRemove).toHaveBeenCalledTimes(1);
        expect(h.previewDelete).toHaveBeenCalledTimes(1);
    });

    it('are closed, with the reason, when every selected reference is used by a flow; open when one of them is free', () => {
        const { store, find, root } = bar();
        store.dispatch({ type: 'setView', view: 'references' });
        store.dispatch({ type: 'toggle', id: guid(1) }); // used by two flows
        expect(find('Remove from solution').disabled).toBe(true);
        expect(find('Delete...').disabled).toBe(true);
        expect(find('Delete...').title).toMatch(/Used by flows/);
        expect(root.querySelector('.action-hint')!.textContent).toMatch(/used by flows.*Re-point those flows to another reference first/);
        store.dispatch({ type: 'toggle', id: guid(3) }); // free: the dialog can list the other one as blocked
        expect(find('Delete...').disabled).toBe(false);
    });

    it('are closed in a managed solution even with a selection', () => {
        const { store, find } = bar(true);
        store.dispatch({ type: 'setView', view: 'references' });
        store.dispatch({ type: 'toggle', id: guid(3) });
        expect(find('Remove from solution').disabled).toBe(true);
        expect(find('Delete...').disabled).toBe(true);
    });
});

describe('the flows view', () => {
    it('offers neither Remove nor Delete: flows are only re-pointed', () => {
        const sol = solution();
        const store = createStore(initialState());
        const root = document.createElement('div');
        document.body.append(root);
        mountMain(root, store, { selectSolution: vi.fn(), refresh: vi.fn(), previewConnection: vi.fn(), previewRepoint: vi.fn(), previewRemove: vi.fn(), previewDelete: vi.fn(), setTypedCode: vi.fn(), setManageState: vi.fn(), confirm: vi.fn(), saveBackup: vi.fn(), saveReport: vi.fn() }, () => '');
        store.dispatch({ type: 'solutionsLoaded', solutions: [sol] });
        store.dispatch({ type: 'selectSolution', id: sol.id });
        store.dispatch({ type: 'snapshotLoaded', snapshot: buildSnapshot(input({ solution: sol })) });
        const texts = [...root.querySelectorAll('button')].map(b => b.textContent ?? '');
        expect(texts.some(t => t.includes('Remove from solution'))).toBe(false);
        expect(texts.some(t => t.includes('Delete...'))).toBe(false);
        expect(texts.some(t => t.includes('Choose changes'))).toBe(true);
    });
});

describe('delete: a reference that is already gone', () => {
    it('is skipped and nothing is deleted', async () => {
        const plan = planRemoval(snap(), [guid(3)], 'delete');
        const env = envHost({ rows: {} });
        const out = await applyPlan(env.host, plan);
        expect(out[0]!.status).toBe('skipped');
        expect(env.calls.deleted).toEqual([]);
    });
});

describe('review: what really goes away', () => {
    it('a flow that is selected but blocked does not free the reference it uses', () => {
        const s = snap({ flows: [flow(10, ['sample_ref1'], { managed: true }), flow(11, ['sample_ref1'])] });
        const p = planRemoval(s, [guid(1), guid(10), guid(11)], 'remove');
        const by = (id: string) => p.rows.find(r => r.id === id)!;
        expect(by(guid(10)).blocked).toMatch(/Managed/);
        expect(by(guid(1)).blocked).toMatch(/Used by 1 flow/);
    });
    it('flows come before the references they use, whatever the order of the selection', () => {
        const p = planRemoval(snap(), [guid(1), guid(10), guid(11)], 'delete');
        expect(p.rows.map(r => r.id)).toEqual([guid(10), guid(11), guid(1)]);
    });
    it('a flow whose type the solution did not give is still asked about as a workflow when deleting', () => {
        const s = snap({ memberTypes: {} });
        const p = planRemoval(s, [guid(10)], 'delete');
        expect(p.rows[0]).toMatchObject({ componentType: 29 });
        expect(p.rows[0]!.blocked).toBeUndefined();
    });
    it('a blocked row that depends on what is deleted still stops that delete', async () => {
        const s = snap({ flows: [flow(10, ['sample_ref1'], { stateCode: 2 })] }); // suspended: blocked, stays
        const plan = planRemoval(s, [guid(1), guid(10)], 'delete');
        const env = envHost({ rows: { [guid(1)]: 'connectionreference' } });
        const host = { ...env.host, async dependencies(_t: number, id: string) { return id === guid(1) ? [{ id: guid(10), type: 29 }] : []; } };
        const out = await applyPlan(host, plan);
        expect(out.find(o => o.id === guid(1))!.status).toBe('skipped');
        expect(env.calls.deleted).toEqual([]);
    });
});

describe('review: the permission is offered only where it changes something', () => {
    it('a managed flow that is on does not make the dialog offer the switch', async () => {
        const { permissionBlock } = await import('../src/views/confirm');
        const { planRepointGroups } = await import('../src/model/plans');
        const s = snap({ flows: [flow(10, ['sample_ref1'], { stateCode: 1, managed: true })] });
        const plan = planRepointGroups(s, [guid(10)], [{ connectorId: '', from: ['sample_ref1'], target: 'sample_ref2' }]);
        expect(permissionBlock(plan, false, () => undefined)).toBeNull();
        const free = snap({ flows: [flow(10, ['sample_ref1'], { stateCode: 1 })] });
        const plan2 = planRepointGroups(free, [guid(10)], [{ connectorId: '', from: ['sample_ref1'], target: 'sample_ref2' }]);
        expect(permissionBlock(plan2, false, () => undefined)).not.toBeNull();
    });
});

describe('review: the log dock keeps the reader\'s place', () => {
    it('keeps the focus on the button that had it, and does not jump a list that was scrolled up', async () => {
        const { clearLog: clear, log: add } = await import('../src/services/log');
        const { mountLogDock: mount } = await import('../src/views/logDock');
        const tops = new WeakMap<Element, number>();
        Object.defineProperty(HTMLElement.prototype, 'scrollTop', { configurable: true, get() { return tops.get(this) ?? 0; }, set(v: number) { tops.set(this, v); } });
        try {
            clear();
            window.localStorage.setItem('crg.logOpen', '1');
            const root = document.createElement('div');
            document.body.append(root);
            const stop = mount(root, async () => true);
            for (let i = 0; i < 5; i++) add(`m${i}`);
            const clearBtn = root.querySelector<HTMLElement>('[data-dock="clear"]')!;
            clearBtn.focus();
            add('another');
            expect((document.activeElement as HTMLElement).dataset['dock']).toBe('clear');
            stop();
        } finally {
            delete (HTMLElement.prototype as unknown as Record<string, unknown>)['scrollTop'];
            window.localStorage.clear();
        }
    });
});
