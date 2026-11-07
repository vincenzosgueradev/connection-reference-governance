import { describe, expect, it } from 'vitest';
import { buildSnapshot } from '../src/model/analysis';
import { duplicateGroups } from '../src/model/cleanup';
import { initialState, reducer, type Action, type State } from '../src/state/reducer';
import { flow, guid, input, ref } from './helpers/fixtures';

/** Feature 022: the state of the clean up dialog and of the merge that continues in the Result. */

const refs = [ref(1, { connectionId: 'a' }), ref(2, { connectionId: 'a' }), ref(3, { connectionId: 'z' })];
const flows = [flow(10, ['sample_ref1']), flow(11, ['sample_ref2'])];
const snapshot = buildSnapshot(input({ references: refs, memberReferenceIds: refs.map(r => r.id), flows }));
const run = (s: State, ...actions: Action[]) => actions.reduce(reducer, s);

function ready(view: 'flows' | 'references' = 'references'): State {
    return run(initialState(),
        { type: 'solutionsLoaded', solutions: [input().solution] },
        { type: 'selectSolution', id: input().solution.id },
        { type: 'snapshotLoaded', snapshot },
        { type: 'setView', view });
}

describe('opening and closing', () => {
    it('opens only on a loaded unmanaged solution, in the references view, with nothing being previewed', () => {
        expect(reducer(initialState(), { type: 'openCleanup' }).cleanup).toBeNull();
        expect(reducer(ready('flows'), { type: 'openCleanup' }).cleanup).toBeNull();
        const managed = ready();
        expect(reducer({ ...managed, snapshot: { ...managed.snapshot!, solution: { ...managed.snapshot!.solution, managed: true } } }, { type: 'openCleanup' }).cleanup).toBeNull();
        expect(reducer(ready(), { type: 'openCleanup' }).cleanup).toMatchObject({ tab: 'unused', picked: [], keepers: {} });
    });
    it('opens on Duplicates when nothing is unused but there are duplicates, and on the tab asked for', () => {
        const dupOnly = buildSnapshot(input({ references: refs.slice(0, 2), memberReferenceIds: refs.slice(0, 2).map(r => r.id), flows }));
        const s = run(ready(), { type: 'snapshotLoaded', snapshot: dupOnly }, { type: 'openCleanup' });
        expect(s.cleanup!.tab).toBe('duplicates');
        expect(reducer(ready(), { type: 'openCleanup', tab: 'duplicates' }).cleanup!.tab).toBe('duplicates');
    });
    it('closes when the view changes, the solution is left, or a change other than a Remove or a Delete is previewed', () => {
        const open = reducer(ready(), { type: 'openCleanup' });
        expect(reducer(open, { type: 'closeCleanup' }).cleanup).toBeNull();
        expect(reducer(open, { type: 'setView', view: 'flows' }).cleanup).toBeNull();
        expect(reducer(open, { type: 'selectSolution', id: '' }).cleanup).toBeNull();
        expect(reducer(open, { type: 'openPlan', plan: { kind: 'repoint', entity: 'workflow', rows: [], warnings: [] } }).cleanup).toBeNull();
        expect(reducer(open, { type: 'openPlan', plan: { kind: 'connection', entity: 'connectionreference', rows: [], warnings: [] } }).cleanup).toBeNull();
    });
});

describe('the choices', () => {
    it('tabs, ticks and keepers', () => {
        let s = reducer(ready(), { type: 'openCleanup' });
        s = reducer(s, { type: 'setCleanupTab', tab: 'duplicates' });
        expect(s.cleanup!.tab).toBe('duplicates');
        s = reducer(s, { type: 'toggleCleanupUnused', id: guid(3) });
        expect(s.cleanup!.picked).toEqual([guid(3)]);
        s = reducer(s, { type: 'toggleCleanupUnused', id: guid(3) });
        expect(s.cleanup!.picked).toEqual([]);
        s = reducer(s, { type: 'setCleanupUnused', ids: [guid(3), guid(3)] });
        expect(s.cleanup!.picked).toEqual([guid(3)]);
        const key = duplicateGroups(snapshot)[0]!.key;
        s = reducer(s, { type: 'setKeeper', group: key, id: guid(2) });
        expect(s.cleanup!.keepers).toEqual({ [key]: guid(2) });
    });
    it('the actions do nothing while the dialog is closed', () => {
        const s = ready();
        for (const a of [{ type: 'setCleanupTab', tab: 'duplicates' }, { type: 'toggleCleanupUnused', id: guid(3) }, { type: 'setCleanupUnused', ids: [] }, { type: 'setKeeper', group: 'k', id: guid(1) }] as const) expect(reducer(s, a)).toBe(s);
    });
    it('a tick on a reference that is used is dropped at once, so the dialog never offers it', () => {
        const s = run(ready(), { type: 'openCleanup' }, { type: 'toggleCleanupUnused', id: guid(1) }); // ref1 is used by a flow
        expect(s.cleanup!.picked).toEqual([]);
    });
    it('a solution read again drops the ticks that no longer hold and the keepers that are gone', () => {
        const key = duplicateGroups(snapshot)[0]!.key;
        let s = run(ready(), { type: 'openCleanup' }, { type: 'toggleCleanupUnused', id: guid(3) }, { type: 'setKeeper', group: key, id: guid(2) });
        const used = buildSnapshot(input({ references: refs, memberReferenceIds: refs.map(r => r.id), flows: [...flows, flow(12, ['sample_ref3'])] }));
        s = reducer(s, { type: 'snapshotLoaded', snapshot: used });
        expect(s.cleanup!.picked).toEqual([]);
        expect(s.cleanup!.keepers).toEqual({ [key]: guid(2) }); // the group still exists
        const gone = buildSnapshot(input({ references: [refs[0]!, refs[2]!], memberReferenceIds: [guid(1), guid(3)], flows }));
        expect(reducer(s, { type: 'snapshotLoaded', snapshot: gone }).cleanup!.keepers).toEqual({});
    });
});

describe('a merge', () => {
    const group = { connectorId: refs[0]!.connectorId, from: ['sample_ref2'], target: 'sample_ref1' };
    const start = (s: State) => reducer(s, { type: 'startMerge', flowIds: [guid(11)], group, followUp: { ids: [guid(2)], keeper: 'Ref 1' } });
    it('selects the flows and the re-point, goes to the flows view, closes the dialog and remembers the duplicates', () => {
        const s = start(reducer(ready(), { type: 'openCleanup' }));
        expect(s).toMatchObject({ view: 'flows', selected: [guid(11)], cleanup: null, cleanupFollowUp: { ids: [guid(2)], keeper: 'Ref 1' } });
        expect(s.repointGroups).toEqual([group]); // the planner would accept it: the flow uses the source and the target is a reference of the connector
    });
    it('the second step opens the unused list with the duplicates ticked, when they are unused now', () => {
        const after = buildSnapshot(input({ references: refs, memberReferenceIds: refs.map(r => r.id), flows: [flow(10, ['sample_ref1']), flow(11, ['sample_ref1'])] }));
        const s = run(start(ready()), { type: 'snapshotLoaded', snapshot: after }, { type: 'followUpCleanup' });
        expect(s).toMatchObject({ view: 'references', cleanupFollowUp: null, wizard: null, results: null });
        expect(s.cleanup).toMatchObject({ tab: 'unused', picked: [guid(2)] });
    });
    it('a duplicate whose flow was not re-pointed is not ticked (it is still used)', () => {
        const s = run(start(ready()), { type: 'followUpCleanup' }); // nothing changed in the solution
        expect(s.cleanup!.picked).toEqual([]);
    });
    it('the follow-up is forgotten when the preview is left, the result dismissed, the view changed or the solution left', () => {
        const merging = start(ready());
        expect(reducer(merging, { type: 'setView', view: 'references' }).cleanupFollowUp).toBeNull();
        expect(reducer(merging, { type: 'selectSolution', id: '' }).cleanupFollowUp).toBeNull();
        const previewing = reducer(merging, { type: 'openPlan', plan: { kind: 'repoint', entity: 'workflow', rows: [], warnings: [] } });
        expect(previewing.cleanupFollowUp).not.toBeNull(); // still the same merge
        expect(reducer(previewing, { type: 'closePlan' }).cleanupFollowUp).toBeNull();
        const result = reducer(previewing, { type: 'applied', results: [] });
        expect(result.wizard!.step).toBe('result');
        expect(result.cleanupFollowUp).not.toBeNull(); // the Result is where the second step is offered
        expect(reducer(result, { type: 'dismissResults' }).cleanupFollowUp).toBeNull();
    });
});

describe('the summary of a check', () => {
    it('can be dismissed, and a new check shows it again', () => {
        let s = reducer(ready(), { type: 'openCleanup' });
        expect(s.cleanup!.summaryHidden).toBe(false);
        s = reducer(s, { type: 'dismissCleanupSummary' });
        expect(s.cleanup!.summaryHidden).toBe(true);
        s = reducer(s, { type: 'dependenciesLoading', ids: [guid(3)] });
        expect(s.cleanup!.summaryHidden).toBe(false);
        expect(reducer(initialState(), { type: 'dismissCleanupSummary' }).cleanup).toBeNull();
    });
});

describe('Remove and Delete over the clean up dialog (feature 022)', () => {
    const plan = (kind: 'remove' | 'delete') => ({ kind, entity: 'connectionreference' as const, rows: [], warnings: [] });
    const picked = () => run(ready(), { type: 'openCleanup' }, { type: 'toggleCleanupUnused', id: guid(3) });
    it('the dialog stays behind the confirmation of a Remove or a Delete, with its ticks, and the return is remembered', () => {
        for (const kind of ['remove', 'delete'] as const) {
            const s = run(picked(), { type: 'selectAll', ids: [guid(3)] }, { type: 'openPlan', plan: plan(kind) });
            expect(s.cleanup, kind).toMatchObject({ tab: 'unused', picked: [guid(3)] });
            expect(s.cleanupResume, kind).toBe(true);
            expect(s.wizard!.step).toBe('preview');
        }
    });
    it('Cancel returns to the dialog as it was, and clears the selection made behind it', () => {
        const s = run(picked(), { type: 'selectAll', ids: [guid(3)] }, { type: 'openPlan', plan: plan('delete') }, { type: 'closePlan' });
        expect(s.cleanup).toMatchObject({ picked: [guid(3)] });
        expect(s).toMatchObject({ wizard: null, plan: null, cleanupResume: false, selected: [] });
    });
    it('the dialog closes while the write runs and the result is shown, and opens again after the result, read anew', () => {
        let s = run(picked(), { type: 'selectAll', ids: [guid(3)] }, { type: 'openPlan', plan: plan('remove') }, { type: 'openConfirm' }, { type: 'setAck', on: true });
        s = reducer(s, { type: 'applyStarted', now: 1, total: 1 });
        expect(s.wizard!.step).toBe('apply');
        expect(s.cleanup).toBeNull(); // the screen belongs to the run
        expect(s.cleanupResume).toBe(true);
        s = reducer(s, { type: 'applied', results: [] });
        expect(s.wizard!.step).toBe('result');
        expect(s.cleanup).toBeNull();
        s = reducer(s, { type: 'dismissResults' });
        expect(s.cleanup).toMatchObject({ tab: 'unused', picked: [], summaryHidden: false });
        expect(s).toMatchObject({ cleanupResume: false, selected: [], wizard: null, results: null });
    });
    it('a Remove that did not start from the dialog does not open it afterwards', () => {
        const s = run(ready(), { type: 'selectAll', ids: [guid(3)] }, { type: 'openPlan', plan: plan('remove') }, { type: 'applied', results: [] }, { type: 'dismissResults' });
        expect(s.cleanup).toBeNull();
        expect(s.cleanupResume).toBe(false);
    });
    it('closing the dialog, or leaving the view or the solution, forgets the return', () => {
        const over = run(picked(), { type: 'selectAll', ids: [guid(3)] }, { type: 'openPlan', plan: plan('delete') });
        expect(reducer({ ...over, wizard: null, plan: null }, { type: 'closeCleanup' }).cleanupResume).toBe(false);
        expect(reducer(over, { type: 'selectSolution', id: '' }).cleanupResume).toBe(false);
    });
});
