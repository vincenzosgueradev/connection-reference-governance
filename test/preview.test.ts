// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { buildSnapshot } from '../src/model/analysis';
import { planConnectionChange } from '../src/model/plans';
import { initialState } from '../src/state/reducer';
import { createStore } from '../src/state/store';
import { mountMain, type Handlers } from '../src/views/main';
import { guid, input, ref, solution } from './helpers/fixtures';
import { app, buttonByText, q, qa, settle, reviewChanges } from './helpers/scenario';

/** Feature 007: the Preview step, driven like a user. */

async function toPreview(kind: 'repoint' | 'connection' = 'repoint') {
    const a = await app();
    if (kind === 'repoint') {
        a.store.dispatch({ type: 'selectAll', ids: [guid(10), guid(11)] });
        a.store.dispatch({ type: 'setRepoint', from: 'sample_ref1', target: 'sample_ref2' });
    } else {
        a.store.dispatch({ type: 'setView', view: 'references' });
        a.store.dispatch({ type: 'selectAll', ids: [guid(1), guid(2)] });
        a.store.dispatch({ type: 'setNewConnectionId', value: 'conn-9' });
    }
    reviewChanges(a);
    await settle();
    return a;
}
const cards = (root: ParentNode) => qa(root, '.item-card');
const strip = (root: ParentNode) => q(root, '.preview-summary')!.textContent;

describe('the Preview step: what is shown', () => {
    it('has the title, the stepper on Preview and one card per item with its name, id and number of changes', async () => {
        const { root } = await toPreview();
        expect(q(root, '.step-title')!.textContent).toBe('Preview what will be stored');
        expect(qa(root, '.stepper-item')[1]!.className).toContain('is-active');
        expect(cards(root)).toHaveLength(2);
        expect(q(cards(root)[0]!, '.item-title')!.textContent).toBe('Alpha flow');
        expect(q(cards(root)[0]!, '.item-sub')!.textContent).toBe(guid(10));
        expect(q(cards(root)[0]!, '.item-count')!.textContent).toBe('1 change');
    });
    it('a strip counts the items and the changes', async () => {
        expect(strip((await toPreview()).root)).toBe('2 items · 2 changes');
        expect(q((await toPreview()).root, '.hero')).toBeNull();
    });
});

describe('the diff of a re-pointed flow', () => {
    it('shows the changed line removed and added with signs and line numbers, and the rest collapsed', async () => {
        const { root } = await toPreview();
        const diff = q(cards(root)[0]!, '.diff')!;
        expect(diff.className).toBe('diff diff--split');
        expect(q(diff, '.diff-file')!.textContent).toBe('clientdata (formatted)');
        expect([...qa(diff, '.diff-stat span')].map(s => s.textContent)).toEqual(['+1', '-1']);
        const changed = qa(diff, 'tr.diff-row--changed')[0]!;
        expect(q(changed, '.diff-code--old')!.textContent).toContain('sample_ref1');
        expect(q(changed, '.diff-code--new')!.textContent).toContain('sample_ref2');
        expect(q(changed, '.diff-code--old .diff-mark')!.textContent).toBe('-');
        expect(q(changed, '.diff-code--new .diff-mark')!.textContent).toBe('+');
        expect(q(changed, '.diff-code--old .diff-hl')!.textContent).toBe('1');
        expect(q(changed, '.diff-code--new .diff-hl')!.textContent).toBe('2');
        expect(qa(changed, '.diff-no').map(n => n.textContent).filter(Boolean)).toHaveLength(2);
    });
    it('shows three lines of context around the change', async () => {
        const { root } = await toPreview();
        const rows = qa(q(cards(root)[0]!, '.diff')!, 'tbody tr');
        const idx = rows.findIndex(r => r.classList.contains('diff-row--changed'));
        expect(rows.slice(Math.max(0, idx - 3), idx).every(r => r.classList.contains('diff-row--context'))).toBe(true);
        expect(rows.slice(idx + 1, idx + 4).every(r => r.classList.contains('diff-row--context'))).toBe(true);
    });
    it('the unchanged rest of the definition is not repeated: the diff has far fewer rows than the definition has lines', async () => {
        const { root } = await toPreview();
        expect(qa(q(cards(root)[0]!, '.diff')!, 'tbody tr').length).toBeLessThan(20);
    });
});

describe('the diff of a change of connection', () => {
    it('shows the record before and after and only the connection id changing', async () => {
        const { root } = await toPreview('connection');
        const diff = q(cards(root)[0]!, '.diff')!;
        expect(q(diff, '.diff-file')!.textContent).toBe('connectionreference');
        const changed = qa(diff, 'tr.diff-row--changed');
        expect(changed).toHaveLength(1);
        expect(q(changed[0]!, '.diff-code--old')!.textContent).toContain('conn-1');
        expect(q(changed[0]!, '.diff-code--new')!.textContent).toContain('conn-9');
        expect(q(changed[0]!, '.diff-code--new .diff-hl')!.textContent).toBe('9');
    });
});

describe('layout, mode and collapsing', () => {
    it('Split is the default; Unified applies to every item at once', async () => {
        const { root, store } = await toPreview();
        expect(qa(root, '.diff--split')).toHaveLength(2);
        const unified = qa(root, '.layout-bar .segment').find(b => b.textContent === 'Unified')!;
        unified.click();
        expect(store.get().wizard!.layout).toBe('unified');
        expect(qa(root, '.diff--unified')).toHaveLength(2);
        expect(qa(root, '.diff--split')).toHaveLength(0);
        // a changed line is two lines in the unified view
        expect(qa(q(cards(root)[0]!, '.diff')!, '.diff-code--old')).toHaveLength(1);
        expect(qa(q(cards(root)[0]!, '.diff')!, '.diff-code--new')).toHaveLength(1);
    });
    it('the Table tab lists each item with what it is now and what it will be; the Code diff tab is the default', async () => {
        const { root } = await toPreview();
        expect(qa(root, '.preview-tabs > .segmented:first-child .segment').map(b => b.textContent)).toEqual(['Code diff', 'Table']);
        expect(qa(root, '.preview-tabs > .segmented:first-child .is-active').map(b => b.textContent)).toEqual(['Code diff']);
        expect(cards(root)).toHaveLength(2);
        qa(root, '.preview-tabs > .segmented:first-child .segment').find(b => b.textContent === 'Table')!.click();
        expect(cards(root)).toHaveLength(0);
        expect(q(root, '.diff')).toBeNull();
        expect(q(root, '.layout-bar')).toBeNull();
        const rows = qa(root, '.change-row');
        expect(rows).toHaveLength(2);
        expect(q(rows[0]!, '.change-name strong')!.textContent).toBe('Alpha flow');
        expect(q(rows[0]!, '.change-old')!.textContent).toContain('Ref 1');
        qa(root, '.preview-tabs > .segmented:first-child .segment').find(b => b.textContent === 'Code diff')!.click();
        expect(cards(root)).toHaveLength(2);
    });
    it('the chevron collapses an item and expands it again', async () => {
        const { root, store } = await toPreview();
        const chevron = () => q(cards(root)[0]!, '.expand-btn')!;
        expect(chevron().getAttribute('aria-expanded')).toBe('true');
        chevron().click();
        expect(store.get().wizard!.collapsed).toEqual([guid(10)]);
        expect(q(cards(root)[0]!, '.item-body')!.hasAttribute('hidden')).toBe(true);
        expect(q(cards(root)[0]!, '.diff')).toBeNull(); // a closed card does not hold the diff
        expect(chevron().getAttribute('aria-expanded')).toBe('false');
        chevron().click();
        expect(q(cards(root)[0]!, '.diff')).not.toBeNull();
    });
    it('the choices are kept while the step is redrawn', async () => {
        const { root, store } = await toPreview();
        qa(root, '.layout-bar .segment').find(b => b.textContent === 'Unified')!.click();
        q(cards(root)[0]!, '.expand-btn')!.click();
        expect(store.get().wizard).toMatchObject({ layout: 'unified', collapsed: [guid(10)] });
        expect(qa(root, '.diff--unified')).toHaveLength(1);
    });
});

describe('items that are not written', () => {
    it('a blocked item is a dashed card with the reason, no diff, and is not counted', async () => {
        const a = await app();
        a.flows[1]!.stateCode = 1;
        a.controller.selectSolution(a.sol.id);
        await settle();
        a.store.dispatch({ type: 'selectAll', ids: [guid(10), guid(11)] });
        a.store.dispatch({ type: 'setRepoint', from: 'sample_ref1', target: 'sample_ref2' });
        reviewChanges(a);
        await settle();
        const blocked = cards(a.root)[1]!;
        expect(blocked.className).toContain('item-card--blocked');
        expect(q(blocked, '.item-count')!.textContent).toBe('Blocked');
        expect(q(blocked, '.callout--warning')!.textContent).toContain('turn it off first');
        expect(q(blocked, '.diff')).toBeNull();
        expect(q(blocked, '.item-head .segmented')).toBeNull();
        expect(strip(a.root)).toBe('1 of 2 items · 1 change · 1 not changed');
    });
});

describe('many items and big definitions', () => {
    // a plan built directly: 45 references of one connector, all changing connection
    function many(n: number) {
        const refs = Array.from({ length: n }, (_, i) => ref(i + 1));
        const sol = solution();
        const store = createStore(initialState());
        const root = document.createElement('div');
        document.body.innerHTML = '';
        document.body.append(root);
        const h: Handlers = { selectSolution: () => undefined, refresh: () => undefined, previewConnection: () => undefined, previewRepoint: () => undefined, previewRemove: () => undefined, previewDelete: () => undefined, createReference: () => undefined, openNewReference: () => undefined, refreshConnections: () => undefined, checkConnection: () => undefined, setTypedCode: () => undefined, setManageState: () => undefined, confirm: () => undefined, saveBackup: () => undefined, saveReport: () => undefined };
        mountMain(root, store, h, () => 'Env');
        store.dispatch({ type: 'solutionsLoaded', solutions: [sol] });
        store.dispatch({ type: 'selectSolution', id: sol.id });
        store.dispatch({ type: 'snapshotLoaded', snapshot: buildSnapshot(input({ solution: sol, references: refs, memberReferenceIds: refs.map(r => r.id), flows: [] })) });
        store.dispatch({ type: 'openPlan', plan: planConnectionChange(store.get().snapshot!, refs.map(r => r.id), 'conn-new') });
        return { root, store };
    }
    it('shows twenty items at first and twenty more each time', () => {
        const { root, store } = many(45);
        expect(cards(root)).toHaveLength(20);
        const more = () => buttonByText(root, 'Show 20 more (25 left)') ?? buttonByText(root, 'Show 5 more (5 left)') ?? buttonByText(root, 'Show 20 more (5 left)');
        expect(buttonByText(root, 'Show 20 more (25 left)')).toBeDefined();
        more()!.click();
        expect(cards(root)).toHaveLength(40);
        expect(store.get().wizard!.shown).toBe(40);
        expect(buttonByText(root, 'Show 5 more (5 left)')).toBeDefined();
        buttonByText(root, 'Show 5 more (5 left)')!.click();
        expect(cards(root)).toHaveLength(45);
        expect(qa(root, 'button').some(b => b.textContent!.startsWith('Show '))).toBe(false);
    });
    it('a definition too large to compare says so instead of failing', () => {
        const { store, root } = many(1);
        const a = JSON.stringify({ lines: Array.from({ length: 2600 }, (_, i) => `old ${i}`) });
        const b = JSON.stringify({ lines: Array.from({ length: 2600 }, (_, i) => `new ${i}`) });
        const plan = store.get().plan!;
        store.dispatch({ type: 'closePlan' });
        store.dispatch({ type: 'openPlan', plan: { kind: 'repoint', entity: 'workflow', warnings: [], rows: [{ ...plan.rows[0]!, field: 'clientdata', expectedCurrent: a, payload: b }] } });
        expect(q(root, '.diff-note')!.textContent).toContain('too large to compare line by line');
        expect(q(root, '.diff-stat .diff-add')!.textContent).toBe('+2600');
    }, 30_000); // a heavy diff of 2600 lines: under the load of the whole suite it can pass the default 5 seconds
});

describe('Apply... and Back', () => {
    it('Apply... opens the confirmation and writes nothing by itself; Back returns to the choices with the plan discarded', async () => {
        const a = await toPreview();
        buttonByText(a.root, 'Apply...')!.click();
        await settle();
        expect(q(a.root, '.modal')).not.toBeNull();
        expect(a.calls.updates).toEqual([]);
        expect(a.store.get().wizard!.step).toBe('preview');
        (q(a.root, '.modal-close') as HTMLElement).click();
        expect(q(a.root, '.modal')).toBeNull();
        buttonByText(a.root, 'Back')!.click();
        expect(a.store.get().wizard).toBeNull();
        expect(a.store.get().plan).toBeNull();
        expect(a.calls.updates).toEqual([]);
        expect(q(a.root, '.action-strip')).not.toBeNull();
    });
    it('no earlier step is a link in the breadcrumb: the Preview is the first one', async () => {
        const a = await toPreview();
        expect(qa(a.crumbs, '.crumb').map(c => c.textContent)).toEqual(['Solutions', 'Sample', 'Preview']);
        expect(qa(a.crumbs, '.crumb--link').map(c => c.textContent)).toEqual(['Solutions', 'Sample']);
    });
    it('Apply... is disabled when no row can be written, and the permission cannot change it', async () => {
        const a = await app();
        a.flows.forEach(f => { f.stateCode = 2; }); // suspended: not something the tool turns off
        a.controller.selectSolution(a.sol.id);
        await settle();
        a.store.dispatch({ type: 'selectAll', ids: [guid(10)] });
        a.store.dispatch({ type: 'setRepoint', from: 'sample_ref1', target: 'sample_ref2' });
        a.controller.previewRepoint(); // the studio no longer offers a choice that cannot be written: open the plan directly
        await settle();
        expect(buttonByText(a.root, 'Apply...')!.disabled).toBe(true);
    });
});
