// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createController } from '../src/controller';
import { buildSnapshot } from '../src/model/analysis';
import { planConnectionChange, planRepoint } from '../src/model/plans';
import { initialState } from '../src/state/reducer';
import { createStore } from '../src/state/store';
import { mountMain, type Handlers } from '../src/views/main';
import { clientData, flow, guid, input, memoryHost, ref, solution } from './helpers/fixtures';

const B = '/providers/Microsoft.PowerApps/apis/shared_b';
const refs = [ref(1), ref(2), ref(3), ref(4, { connectorId: B })];
const REQUEST = { manual: { type: 'Request', kind: 'Button' } };
const flows = () => [
    flow(10, ['sample_ref1'], { name: 'Off flow', clientData: clientData(['sample_ref1'], {}, REQUEST) }),
    flow(11, ['sample_ref1'], { name: 'On flow', stateCode: 1, clientData: clientData(['sample_ref1'], {}, REQUEST) }),
];

/** The user path to the confirmation: Review, Preview, then Apply... opens the dialog. */
function openConfirm(store: ReturnType<typeof createStore>, plan: ReturnType<typeof planConnectionChange>): void {
    store.dispatch({ type: 'openPlan', plan });
    store.dispatch({ type: 'setTab', tab: 'table' }); // the before-and-after lines live in the Table tab of the Preview (feature 017)
    store.dispatch({ type: 'openConfirm' });
}

function screen() {
    const sol = solution();
    const store = createStore(initialState());
    const h: Handlers = { selectSolution: vi.fn(), refresh: vi.fn(), previewConnection: vi.fn(), previewRepoint: vi.fn(), previewRemove: vi.fn(), previewDelete: vi.fn(), createReference: vi.fn(), openNewReference: vi.fn(), refreshConnections: vi.fn(), checkConnection: vi.fn(), cleanupRemove: vi.fn(), cleanupDelete: vi.fn(), startMerge: vi.fn(), checkDependencies: vi.fn(), setTypedCode: vi.fn(), setManageState: vi.fn(), confirm: vi.fn(), saveBackup: vi.fn(), saveReport: vi.fn() };
    const root = document.createElement('div');
    document.body.innerHTML = '';
    document.body.append(root);
    mountMain(root, store, h, () => 'Test (Dev)');
    store.dispatch({ type: 'solutionsLoaded', solutions: [sol] });
    store.dispatch({ type: 'selectSolution', id: sol.id });
    store.dispatch({ type: 'snapshotLoaded', snapshot: buildSnapshot(input({ solution: sol, references: refs, memberReferenceIds: refs.map(r => r.id), flows: flows() })) });
    const snap = () => store.get().snapshot!;
    return { sol, store, h, root, snap };
}
const modal = (root: HTMLElement) => root.querySelector('.modal') as HTMLElement | null;
const apply = (root: HTMLElement) => [...root.querySelectorAll('.modal .btn')].find(b => b.textContent!.startsWith('Apply to')) as HTMLButtonElement;
const figs = (root: HTMLElement) => Object.fromEntries([...root.querySelectorAll('.modal .fig')].map(f => [f.querySelector('.fig-label')!.textContent, f.querySelector('.fig-value')!.textContent]));

describe('the confirmation dialog: connection change', () => {
    it('opens over the screen with the environment, and writes nothing by opening', () => {
        const { store, root, snap, h } = screen();
        expect(modal(root)).toBeNull();
        openConfirm(store, planConnectionChange(snap(), [guid(1), guid(2)], 'conn-9'));
        const m = modal(root)!;
        expect(m.getAttribute('role')).toBe('alertdialog');
        expect(m.getAttribute('aria-modal')).toBe('true');
        expect(m.querySelector('.modal-title')!.textContent).toBe('Change the connection of 2 references');
        expect(m.querySelector('.modal-subtitle .connection-badge')!.textContent).toContain('Test (Dev)');
        expect(h.confirm).not.toHaveBeenCalled();
    });
    it('shows the scope as four figures: rows, flows affected, flows turned on, not changed', () => {
        const { store, root, snap } = screen();
        openConfirm(store, planConnectionChange(snap(), [guid(1), guid(2)], 'conn-9'));
        expect(figs(root)).toEqual({ 'References to change': '2', 'Flows affected': '2', 'Turned on': '1', 'Not changed': '0' });
        expect(root.querySelector('.fig--warning .icon-power')).not.toBeNull();
    });
    it('one before-and-after line per row, with the reference name and logical name', () => {
        const { store, root, snap } = screen();
        openConfirm(store, planConnectionChange(snap(), [guid(1)], 'conn-9'));
        const row = root.querySelector('.change-row')!;
        expect(row.querySelector('.change-name strong')!.textContent).toBe('Ref 1');
        expect(row.querySelector('.change-name span')!.textContent).toBe('sample_ref1');
        expect(row.querySelector('.change-old')!.textContent).toBe('conn-1');
        expect(row.querySelector('.change-new')!.textContent).toBe('conn-9');
        expect(row.querySelector('.change-arrow')).not.toBeNull();
    });
    it('a reference without a connection says so in the before column', () => {
        const { store, root } = screen();
        const base = input({ references: refs.map(r => (r.id === guid(1) ? { ...r, connectionId: '' } : r)), memberReferenceIds: refs.map(r => r.id), flows: flows() });
        store.dispatch({ type: 'snapshotLoaded', snapshot: buildSnapshot(base) });
        openConfirm(store, planConnectionChange(store.get().snapshot!, [guid(1)], 'conn-9'));
        expect(root.querySelector('.change-old .chip--warning')!.textContent).toBe('No connection');
    });
    it('a blocked row is shown with its reason, is not counted and is never the reason to enable Apply', () => {
        const { store, root, snap } = screen();
        openConfirm(store, planConnectionChange(snap(), [guid(1), guid(4)], 'conn-9')); // mixed connectors: both blocked
        expect(root.querySelectorAll('.change-row--blocked')).toHaveLength(2);
        expect(root.querySelector('.change-reason .chip')!.textContent).toContain('different connectors');
        expect(figs(root)['Not changed']).toBe('2');
        expect(figs(root)['References to change']).toBe('0');
        (root.querySelector('.modal .toggle') as HTMLElement).click();
        expect(apply(root).disabled).toBe(true);
        expect(apply(root).textContent).toBe('Apply to 0 reference rows');
    });
    it('warnings are in a highlighted block; with none, there is none', () => {
        const { store, root, snap } = screen();
        openConfirm(store, planConnectionChange(snap(), [guid(1)], 'never-seen'));
        const warn = root.querySelector('.callout--warning')!;
        expect(warn.querySelector('.callout-title')!.textContent).toBe('Read before you apply');
        expect(warn.textContent).toContain('not used by any reference of this connector');
        store.dispatch({ type: 'closePlan' });
        openConfirm(store, planConnectionChange(snap(), [guid(2)], 'conn-1'));
        expect(root.querySelector('.callout--warning')).toBeNull();
    });
    it('says what is written', () => {
        const { store, root, snap } = screen();
        openConfirm(store, planConnectionChange(snap(), [guid(1)], 'conn-2'));
        expect(root.querySelector('.callout--info')!.textContent).toContain('Only the connection id of these references is written');
    });
});

describe('the confirmation dialog: acknowledgement, backup, cancel', () => {
    const open = () => {
        const s = screen();
        openConfirm(s.store, planConnectionChange(s.snap(), [guid(1)], 'conn-2'));
        return s;
    };
    it('Apply is disabled until the acknowledgement is ticked, and a Required chip says so', () => {
        const { root, store, h } = open();
        expect(apply(root).disabled).toBe(true);
        expect(root.querySelector('.modal-foot .chip--warning')!.textContent).toBe('Required');
        apply(root).click();
        expect(h.confirm).not.toHaveBeenCalled();
        (root.querySelector('.modal .toggle') as HTMLElement).click();
        expect(store.get().planAck).toBe(true);
        expect(apply(root).disabled).toBe(false);
        expect(root.querySelector('.modal-foot .chip--warning')).toBeNull();
        apply(root).click();
        expect(h.confirm).toHaveBeenCalledOnce();
    });
    it('ticking keeps the dialog open and the focus on the switch', () => {
        const { root } = open();
        const toggleEl = () => root.querySelector('.modal .toggle') as HTMLElement;
        toggleEl().focus();
        toggleEl().click();
        expect(modal(root)).not.toBeNull();
        expect(document.activeElement).toBe(toggleEl());
        expect(toggleEl().getAttribute('aria-checked')).toBe('true');
    });
    it('the acknowledgement names the environment and starts off with every new preview', () => {
        const { root, store, snap } = open();
        expect(root.querySelector('.modal-foot-note')!.textContent).toContain('written to Test (Dev)');
        (root.querySelector('.modal .toggle') as HTMLElement).click();
        openConfirm(store, planConnectionChange(snap(), [guid(2)], 'conn-1'));
        expect(store.get().planAck).toBe(false);
        expect(apply(root).disabled).toBe(true);
    });
    it('focus starts on Cancel, never on Apply', () => {
        const { root } = open();
        expect(document.activeElement).toBe(root.querySelector('.modal [data-autofocus]'));
        expect((document.activeElement as HTMLElement).textContent).toBe('Cancel');
    });
    it('Cancel, the close button and Escape close the dialog, stay on the Preview, and nothing is confirmed', () => {
        for (const how of ['cancel', 'close', 'escape'] as const) {
            const { root, store, h } = open();
            if (how === 'cancel') (root.querySelector('.modal [data-autofocus]') as HTMLElement).click();
            if (how === 'close') (root.querySelector('.modal-close') as HTMLElement).click();
            if (how === 'escape') modal(root)!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            expect(modal(root), how).toBeNull();
            expect(store.get().wizard).toMatchObject({ step: 'preview', confirmOpen: false });
            expect(store.get().plan).not.toBeNull();
            expect(h.confirm).not.toHaveBeenCalled();
        }
    });
    it('the backup is offered, and once saved the dialog says so', () => {
        const { root, store, h } = open();
        const callout = () => root.querySelector('.callout--primary, .callout--success')!;
        expect(callout().querySelector('.callout-title')!.textContent).toBe('Save a backup first (recommended)');
        (callout().querySelector('.btn') as HTMLElement).click();
        expect(h.saveBackup).toHaveBeenCalledOnce();
        store.dispatch({ type: 'backupSaved' });
        expect(callout().querySelector('.callout-title')!.textContent).toBe('Backup saved');
        expect(callout().querySelector('.btn')!.textContent).toBe('Save again');
        expect(modal(root)).not.toBeNull();
    });
    it('the dialog body keeps its scroll while the dialog is rebuilt', () => {
        const tops = new WeakMap<Element, number>();
        Object.defineProperty(HTMLElement.prototype, 'scrollTop', { configurable: true, get() { return tops.get(this) ?? 0; }, set(v: number) { tops.set(this, v); } });
        try {
            const { root } = open();
            (root.querySelector('.modal-body') as HTMLElement).scrollTop = 90;
            (root.querySelector('.modal .toggle') as HTMLElement).click();
            expect((root.querySelector('.modal-body') as HTMLElement).scrollTop).toBe(90);
        } finally {
            delete (HTMLElement.prototype as unknown as Record<string, unknown>)['scrollTop'];
        }
    });
    it('no preview, no acknowledgement and no saved backup: the flags are reset', () => {
        const { root, store } = open();
        (root.querySelector('.modal .toggle') as HTMLElement).click();
        store.dispatch({ type: 'backupSaved' });
        store.dispatch({ type: 'closePlan' });
        expect([store.get().planAck, store.get().backupSaved]).toEqual([false, false]);
        store.dispatch({ type: 'setAck', on: true });
        store.dispatch({ type: 'backupSaved' });
        expect([store.get().planAck, store.get().backupSaved]).toEqual([false, false]);
    });
});

describe('the confirmation dialog: re-point', () => {
    it('shows each flow with the reference it has now, an arrow and the reference it will have, with connectors', () => {
        const { store, root, snap } = screen();
        openConfirm(store, planRepoint(snap(), [guid(10)], 'sample_ref1', 'sample_ref2'));
        expect(modal(root)!.querySelector('.modal-title')!.textContent).toBe('Re-point 1 flow');
        const row = root.querySelector('.change-row')!;
        expect(row.querySelector('.change-name strong')!.textContent).toBe('Off flow');
        expect(row.querySelector('.change-name span')!.textContent).toBe('Instant flow');
        expect(row.querySelector('.change-old .conn-name')!.textContent).toBe('Ref 1');
        expect(row.querySelector('.change-new .conn-name')!.textContent).toBe('Ref 2');
        expect(row.querySelector('.change-old .conn-logical')!.textContent).toBe('A');
        expect(root.querySelector('.callout--info')!.textContent).toContain('Only the connection reference name inside each flow definition changes');
    });
    it('a flow that is turned on is shown blocked, with the instruction, and not counted', () => {
        const { store, root, snap } = screen();
        openConfirm(store, planRepoint(snap(), [guid(10), guid(11)], 'sample_ref1', 'sample_ref2'));
        expect(figs(root)).toEqual({ 'Flows to change': '1', 'Flows affected': '1', 'Turned on': '0', 'Not changed': '1' });
        expect(root.querySelector('.change-row--blocked .change-reason .chip')!.textContent).toContain('turn it off first');
    });
});

describe('nothing is written without the acknowledgement, whatever the screen does', () => {
    function wired() {
        const sol = solution();
        const flowRows = flows();
        const host = memoryHost({ [guid(1)]: { connectionid: 'conn-1' } });
        const store = createStore(initialState());
        const c = createController(host, store);
        store.dispatch({ type: 'solutionsLoaded', solutions: [sol] });
        store.dispatch({ type: 'selectSolution', id: sol.id });
        store.dispatch({ type: 'snapshotLoaded', snapshot: buildSnapshot(input({ solution: sol, references: refs, memberReferenceIds: refs.map(r => r.id), flows: flowRows })) });
        openConfirm(store, planConnectionChange(store.get().snapshot!, [guid(1)], 'conn-9'));
        return { host, store, c };
    }
    it('confirm without the tick does nothing', async () => {
        const { host, store, c } = wired();
        c.confirm();
        await c.idle();
        expect(host.updates).toEqual([]);
        expect(store.get().plan).not.toBeNull();
        expect(store.get().wizard!.step).toBe('preview');
    });
    it('confirm after the tick writes, once', async () => {
        const { host, store, c } = wired();
        store.dispatch({ type: 'setAck', on: true });
        c.confirm();
        await c.idle();
        expect(host.updates).toHaveLength(1);
        expect(host.updates[0]).toMatchObject({ entity: 'connectionreference', id: guid(1), record: { connectionid: 'conn-9' } });
    });
});

describe('the dialog fits a narrow pane', () => {
    const kit = readFileSync(resolve(process.cwd(), 'src/ui/ui.css'), 'utf8');
    it('stacks the before-and-after columns and tightens the padding under 640px', () => {
        expect(kit).toMatch(/@media \(max-width: 640px\)[^@]*\.change-row \{ grid-template-columns: 1fr; \}/s);
        expect(kit).toMatch(/\.modal \{[^}]*width: min\(780px, 100%\)/);
        expect(kit).toMatch(/\.modal \{[^}]*max-height: calc\(100vh/);
        expect(kit).toMatch(/\.modal-body \{[^}]*overflow: auto/);
    });
});
