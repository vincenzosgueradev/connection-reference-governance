import { describe, expect, it } from 'vitest';
import { buildSnapshot } from '../src/model/analysis';
import { planConnectionChange, planRepoint } from '../src/model/plans';
import { initialState, reducer } from '../src/state/reducer';
import type { RowOutcome } from '../src/types';
import { flow, guid, input, ref, solution, fromOf, targetOf } from './helpers/fixtures';

const snap = () => buildSnapshot(input());

describe('reducer', () => {
    it('selecting a solution clears everything built on the previous one', () => {
        let s = reducer(initialState(), { type: 'snapshotLoaded', snapshot: snap() });
        s = reducer(s, { type: 'toggle', id: guid(1) });
        s = reducer(s, { type: 'openPlan', plan: planConnectionChange(snap(), [guid(1)], 'x') });
        s = reducer(s, { type: 'selectSolution', id: guid(5) });
        expect(s).toMatchObject({ solutionId: guid(5), snapshot: null, selected: [], plan: null, results: null });
    });
    it('toggle adds then removes', () => {
        let s = reducer(initialState(), { type: 'toggle', id: 'a' });
        expect(s.selected).toEqual(['a']);
        s = reducer(s, { type: 'toggle', id: 'a' });
        expect(s.selected).toEqual([]);
    });
    it('selectAll and clearSelection', () => {
        let s = reducer(initialState(), { type: 'selectAll', ids: ['a', 'b'] });
        expect(s.selected).toEqual(['a', 'b']);
        s = reducer(s, { type: 'clearSelection' });
        expect(s.selected).toEqual([]);
    });
    it('switching view drops selection and preview (the two operations are never mixed)', () => {
        let s = reducer(initialState(), { type: 'toggle', id: guid(1) });
        s = reducer(s, { type: 'openPlan', plan: planConnectionChange(snap(), [guid(1)], 'x') });
        s = reducer(s, { type: 'setView', view: 'references' });
        expect(s).toMatchObject({ view: 'references', selected: [], plan: null });
    });
    it('a fresh read drops the preview and selection of rows that no longer exist', () => {
        let s = reducer(initialState(), { type: 'selectAll', ids: [guid(10), 'gone'] });
        s = reducer(s, { type: 'openPlan', plan: planConnectionChange(snap(), [guid(1)], 'x') });
        s = reducer(s, { type: 'snapshotLoaded', snapshot: snap() });
        expect(s.plan).toBeNull();
        expect(s.selected).toEqual([guid(10)]);
    });
    it('applied stores results and closes the preview', () => {
        let s = reducer(initialState(), { type: 'openPlan', plan: planConnectionChange(snap(), [guid(1)], 'x') });
        s = reducer(s, { type: 'applied', results: [{ id: guid(1), label: 'x', status: 'done', message: '' }] });
        expect(s.plan).toBeNull();
        expect(s.results).toHaveLength(1);
        s = reducer(s, { type: 'dismissResults' });
        expect(s.results).toBeNull();
    });
    it('error ends busy', () => {
        const s = reducer(reducer(initialState(), { type: 'busy', busy: true }), { type: 'error', message: 'm' });
        expect(s).toMatchObject({ busy: false, error: 'm' });
    });
    it('keeps the same object for no-op store updates elsewhere', () => {
        const s = initialState();
        expect(reducer(s, { type: 'solutionsLoaded', solutions: [solution()] }).solutions).toHaveLength(1);
    });

    it('search of the solution list is kept apart from the detail filter', () => {
        let s = reducer(initialState(), { type: 'setSolutionFilter', filter: 'x' });
        s = reducer(s, { type: 'setFilter', filter: 'y' });
        expect([s.solutionFilter, s.filter]).toEqual(['x', 'y']);
    });
    it('starts sorted by flows, most first; a click on another column starts in its natural direction; the same column flips', () => {
        let s = initialState();
        expect(s.solutionSort).toEqual({ key: 'flows', desc: true });
        s = reducer(s, { type: 'sortSolutions', key: 'name' });
        expect(s.solutionSort).toEqual({ key: 'name', desc: false });
        s = reducer(s, { type: 'sortSolutions', key: 'name' });
        expect(s.solutionSort).toEqual({ key: 'name', desc: true });
        s = reducer(s, { type: 'sortSolutions', key: 'created' });
        expect(s.solutionSort).toEqual({ key: 'created', desc: true });
    });
    it('flow counts are stored and survive opening and leaving a solution', () => {
        let s = reducer(initialState(), { type: 'flowCountsLoaded', counts: { a: 2 }, total: 2 });
        s = reducer(s, { type: 'selectSolution', id: guid(900) });
        s = reducer(s, { type: 'selectSolution', id: '' });
        expect([s.flowCounts, s.flowTotal]).toEqual([{ a: 2 }, 2]);
    });
    it('going back to the list (empty id) clears the solution, its selection and its preview but keeps the list', () => {
        let s = reducer(initialState(), { type: 'solutionsLoaded', solutions: [solution()] });
        s = reducer(s, { type: 'selectSolution', id: guid(900) });
        s = reducer(s, { type: 'snapshotLoaded', snapshot: snap() });
        s = reducer(s, { type: 'toggle', id: guid(1) });
        s = reducer(s, { type: 'selectSolution', id: '' });
        expect(s).toMatchObject({ solutionId: '', snapshot: null, selected: [], plan: null });
        expect(s.solutions).toHaveLength(1);
    });
    it('a loaded list does not end busy: the counts are still being read', () => {
        const s = reducer(reducer(initialState(), { type: 'busy', busy: true }), { type: 'solutionsLoaded', solutions: [] });
        expect(s.busy).toBe(true);
    });
    it('rows open and close one by one, and opened rows are cleared with the view, the solution and rows that disappear', () => {
        let s = reducer(initialState(), { type: 'toggleExpand', id: 'a' });
        s = reducer(s, { type: 'toggleExpand', id: 'b' });
        expect(s.expanded).toEqual(['a', 'b']);
        s = reducer(s, { type: 'toggleExpand', id: 'a' });
        expect(s.expanded).toEqual(['b']);
        expect(reducer(s, { type: 'setView', view: 'references' }).expanded).toEqual([]);
        expect(reducer(s, { type: 'selectSolution', id: guid(900) }).expanded).toEqual([]);
        let t = reducer(initialState(), { type: 'toggleExpand', id: guid(10) });
        t = reducer(t, { type: 'toggleExpand', id: 'gone' });
        expect(reducer(t, { type: 'snapshotLoaded', snapshot: snap() }).expanded).toEqual([guid(10)]);
    });
});

describe('re-point choices are kept compatible by the state itself', () => {
    const B = '/providers/Microsoft.PowerApps/apis/shared_b';
    const refs = [ref(1), ref(2), ref(3, { connectorId: B })];
    // one selected flow that uses a reference of each connector
    const loaded = () => reducer(reducer(initialState(), { type: 'snapshotLoaded', snapshot: buildSnapshot(input({ references: refs, memberReferenceIds: refs.map(r => r.id), flows: [flow(10, ['sample_ref1', 'sample_ref3'])] })) }), { type: 'toggle', id: guid(10) });

    it('keeps a target of the same connector', () => {
        const s = reducer(loaded(), { type: 'setRepoint', from: 'sample_ref1', target: 'sample_ref2' });
        expect([fromOf(s), targetOf(s)]).toEqual([['sample_ref1'], 'sample_ref2']);
    });
    it('clears a target of another connector, of the same reference, or unknown, and any target without a source', () => {
        for (const [from, target] of [['sample_ref1', 'sample_ref3'], ['sample_ref1', 'sample_ref1'], ['sample_ref1', 'ghost'], ['', 'sample_ref2']] as const) {
            const s = reducer(loaded(), { type: 'setRepoint', from, target });
            expect([fromOf(s), targetOf(s)], `${from} -> ${target}`).toEqual([from === '' ? [] : [from], '']);
        }
    });
    it('changing the source to another connector clears the target', () => {
        let s = reducer(loaded(), { type: 'setRepoint', from: 'sample_ref1', target: 'sample_ref2' });
        s = reducer(s, { type: 'setRepoint', from: 'sample_ref3', target: targetOf(s) });
        expect(targetOf(s)).toBe('');
    });
    it('without a loaded solution nothing is kept', () => {
        const s = reducer(initialState(), { type: 'setRepoint', from: 'a', target: 'b' });
        expect(targetOf(s)).toBe('');
    });
    it('a reference that none of the selected flows uses cannot be the one to replace', () => {
        let s = reducer(initialState(), { type: 'snapshotLoaded', snapshot: buildSnapshot(input({ references: refs, memberReferenceIds: refs.map(r => r.id), flows: [flow(10, ['sample_ref1']), flow(12, ['sample_ref2'])] })) });
        s = reducer(s, { type: 'toggle', id: guid(12) });
        expect(fromOf(reducer(s, { type: 'setRepoint', from: 'sample_ref1', target: '' }))).toEqual([]);
        expect(fromOf(reducer(s, { type: 'setRepoint', from: 'sample_ref2', target: '' }))).toEqual(['sample_ref2']);
    });
    it('deselecting the flows that use the reference to replace clears both choices', () => {
        let s = reducer(loaded(), { type: 'setRepoint', from: 'sample_ref1', target: 'sample_ref2' });
        expect([fromOf(s), targetOf(s)]).toEqual([['sample_ref1'], 'sample_ref2']);
        s = reducer(s, { type: 'toggle', id: guid(10) });
        expect([fromOf(s), targetOf(s)]).toEqual([[], '']);
    });
    it('a refreshed solution that no longer has the target clears it', () => {
        let s = reducer(loaded(), { type: 'setRepoint', from: 'sample_ref1', target: 'sample_ref2' });
        const fewer = refs.filter(r => r.logicalName !== 'sample_ref2');
        s = reducer(s, { type: 'snapshotLoaded', snapshot: buildSnapshot(input({ references: fewer, memberReferenceIds: fewer.map(r => r.id), flows: [flow(10, ['sample_ref1', 'sample_ref3'])] })) });
        expect([fromOf(s), targetOf(s)]).toEqual([['sample_ref1'], '']);
    });
});

describe('acknowledgement and backup state of the confirmation', () => {
    const open = () => reducer(reducer(initialState(), { type: 'snapshotLoaded', snapshot: buildSnapshot(input()) }), { type: 'openPlan', plan: planConnectionChange(buildSnapshot(input()), [guid(1)], 'x') });

    it('starts off with every preview, and is switched by the user', () => {
        let s = open();
        expect([s.planAck, s.backupSaved]).toEqual([false, false]);
        s = reducer(s, { type: 'setAck', on: true });
        s = reducer(s, { type: 'backupSaved' });
        expect([s.planAck, s.backupSaved]).toEqual([true, true]);
        s = reducer(s, { type: 'openPlan', plan: s.plan! });
        expect([s.planAck, s.backupSaved]).toEqual([false, false]);
        s = reducer(reducer(s, { type: 'setAck', on: true }), { type: 'setAck', on: false });
        expect(s.planAck).toBe(false);
    });
    it('is ignored and cleared when there is no preview', () => {
        const s = reducer(reducer(initialState(), { type: 'setAck', on: true }), { type: 'backupSaved' });
        expect([s.planAck, s.backupSaved]).toEqual([false, false]);
    });
    it('is cleared when the preview ends in any way', () => {
        for (const end of [{ type: 'closePlan' }, { type: 'applied', results: [] }, { type: 'setView', view: 'references' }, { type: 'snapshotLoaded', snapshot: buildSnapshot(input()) }, { type: 'selectSolution', id: guid(900) }] as const) {
            const ticked = reducer(reducer(open(), { type: 'setAck', on: true }), { type: 'backupSaved' });
            const s = reducer(ticked, end);
            expect([s.plan, s.planAck, s.backupSaved], end.type).toEqual([null, false, false]);
        }
    });
});

describe('the guided path (wizard) in the state', () => {
    const snapNow = () => buildSnapshot(input());
    const planNow = () => planConnectionChange(snapNow(), [guid(1)], 'x');
    const open = () => reducer(reducer(initialState(), { type: 'snapshotLoaded', snapshot: snapNow() }), { type: 'openPlan', plan: planNow() });
    const preview = () => open();
    const confirmed = () => reducer(reducer(preview(), { type: 'openConfirm' }), { type: 'setAck', on: true });
    const applying = () => reducer(confirmed(), { type: 'applyStarted', now: 1000, total: 3 });

    it('a new plan opens the Preview step with split layout, nothing collapsed and one page of items', () => {
        const w = open().wizard!;
        expect(w).toMatchObject({ operation: 'connection', step: 'preview', layout: 'split', modes: {}, collapsed: [], shown: 20, confirmOpen: false, live: [], phase: 'write', finishedAt: null });
        expect(open().plan).not.toBeNull();
    });
    it('the operation of the wizard is the kind of the plan', () => {
        const s = reducer(reducer(initialState(), { type: 'snapshotLoaded', snapshot: snapNow() }), { type: 'openPlan', plan: planRepoint(snapNow(), [], 'a', 'b') });
        expect(s.wizard!.operation).toBe('repoint');
    });


    describe('leaving', () => {
        it('discards the plan, the acknowledgement and the backup state from Review and from Preview', () => {
            for (const s0 of [open(), preview()]) {
                const ticked = reducer(reducer(s0, { type: 'setAck', on: true }), { type: 'backupSaved' });
                const s = reducer(ticked, { type: 'closePlan' });
                expect([s.plan, s.wizard, s.planAck, s.backupSaved]).toEqual([null, null, false, false]);
            }
        });
        it('is refused during Apply and from the Result by closePlan', () => {
            const a = applying();
            expect(reducer(a, { type: 'closePlan' })).toBe(a);
            const r = reducer(a, { type: 'applied', results: [], now: 2000 });
            expect(reducer(r, { type: 'closePlan' })).toBe(r);
        });
        it('dismissing the results leaves only from the Result', () => {
            const a = applying();
            expect(reducer(a, { type: 'dismissResults' })).toBe(a);
            const r = reducer(a, { type: 'applied', results: [{ id: 'a', label: 'A', status: 'done', message: '' }], now: 2000 });
            const left = reducer(r, { type: 'dismissResults' });
            expect([left.wizard, left.results]).toEqual([null, null]);
        });
    });

    describe('the confirmation', () => {
        it('opens only from Preview, and closes without leaving it', () => {
            expect(reducer(reducer(open(), { type: 'closePlan' }), { type: 'openConfirm' }).wizard).toBeNull();
            const c = reducer(preview(), { type: 'openConfirm' });
            expect(c.wizard!.confirmOpen).toBe(true);
            const back = reducer(c, { type: 'closeConfirm' });
            expect([back.wizard!.step, back.wizard!.confirmOpen]).toEqual(['preview', false]);
        });
        it('the write cannot start without Preview, the open dialog and the acknowledgement', () => {
            const start = (s: ReturnType<typeof open>) => reducer(s, { type: 'applyStarted', now: 1, total: 1 }).wizard!.step;
            expect(start(preview())).toBe('preview');
            expect(start(reducer(preview(), { type: 'openConfirm' }))).toBe('preview'); // not acknowledged
            expect(start(reducer(reducer(preview(), { type: 'setAck', on: true }), { type: 'closeConfirm' }))).toBe('preview'); // dialog closed
            expect(start(confirmed())).toBe('apply');
        });
        it('starting the write sets the clock, the total and an empty live list, and closes the dialog', () => {
            const w = applying().wizard!;
            expect(w).toMatchObject({ step: 'apply', confirmOpen: false, startedAt: 1000, now: 1000, total: 3, live: [], phase: 'write' });
            expect(applying().busy).toBe(true);
        });
    });

    describe('progress', () => {
        const outcome = (id: string): RowOutcome => ({ id, label: id, status: 'done', message: '' });
        it('adds each finished row in order and moves the clock', () => {
            let s = reducer(applying(), { type: 'applyRow', outcome: outcome('a'), now: 1500 });
            s = reducer(s, { type: 'applyRow', outcome: outcome('b'), now: 2500 });
            expect(s.wizard!.live.map(o => o.id)).toEqual(['a', 'b']);
            expect(s.wizard!.now).toBe(2500);
        });
        it('the timer only moves the clock during Apply', () => {
            expect(reducer(applying(), { type: 'tick', now: 9000 }).wizard!.now).toBe(9000);
            const p = preview();
            expect(reducer(p, { type: 'tick', now: 9000 })).toBe(p);
            expect(reducer(p, { type: 'applyRow', outcome: outcome('a'), now: 5 })).toBe(p);
        });
        it('moves to the refresh phase when the rows are done', () => {
            expect(reducer(applying(), { type: 'rowsDone', now: 3000 }).wizard).toMatchObject({ phase: 'refresh', now: 3000 });
        });
        it('the result stores the rows and the time, clears the plan and the acknowledgement, and notes a failed refresh', () => {
            const r = reducer(applying(), { type: 'applied', results: [outcome('a')], now: 4000, refreshFailed: true });
            expect(r.wizard).toMatchObject({ step: 'result', phase: 'done', finishedAt: 4000, now: 4000, refreshFailed: true, confirmOpen: false });
            expect([r.plan, r.planAck, r.backupSaved, r.busy]).toEqual([null, false, false, false]);
            expect(r.results).toHaveLength(1);
        });
        it('a refresh that went well is recorded as such', () => {
            expect(reducer(applying(), { type: 'applied', results: [], now: 4000 }).wizard!.refreshFailed).toBe(false);
        });
    });

    describe('the layout of the Preview', () => {
        it('the layout is one choice for all items; each item has its own mode and card', () => {
            let s = reducer(preview(), { type: 'setLayout', layout: 'unified' });
            s = reducer(s, { type: 'setItemMode', id: 'x', mode: 'table' });
            s = reducer(s, { type: 'toggleItem', id: 'x' });
            expect([s.wizard!.layout, s.wizard!.modes, s.wizard!.collapsed]).toEqual(['unified', { x: 'table' }, ['x']]);
            s = reducer(s, { type: 'toggleItem', id: 'x' });
            expect(s.wizard!.collapsed).toEqual([]);
        });
        it('shows twenty more items each time', () => {
            let s = preview();
            s = reducer(s, { type: 'showMore' });
            s = reducer(s, { type: 'showMore' });
            expect(s.wizard!.shown).toBe(60);
        });
        it('none of these do anything without a wizard', () => {
            const s = initialState();
            for (const a of [{ type: 'setLayout', layout: 'unified' }, { type: 'setItemMode', id: 'x', mode: 'table' }, { type: 'toggleItem', id: 'x' }, { type: 'showMore' }, { type: 'openConfirm' }, { type: 'closeConfirm' }] as const)
                expect(reducer(s, a), a.type).toBe(s);
        });
    });

    describe('what a fresh read does to the wizard', () => {
        it('closes a Review or Preview built on older data and says so', () => {
            for (const s0 of [open(), preview()]) {
                const s = reducer(s0, { type: 'snapshotLoaded', snapshot: snapNow() });
                expect([s.plan, s.wizard]).toEqual([null, null]);
                expect(s.error).toContain('review was closed');
            }
        });
        it('keeps the wizard during Apply and on the Result, because that read is part of the run', () => {
            const a = reducer(applying(), { type: 'snapshotLoaded', snapshot: snapNow() });
            expect(a.wizard!.step).toBe('apply');
            expect(a.error).toBe('');
            const r = reducer(reducer(applying(), { type: 'applied', results: [], now: 1 }), { type: 'snapshotLoaded', snapshot: snapNow() });
            expect(r.wizard!.step).toBe('result');
        });
        it('choosing another solution is refused during the write: it cannot be abandoned half way', () => {
            const a = applying();
            expect(reducer(a, { type: 'selectSolution', id: guid(5) })).toBe(a);
            expect(reducer(a, { type: 'selectSolution', id: '' })).toBe(a);
        });
        it('choosing another solution or view ends the wizard', () => {
            expect(reducer(preview(), { type: 'selectSolution', id: guid(5) }).wizard).toBeNull();
            expect(reducer(preview(), { type: 'setView', view: 'references' }).wizard).toBeNull();
        });
    });
});

describe('re-point with several references to replace (feature 009)', () => {
    const B = '/providers/Microsoft.PowerApps/apis/shared_b';
    const refs = [ref(1), ref(2), ref(3), ref(4, { connectorId: B })];
    const loaded = (flows = [flow(10, ['sample_ref1', 'sample_ref2', 'sample_ref4']), flow(11, ['sample_ref3'])]) =>
        reducer(reducer(reducer(initialState(), { type: 'snapshotLoaded', snapshot: buildSnapshot(input({ references: refs, memberReferenceIds: refs.map(r => r.id), flows })) }), { type: 'toggle', id: guid(10) }), { type: 'toggle', id: guid(11) });
    it('keeps several sources of one connector, and the target may be one of them', () => {
        const s = reducer(loaded(), { type: 'setRepoint', from: ['sample_ref1', 'sample_ref2'], target: 'sample_ref2' });
        expect([fromOf(s), targetOf(s)]).toEqual([['sample_ref1', 'sample_ref2'], 'sample_ref2']);
    });
    it('drops sources of another connector than the first chosen one', () => {
        const s = reducer(loaded(), { type: 'setRepoint', from: ['sample_ref1', 'sample_ref4', 'sample_ref2'], target: '' });
        expect(fromOf(s)).toEqual(['sample_ref1', 'sample_ref2']);
    });
    it('drops sources no selected flow uses, and duplicates', () => {
        const s = reducer(loaded(), { type: 'setRepoint', from: ['sample_ref1', 'sample_ref1', 'ghost'], target: '' });
        expect(fromOf(s)).toEqual(['sample_ref1']);
    });
    it('deselecting a flow drops only the sources nobody selected uses any more', () => {
        let s = reducer(loaded(), { type: 'setRepoint', from: ['sample_ref1', 'sample_ref3'], target: 'sample_ref2' });
        s = reducer(s, { type: 'toggle', id: guid(11) });
        expect(fromOf(s)).toEqual(['sample_ref1']);
        expect(targetOf(s)).toBe('sample_ref2');
    });
    it('a target equal to the only source is cleared, equal to one of several is kept', () => {
        expect(targetOf(reducer(loaded(), { type: 'setRepoint', from: ['sample_ref1'], target: 'sample_ref1' }))).toBe('');
        expect(targetOf(reducer(loaded(), { type: 'setRepoint', from: ['sample_ref1', 'sample_ref2'], target: 'sample_ref1' }))).toBe('sample_ref1');
    });
});

describe('the studio (feature 010)', () => {
    const ready = () => reducer(reducer(initialState(), { type: 'snapshotLoaded', snapshot: snap() }), { type: 'toggle', id: guid(10) });
    it('opens only with a selection on an unmanaged solution, and closes when that stops being true', () => {
        expect(reducer(reducer(initialState(), { type: 'snapshotLoaded', snapshot: snap() }), { type: 'openStudio' }).studio).toBe(false);
        expect(reducer(initialState(), { type: 'openStudio' }).studio).toBe(false);
        let s = reducer(ready(), { type: 'openStudio' });
        expect(s.studio).toBe(true);
        s = reducer(s, { type: 'clearSelection' });
        expect(s.studio).toBe(false);
    });
    it('is closed by closeStudio, by opening a plan and by choosing another solution', () => {
        const open = reducer(ready(), { type: 'openStudio' });
        expect(reducer(open, { type: 'closeStudio' }).studio).toBe(false);
        expect(reducer(open, { type: 'selectSolution', id: 'x' }).studio).toBe(false);
    });
    it('keeps the choices when closed and the expanded state across solutions', () => {
        let s = reducer(ready(), { type: 'setRepoint', from: 'sample_ref1', target: 'sample_ref2' });
        s = reducer(reducer(s, { type: 'openStudio' }), { type: 'setDialogExpanded', on: true });
        s = reducer(s, { type: 'closeStudio' });
        expect([fromOf(s), targetOf(s), s.dialogExpanded]).toEqual([['sample_ref1'], 'sample_ref2', true]);
        expect(reducer(s, { type: 'selectSolution', id: 'x' }).dialogExpanded).toBe(true);
    });
});

describe('the studio step (feature 014)', () => {
    const B = '/providers/Microsoft.PowerApps/apis/shared_b';
    const refs = [ref(1), ref(2), ref(3, { connectorId: B })];
    const ready = () => {
        let s = reducer(initialState(), { type: 'snapshotLoaded', snapshot: buildSnapshot(input({ references: refs, memberReferenceIds: refs.map(r => r.id), flows: [flow(10, ['sample_ref1', 'sample_ref3'])] })) });
        s = reducer(s, { type: 'toggle', id: guid(10) });
        return reducer(s, { type: 'openStudio' });
    };
    it('starts on the first step each time the studio is opened', () => {
        let s = reducer(ready(), { type: 'studioGo', step: 2 });
        expect(s.studioStep).toBe(2);
        s = reducer(reducer(s, { type: 'closeStudio' }), { type: 'openStudio' });
        expect(s.studioStep).toBe(0);
    });
    it('is kept in range: two categories and the summary make steps 0 to 2', () => {
        const s = ready();
        expect(reducer(s, { type: 'studioGo', step: 9 }).studioStep).toBe(2);
        expect(reducer(s, { type: 'studioGo', step: -3 }).studioStep).toBe(0);
    });
    it('moving never changes the choices', () => {
        let s = reducer(ready(), { type: 'setGroup', group: { connectorId: B, from: ['sample_ref3'], target: '' } });
        const groups = s.repointGroups;
        s = reducer(reducer(s, { type: 'studioGo', step: 2 }), { type: 'studioGo', step: 0 });
        expect(s.repointGroups).toBe(groups);
    });
    it('a change of the selection that removes a category brings the step back into range', () => {
        let s = reducer(ready(), { type: 'studioGo', step: 2 });
        s = reducer(s, { type: 'snapshotLoaded', snapshot: buildSnapshot(input({ references: refs, memberReferenceIds: refs.map(r => r.id), flows: [flow(10, ['sample_ref1'])] })) });
        expect(s.studioStep).toBeLessThanOrEqual(1);
    });
});

describe('managing the state of flows (feature 011)', () => {
    const planOf = (turnOff: boolean) => ({
        kind: 'repoint' as const, entity: 'workflow' as const, warnings: [], ...(turnOff ? { manageState: true } : {}),
        rows: [{ id: guid(10), label: 'F', field: 'clientdata' as const, oldValue: 'a', newValue: 'b', payload: 'p', affectedFlows: 1, affectedOn: turnOff ? 1 : 0, expectedCurrent: 'e', ...(turnOff ? { turnOff: true } : {}) }],
    });
    const atConfirm = (turnOff: boolean) => {
        let s = reducer(initialState(), { type: 'openPlan', plan: planOf(turnOff) });
        return reducer(s, { type: 'openConfirm' });
    };
    it('the permission is off by default and is set and unset by its own action', () => {
        expect(initialState().manageState).toBe(false);
        expect(reducer(initialState(), { type: 'setManageState', on: true }).manageState).toBe(true);
        expect(reducer(reducer(initialState(), { type: 'setManageState', on: true }), { type: 'setManageState', on: false }).manageState).toBe(false);
    });
    it('a new plan asks for both acknowledgements again', () => {
        let s = reducer(atConfirm(true), { type: 'setAck', on: true });
        s = reducer(s, { type: 'setStateAck', on: true });
        expect([s.planAck, s.stateAck]).toEqual([true, true]);
        s = reducer(s, { type: 'openPlan', plan: planOf(true) });
        expect([s.planAck, s.stateAck]).toEqual([false, false]);
    });
    it('the run never starts without the second acknowledgement when a flow is to be turned off', () => {
        let s = reducer(atConfirm(true), { type: 'setAck', on: true });
        expect(reducer(s, { type: 'applyStarted', now: 1, total: 1 }).wizard!.step).toBe('preview');
        s = reducer(s, { type: 'setStateAck', on: true });
        const started = reducer(s, { type: 'applyStarted', now: 1, total: 1 });
        expect(started.wizard).toMatchObject({ step: 'apply', phase: 'off', states: true });
    });
    it('the second acknowledgement alone does not start it either', () => {
        const s = reducer(atConfirm(true), { type: 'setStateAck', on: true });
        expect(reducer(s, { type: 'applyStarted', now: 1, total: 1 }).wizard!.step).toBe('preview');
    });
    it('a plan with nothing to turn off needs only the general one and starts in the write phase', () => {
        const s = reducer(atConfirm(false), { type: 'setAck', on: true });
        expect(reducer(s, { type: 'applyStarted', now: 1, total: 1 }).wizard).toMatchObject({ step: 'apply', phase: 'write', states: false });
    });
    it('the phase is set by its own action, only during the run', () => {
        const s = reducer(reducer(atConfirm(true), { type: 'setAck', on: true }), { type: 'setStateAck', on: true });
        const running = reducer(s, { type: 'applyStarted', now: 1, total: 1 });
        expect(reducer(running, { type: 'setPhase', phase: 'on', now: 5 }).wizard).toMatchObject({ phase: 'on', now: 5 });
        expect(reducer(atConfirm(true), { type: 'setPhase', phase: 'on', now: 5 }).wizard!.step).toBe('preview');
    });
});
