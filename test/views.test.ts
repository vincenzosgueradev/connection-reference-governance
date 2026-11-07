// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { buildSnapshot } from '../src/model/analysis';
import { planConnectionChange } from '../src/model/plans';
import { initialState } from '../src/state/reducer';
import { createStore } from '../src/state/store';
import { mountMain, type Handlers } from '../src/views/main';
import { clientData, flow, guid, input, ref, solution, targetOf } from './helpers/fixtures';
import type { SolutionInfo } from '../src/types';

function setup(managed = false, flows = [flow(10, ['sample_ref1']), flow(11, ['sample_ref1', 'ghost'])]) {
    const sol = solution(managed);
    const store = createStore(initialState());
    const h: Handlers = { selectSolution: vi.fn(), refresh: vi.fn(), previewConnection: vi.fn(), previewRepoint: vi.fn(), previewRemove: vi.fn(), previewDelete: vi.fn(), createReference: vi.fn(), openNewReference: vi.fn(), refreshConnections: vi.fn(), checkConnection: vi.fn(), cleanupRemove: vi.fn(), cleanupDelete: vi.fn(), startMerge: vi.fn(), checkDependencies: vi.fn(), setTypedCode: vi.fn(), setManageState: vi.fn(), confirm: vi.fn(), saveBackup: vi.fn(), saveReport: vi.fn() };
    const root = document.createElement('div');
    document.body.append(root);
    mountMain(root, store, h, () => 'Test (Dev)');
    store.dispatch({ type: 'solutionsLoaded', solutions: [sol] });
    store.dispatch({ type: 'selectSolution', id: sol.id });
    store.dispatch({ type: 'snapshotLoaded', snapshot: buildSnapshot(input({ solution: sol, flows })) });
    return { store, root, h };
}
const button = (root: HTMLElement, text: string) => [...root.querySelectorAll('button')].find(b => b.textContent?.includes(text))!;

/** The user path to the confirmation: Review, Preview, then Apply... opens the dialog. */
function openConfirm(store: ReturnType<typeof createStore>, plan: ReturnType<typeof planConnectionChange>): void {
    store.dispatch({ type: 'openPlan', plan });
    store.dispatch({ type: 'openConfirm' });
}

/** The user path to the Result step of a finished run. */
function finishRun(store: ReturnType<typeof createStore>, plan: ReturnType<typeof planConnectionChange>, results: { id: string; label: string; status: 'done' | 'failed' | 'skipped'; message: string }[]): void {
    openConfirm(store, plan);
    store.dispatch({ type: 'setAck', on: true });
    store.dispatch({ type: 'applyStarted', now: 1000, total: results.length });
    store.dispatch({ type: 'applied', results, now: 15000 });
}

describe('views', () => {
    it('shows one row per flow and flags the missing reference', () => {
        const { root } = setup();
        expect(root.querySelectorAll('tbody tr').length).toBe(2);
        const chips = [...root.querySelectorAll('.chip')];
        expect(chips.some(c => c.textContent === 'Missing reference' && (c as HTMLElement).title.includes('does not exist in the environment'))).toBe(true);
    });
    it('is read-only for a managed solution', () => {
        const { root, store } = setup(true);
        store.dispatch({ type: 'setView', view: 'references' });
        store.dispatch({ type: 'toggle', id: guid(1) });
        expect((button(root, 'Choose changes') as HTMLButtonElement).disabled).toBe(true);
        expect(root.textContent).toContain('This solution is managed: it can be read but not changed.');
    });
    it('shows selected count and affected flows before the preview can be opened', () => {
        const { root, store } = setup();
        store.dispatch({ type: 'setView', view: 'references' });
        expect((button(root, 'Choose changes') as HTMLButtonElement).disabled).toBe(true);
        store.dispatch({ type: 'toggle', id: guid(1) });
        expect(root.querySelector('.action-count')!.textContent).toBe('1 selected, 2 flows affected');
        expect((button(root, 'Choose changes') as HTMLButtonElement).disabled).toBe(false);
    });
    it('preview names the environment, lists old value and needs an explicit apply', () => {
        const { root, store, h } = setup();
        store.dispatch({ type: 'setView', view: 'references' });
        store.dispatch({ type: 'toggle', id: guid(1) });
        openConfirm(store, planConnectionChange(store.get().snapshot!, [guid(1)], 'new-conn'));
        expect(root.querySelector('[role=alertdialog]')!.textContent).toContain('Test (Dev)');
        expect(root.textContent).toContain('conn-1');
        expect(h.confirm).not.toHaveBeenCalled();
        expect((button(root, 'Apply to 1') as HTMLButtonElement).disabled).toBe(true);
        (root.querySelector('.modal .toggle') as HTMLElement).click();
        button(root, 'Apply to 1').click();
        expect(h.confirm).toHaveBeenCalledOnce();
    });
    it('preview shows warnings and offers a backup before apply', () => {
        const { root, store, h } = setup();
        const plan = planConnectionChange(store.get().snapshot!, [guid(1)], 'never-seen');
        openConfirm(store, plan);
        expect(root.textContent).toContain('not used by any reference of this connector');
        button(root, 'Save backup').click();
        expect(h.saveBackup).toHaveBeenCalledOnce();
        expect(h.confirm).not.toHaveBeenCalled();
    });
    it('apply is disabled when every row is blocked', () => {
        const { root, store } = setup();
        openConfirm(store, planConnectionChange(store.get().snapshot!, [guid(1)], ''));
        expect((button(root, 'Apply to 0') as HTMLButtonElement).disabled).toBe(true);
    });
    it('empty state names the filter and the solution', () => {
        const { root, store } = setup();
        store.dispatch({ type: 'setFilter', filter: 'zzz' });
        expect(root.textContent).toContain('Nothing matches the filter "zzz" in Sample.');
    });
    it('empty solution says so', () => {
        const { root } = setup(false, []);
        expect(root.textContent).toContain('Sample has no flows.');
    });
    it('writes data as text, never as markup', () => {
        const { root } = setup(false, [flow(10, ['sample_ref1'], { name: '<img src=x onerror=alert(1)>' })]);
        expect(root.querySelector('img')).toBeNull();
    });
    it('shows results per row until dismissed', () => {
        const { root, store } = setup();
        finishRun(store, planConnectionChange(store.get().snapshot!, [guid(1)], 'conn-9'), [{ id: 'a', label: 'A', status: 'failed', message: 'No privilege' }]);
        expect(root.textContent).toContain('No privilege');
        button(root, 'Back to solution').click();
        expect(root.textContent).not.toContain('No privilege');
        expect(store.get().wizard).toBeNull();
    });
});


describe('solutions list and navigation', () => {
    const NOW = Date.now();
    const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();
    const sols: SolutionInfo[] = [
        { ...solution(false), id: guid(1), name: 'Alpha', uniqueName: 'alpha', publisher: 'P1', createdOn: iso(3 * 86400000) },
        { ...solution(false), id: guid(2), name: 'Beta', uniqueName: 'beta', publisher: 'P2', createdOn: iso(40 * 86400000) },
        { ...solution(true), id: guid(3), name: 'Gamma', uniqueName: 'gamma', publisher: 'P1' },
    ];
    const handlers = (): Handlers => ({ selectSolution: vi.fn(), refresh: vi.fn(), previewConnection: vi.fn(), previewRepoint: vi.fn(), previewRemove: vi.fn(), previewDelete: vi.fn(), createReference: vi.fn(), openNewReference: vi.fn(), refreshConnections: vi.fn(), checkConnection: vi.fn(), cleanupRemove: vi.fn(), cleanupDelete: vi.fn(), startMerge: vi.fn(), checkDependencies: vi.fn(), setTypedCode: vi.fn(), setManageState: vi.fn(), confirm: vi.fn(), saveBackup: vi.fn(), saveReport: vi.fn() });
    function list(counts: Record<string, number> | null = { [guid(1)]: 2, [guid(2)]: 7 }) {
        document.body.innerHTML = '<nav id="breadcrumb" class="breadcrumb" hidden></nav>';
        const store = createStore(initialState());
        const h = handlers();
        const root = document.createElement('div');
        document.body.append(root);
        mountMain(root, store, h, () => 'Env');
        store.dispatch({ type: 'solutionsLoaded', solutions: sols });
        if (counts) store.dispatch({ type: 'flowCountsLoaded', counts, total: 8 });
        return { store, root, h };
    }
    const names = (root: HTMLElement) => [...root.querySelectorAll('tbody tr td:first-child')].map(c => c.textContent);

    it('opens with a hero: the number of solutions and of flows, like the sibling home screen', () => {
        const { root } = list();
        expect(root.querySelector('.hero-title')!.textContent).toBe('Solutions');
        expect([...root.querySelectorAll('.hero dt')].map(d => d.textContent)).toEqual(['Solutions', 'Flows']);
        expect([...root.querySelectorAll('.hero dd')].map(d => d.textContent)).toEqual(['2', '8']);
    });
    it('shows a dash for the flow total and the counts while they are not known', () => {
        const { root } = list(null);
        expect(root.querySelectorAll('.hero dd')[1]!.textContent).toBe('-');
        expect(root.querySelector('tbody tr td:nth-child(3)')!.textContent).toBe('-');
    });
    it('has an Unmanaged tab with a count and a Managed tab that is disabled and says why; no All tab', () => {
        const { root } = list();
        const segs = [...root.querySelectorAll('.segment')] as HTMLButtonElement[];
        expect(segs.map(b => b.textContent)).toEqual(['Unmanaged 2', 'Managed 1']);
        expect(segs[0]!.classList.contains('is-active')).toBe(true);
        expect(segs[1]!.disabled).toBe(true);
        expect(segs[1]!.title).toContain('cannot be changed');
    });
    it('lists unmanaged solutions only', () => {
        const { root } = list();
        expect(names(root)).toEqual(['Beta', 'Alpha']);
        expect(root.textContent).not.toContain('Gamma');
    });
    it('is sorted by flows, most first, with the count as a pill', () => {
        const { root } = list();
        expect(names(root)).toEqual(['Beta', 'Alpha']);
        expect([...root.querySelectorAll('tbody tr td:nth-child(3) .count-pill')].map(p => p.textContent)).toEqual(['7', '2']);
        const flowsHead = [...root.querySelectorAll('th')].find(h => h.textContent === 'Flows')!;
        expect(flowsHead.getAttribute('aria-sort')).toBe('descending');
    });
    it('a click on a header sorts by it, and a second click flips the order', () => {
        const { root, store } = list();
        const head = (text: string) => [...root.querySelectorAll('th')].find(h => h.textContent === text) as HTMLElement;
        head('Display name').click();
        expect(names(root)).toEqual(['Alpha', 'Beta']);
        expect(head('Display name').getAttribute('aria-sort')).toBe('ascending');
        head('Display name').click();
        expect(names(root)).toEqual(['Beta', 'Alpha']);
        head('Created').click();
        expect(names(root)).toEqual(['Alpha', 'Beta']);
        expect(store.get().solutionSort).toEqual({ key: 'created', desc: true });
        expect(head('Version').classList.contains('sortable')).toBe(false);
    });
    it('shows when a solution was created, in words for recent ones, with the full date as tooltip', () => {
        const { root } = list();
        const cells = [...root.querySelectorAll('tbody tr td:nth-child(4) span')] as HTMLElement[];
        expect(cells.map(c => c.textContent)).toEqual([new Date(NOW - 40 * 86400000).toLocaleDateString(), '3 days ago']);
        expect(cells[1]!.title).not.toBe('');
    });
    it('search matches name, unique name and publisher, and the empty state names the term', () => {
        const { root, store } = list();
        store.dispatch({ type: 'setSolutionFilter', filter: 'p2' });
        expect(names(root)).toEqual(['Beta']);
        store.dispatch({ type: 'setSolutionFilter', filter: 'zzz' });
        expect(root.textContent).toContain('No solution matches "zzz".');
    });
    it('the search box has the glyph and a clear button that empties it', () => {
        const { root, store } = list();
        expect(root.querySelector('.search-box .search-icon')).not.toBeNull();
        expect((root.querySelector('.search-clear') as HTMLElement).hidden).toBe(true);
        store.dispatch({ type: 'setSolutionFilter', filter: 'be' });
        (root.querySelector('.search-clear') as HTMLElement).click();
        expect(store.get().solutionFilter).toBe('');
    });
    it('clicking a row, or pressing Enter on it, opens that solution', () => {
        const { root, h } = list();
        (root.querySelector('tbody tr') as HTMLElement).click();
        expect(h.selectSolution).toHaveBeenCalledWith(guid(2));
        (root.querySelectorAll('tbody tr')[1] as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        expect(h.selectSolution).toHaveBeenLastCalledWith(guid(1));
    });
    it('shows Updating... with a spinner only while busy, and the toolbar never gains or loses an element', () => {
        const { root, store } = list();
        const count = () => root.querySelectorAll('.toolbar > *').length;
        const idle = count();
        expect(root.querySelector('.status-slot')!.className).toBe('status-slot is-idle');
        store.dispatch({ type: 'busy', busy: true });
        expect(root.querySelector('.status-slot')!.className).toBe('status-slot');
        expect(root.querySelector('.status-slot .spinner')).not.toBeNull();
        expect(root.querySelector('.status-slot')!.textContent).toBe('Updating...');
        expect(count()).toBe(idle);
    });
    it('opening a solution shows the breadcrumb and going back asks for the list again', () => {
        const { root, store, h } = list();
        store.dispatch({ type: 'selectSolution', id: guid(1) });
        store.dispatch({ type: 'snapshotLoaded', snapshot: buildSnapshot(input({ solution: { ...sols[0]! } })) });
        const crumbs = document.getElementById('breadcrumb')!;
        expect(crumbs.hidden).toBe(false);
        expect(crumbs.textContent).toContain('Solutions');
        (crumbs.querySelector('.crumb--link') as HTMLElement).click();
        expect(h.selectSolution).toHaveBeenCalledWith('');
        expect(root.querySelector('.panel-heading')!.textContent).toBe('Alpha');
    });
    it('says why the list is empty: loading, none unmanaged', () => {
        document.body.innerHTML = '';
        const store = createStore(initialState());
        const root = document.createElement('div');
        mountMain(root, store, handlers(), () => '');
        store.dispatch({ type: 'busy', busy: true });
        expect(root.textContent).toContain('Loading solutions...');
        store.dispatch({ type: 'solutionsLoaded', solutions: [sols[2]!] });
        store.dispatch({ type: 'busy', busy: false });
        expect(root.textContent).toContain('There are no unmanaged solutions in the connected environment.');
    });
    it('uses the shared kit for the controls (no browser checkbox, no emoji)', () => {
        const { root, store } = setup();
        store.dispatch({ type: 'toggle', id: guid(10) });
        expect(root.querySelector('input[type=checkbox]')).toBeNull();
        expect(root.querySelector('.check.is-on')).not.toBeNull();
        expect(root.querySelectorAll('.btn').length).toBeGreaterThan(0);
        expect(root.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
    });
});

describe('records: one row per flow or reference, details under it', () => {
    const REQUEST = { manual: { type: 'Request', kind: 'Button', inputs: { schema: {} } } };
    const RECURRENCE = { Recurrence: { type: 'Recurrence', recurrence: { frequency: 'Day', interval: 1 } } };
    const EVENT = { When_a_new_email_arrives: { type: 'OpenApiConnectionNotification', inputs: { host: { connectionName: 'shared_k0', operationId: 'OnNewEmailV3' } } } };
    const mk = (n: number, names: string[], triggers: Record<string, unknown>, over = {}) => flow(n, names, { clientData: clientData(names, {}, triggers), ...over });
    const flows = () => [
        mk(10, ['sample_ref1', 'sample_ref2'], REQUEST, { name: 'Alpha flow', description: 'Sends the report', stateCode: 1 }),
        mk(11, ['sample_ref1'], RECURRENCE, { name: 'Beta flow' }),
        mk(12, [], EVENT, { name: 'Gamma flow' }),
        mk(13, [], {}, { name: 'Delta flow' }),
    ];
    const cellsOf = (root: HTMLElement, name: string) => [...[...root.querySelectorAll('tbody tr:not(.detail-row)')].find(tr => tr.textContent!.includes(name))!.querySelectorAll('td')];
    const rowOf = (root: HTMLElement, name: string) => [...root.querySelectorAll('tbody tr:not(.detail-row)')].find(tr => tr.textContent!.includes(name)) as HTMLElement;

    it('the flows table shows name, description, type, state, connections and when it was modified', () => {
        const { root } = setup(false, flows());
        expect([...root.querySelectorAll('th')].map(t => t.textContent)).toEqual(['', '', 'Flow', 'Type', 'State', 'Connections', 'Modified']);
        const c = cellsOf(root, 'Alpha flow');
        expect(c[2]!.textContent).toBe('Alpha flowSends the report');
        expect(c[3]!.textContent).toBe('Instant');
        expect(c[4]!.textContent).toBe('On');
        expect(c[5]!.textContent).toContain('2 connections');
        expect(c[6]!.textContent).not.toBe('');
    });
    it('the type comes from the trigger: Request is instant, Recurrence scheduled, an event trigger automated, none unknown', () => {
        const { root } = setup(false, flows());
        const type = (name: string) => cellsOf(root, name)[3]!.textContent;
        expect([type('Alpha flow'), type('Beta flow'), type('Gamma flow'), type('Delta flow')]).toEqual(['Instant', 'Scheduled', 'Automated', 'Unknown']);
        expect(cellsOf(root, 'Delta flow')[3]!.querySelector('.chip')!.getAttribute('title')).toContain('no trigger');
    });
    it('the connections of a flow are small glyph tiles with their names as tooltips, not a stack of text', () => {
        const { root } = setup(false, flows());
        const tiles = [...cellsOf(root, 'Alpha flow')[5]!.querySelectorAll('.conn-tile')] as HTMLElement[];
        expect(tiles.map(t => t.title)).toEqual(['A: Ref 1', 'A: Ref 2']);
        expect(cellsOf(root, 'Gamma flow')[5]!.textContent).toBe('None');
    });
    it('a missing reference shows a red tile and a broken definition says so', () => {
        const { root } = setup(false, [mk(10, ['ghost'], {}, { name: 'Ghost flow' }), flow(11, [], { name: 'Broken flow', clientData: 'nope' })]);
        expect(cellsOf(root, 'Ghost flow')[5]!.querySelector('.conn-tile--missing')).not.toBeNull();
        expect(cellsOf(root, 'Broken flow')[5]!.textContent).toBe('Unreadable');
    });
    it('a click on a row opens its details under it, a second click closes them', () => {
        const { root, store } = setup(false, flows());
        expect(root.querySelector('.detail-row')).toBeNull();
        rowOf(root, 'Alpha flow').click();
        expect(root.querySelectorAll('.detail-row')).toHaveLength(1);
        expect(store.get().expanded).toEqual([guid(10)]);
        expect(rowOf(root, 'Alpha flow').querySelector('.expand-btn')!.getAttribute('aria-expanded')).toBe('true');
        rowOf(root, 'Alpha flow').click();
        expect(root.querySelector('.detail-row')).toBeNull();
    });
    it('the details of a flow are key-value pairs: type, state, trigger, actions, owner, dates, id, description', () => {
        const { root } = setup(false, flows());
        rowOf(root, 'Alpha flow').click();
        const kv = Object.fromEntries([...root.querySelectorAll('.detail .kv-item')].map(i => [i.querySelector('dt')!.textContent, i.querySelector('dd')!.textContent]));
        expect(kv['Type']).toBe('Instant');
        expect(kv['State']).toBe('On');
        expect(kv['Trigger']).toBe('manual (Request, Button)');
        expect(kv['Actions']).toBe('2');
        expect(kv['Owner']).toBe('Owner A');
        expect(kv['Flow ID']).toBe(guid(10));
        expect(kv['Description']).toBe('Sends the report');
        expect(kv['Created']).not.toBe('-');
        expect(kv['Modified']).not.toBe('-');
    });
    it('an event trigger is named by its operation', () => {
        const { root } = setup(false, flows());
        rowOf(root, 'Gamma flow').click();
        expect([...root.querySelectorAll('.detail .kv-item')].find(i => i.querySelector('dt')!.textContent === 'Trigger')!.querySelector('dd')!.textContent).toBe('OnNewEmailV3 (OpenApiConnectionNotification)');
    });
    it('the connections of a flow are a table in the details: reference, connector, connection in full', () => {
        const { root } = setup(false, flows());
        rowOf(root, 'Alpha flow').click();
        const block = [...root.querySelectorAll('.detail-block')].find(b => b.querySelector('.detail-title')!.textContent === 'Connections')!;
        expect(block.querySelector('.detail-head .chip')!.textContent).toBe('2');
        expect([...block.querySelectorAll('th')].map(t => t.textContent)).toEqual(['Reference', 'Connector', 'Connection']);
        const first = [...block.querySelectorAll('tbody tr:first-child td')].map(c => c.textContent);
        expect(first).toEqual(['Ref 1sample_ref1', 'A', 'conn-1']);
    });
    it('a flow without connections says so in its details', () => {
        const { root } = setup(false, flows());
        rowOf(root, 'Gamma flow').click();
        expect(root.querySelector('.detail')!.textContent).toContain('does not use any connection reference');
    });
    it('opened rows stay open while the view is rebuilt, and close when the view changes', () => {
        const { root, store } = setup(false, flows());
        rowOf(root, 'Alpha flow').click();
        store.dispatch({ type: 'toggle', id: guid(11) });
        store.dispatch({ type: 'setFilter', filter: '' });
        expect(root.querySelectorAll('.detail-row')).toHaveLength(1);
        store.dispatch({ type: 'setView', view: 'references' });
        expect(root.querySelector('.detail-row')).toBeNull();
        expect(store.get().expanded).toEqual([]);
    });
    it('selecting a row with its check does not open it', () => {
        const { root, store } = setup(false, flows());
        (rowOf(root, 'Alpha flow').querySelector('.check') as HTMLElement).click();
        expect(store.get().selected).toEqual([guid(10)]);
        expect(root.querySelector('.detail-row')).toBeNull();
    });
    it('the search also looks at description, type and owner', () => {
        const { root, store } = setup(false, flows());
        for (const [term, name] of [['report', 'Alpha flow'], ['scheduled', 'Beta flow'], ['automated', 'Gamma flow']] as const) {
            store.dispatch({ type: 'setFilter', filter: term });
            expect([...root.querySelectorAll('tbody tr:not(.detail-row) td:nth-child(3)')].map(c => c.textContent!.split('\n')[0])).toEqual([name === 'Alpha flow' ? 'Alpha flowSends the report' : name]);
        }
    });
    it('the attention column appears only when something needs attention, and the panel counts how many', () => {
        const ok = setup(false, [mk(10, ['sample_ref1'], REQUEST, { name: 'Fine' })]);
        expect([...ok.root.querySelectorAll('th')].map(t => t.textContent)).not.toContain('Needs attention');
        const bad = setup(false, [mk(10, ['ghost'], REQUEST, { name: 'Bad' })]);
        expect([...bad.root.querySelectorAll('th')].map(t => t.textContent)).toContain('Needs attention');
        expect(bad.root.querySelector('.panel-sub')!.textContent).toContain('1 need attention');
        const chipText = [...bad.root.querySelectorAll('tbody tr td:last-child .chip')].map(c => c.textContent);
        expect(chipText).toEqual(['Missing reference']);
    });
    it('a reference without a connection shows a warning chip in the details, with its tooltip', () => {
        const sol = solution();
        const store = createStore(initialState());
        const root = document.createElement('div');
        mountMain(root, store, { selectSolution: vi.fn(), refresh: vi.fn(), previewConnection: vi.fn(), previewRepoint: vi.fn(), previewRemove: vi.fn(), previewDelete: vi.fn(), createReference: vi.fn(), openNewReference: vi.fn(), refreshConnections: vi.fn(), checkConnection: vi.fn(), cleanupRemove: vi.fn(), cleanupDelete: vi.fn(), startMerge: vi.fn(), checkDependencies: vi.fn(), setTypedCode: vi.fn(), setManageState: vi.fn(), confirm: vi.fn(), saveBackup: vi.fn(), saveReport: vi.fn() }, () => '');
        store.dispatch({ type: 'solutionsLoaded', solutions: [sol] });
        store.dispatch({ type: 'selectSolution', id: sol.id });
        const base = input({ solution: sol, flows: [mk(10, ['sample_ref1'], REQUEST, { name: 'Alpha flow' })] });
        store.dispatch({ type: 'snapshotLoaded', snapshot: buildSnapshot({ ...base, references: base.references.map(r => (r.id === guid(1) ? { ...r, connectionId: '' } : r)) }) });
        rowOf(root, 'Alpha flow').click();
        expect(root.querySelector('.detail tbody .chip--warning')!.textContent).toBe('No connection');
    });
});

describe('references table and its details', () => {
    function refs(patch: (id: string) => object = () => ({})) {
        const sol = solution();
        const store = createStore(initialState());
        const root = document.createElement('div');
        mountMain(root, store, { selectSolution: vi.fn(), refresh: vi.fn(), previewConnection: vi.fn(), previewRepoint: vi.fn(), previewRemove: vi.fn(), previewDelete: vi.fn(), createReference: vi.fn(), openNewReference: vi.fn(), refreshConnections: vi.fn(), checkConnection: vi.fn(), cleanupRemove: vi.fn(), cleanupDelete: vi.fn(), startMerge: vi.fn(), checkDependencies: vi.fn(), setTypedCode: vi.fn(), setManageState: vi.fn(), confirm: vi.fn(), saveBackup: vi.fn(), saveReport: vi.fn() }, () => '');
        store.dispatch({ type: 'solutionsLoaded', solutions: [sol] });
        store.dispatch({ type: 'selectSolution', id: sol.id });
        const base = input({ solution: sol, flows: [flow(10, ['sample_ref1', 'sample_ref2'], { name: 'Alpha flow' }), flow(11, ['sample_ref1'], { name: 'Beta flow' })] });
        store.dispatch({ type: 'snapshotLoaded', snapshot: buildSnapshot({ ...base, references: base.references.map(r => ({ ...r, ...patch(r.id) })) }) });
        store.dispatch({ type: 'setView', view: 'references' });
        return { root, store };
    }
    const row = (root: HTMLElement, text: string) => [...root.querySelectorAll('tbody tr:not(.detail-row)')].find(tr => tr.textContent!.includes(text)) as HTMLElement;

    it('has reference, connector, connection, owner and use, one row each', () => {
        const { root } = refs();
        expect([...root.querySelectorAll('th')].map(t => t.textContent)).toEqual(['', '', 'Reference', 'Connector', 'Connection', 'Reference owner', 'Used by']);
        const cells = [...row(root, 'Ref 1').querySelectorAll('td')].map(c => c.textContent);
        expect(cells.slice(2)).toEqual(['Ref 1sample_ref1', 'A', 'conn-1', 'Owner A', '2 flows']);
        expect(row(root, 'Ref 3').textContent).toContain('No flow');
    });
    it('marks a custom connector with a chip, only on that reference, and explains it in a tooltip', () => {
        const { root } = refs(id => (id === guid(1) ? { customConnectorId: guid(500) } : {}));
        const chips = [...root.querySelectorAll('tbody .connector-name .chip')];
        expect(chips.map(c => c.textContent)).toEqual(['Custom connector']);
        expect((chips[0] as HTMLElement).title).toContain('not a standard Microsoft connector');
    });
    it('the owner column says what it is', () => {
        const { root } = refs();
        const th = [...root.querySelectorAll('th')].find(h => h.textContent === 'Reference owner') as HTMLElement;
        expect(th.title).toContain('owner of the connection reference');
        expect(th.title).toContain('not the owner of the connection');
    });
    it('the details of a reference are key-value pairs and a table of the flows that use it', () => {
        const { root } = refs(id => (id === guid(1) ? { customConnectorId: guid(500) } : {}));
        row(root, 'Ref 1').click();
        const kv = Object.fromEntries([...root.querySelectorAll('.detail .kv-item')].map(i => [i.querySelector('dt')!.textContent, i.querySelector('dd')!.textContent]));
        expect(kv['Logical name']).toBe('sample_ref1');
        expect(kv['Connection ID']).toBe('conn-1');
        expect(kv['Reference ID']).toBe(guid(1));
        expect(kv['Connector ID']).toBe('/providers/Microsoft.PowerApps/apis/shared_a');
        expect(kv['Custom connector ID']).toBe(guid(500));
        expect(kv['Owner of the reference']).toBe('Owner A');
        const used = [...root.querySelectorAll('.detail-block')].find(b => b.querySelector('.detail-title')!.textContent === 'Used by')!;
        // :scope keeps the match inside the block (a plain selector also matches the table the block sits in)
        expect([...used.querySelectorAll(':scope tbody > tr')].map(t => t.querySelector('td')!.textContent)).toEqual(['Alpha flow', 'Beta flow']);
        expect(used.querySelector('.detail-head .chip')!.textContent).toBe('2');
    });
    it('an unused reference says so, and a reference with no custom connector shows a dash for it', () => {
        const { root } = refs();
        row(root, 'Ref 3').click();
        const detail = root.querySelector('.detail')!;
        expect(detail.textContent).toContain('No flow of this solution uses this reference.');
        const custom = [...detail.querySelectorAll('.kv-item')].find(i => i.querySelector('dt')!.textContent === 'Custom connector ID')!;
        expect(custom.querySelector('dd')!.textContent).toBe('-');
    });
});

describe('long values are shown in full and the layout adapts', () => {
    it('a long connection id and a long name are in the details unchanged', () => {
        const longId = 'shared-commondataserviceforapps-0123456789abcdef-0123456789abcdef-0123456789abcdef';
        const longName = 'A reference with a very long display name that used to be cut off in the table';
        const sol = solution();
        const store = createStore(initialState());
        const root = document.createElement('div');
        mountMain(root, store, { selectSolution: vi.fn(), refresh: vi.fn(), previewConnection: vi.fn(), previewRepoint: vi.fn(), previewRemove: vi.fn(), previewDelete: vi.fn(), createReference: vi.fn(), openNewReference: vi.fn(), refreshConnections: vi.fn(), checkConnection: vi.fn(), cleanupRemove: vi.fn(), cleanupDelete: vi.fn(), startMerge: vi.fn(), checkDependencies: vi.fn(), setTypedCode: vi.fn(), setManageState: vi.fn(), confirm: vi.fn(), saveBackup: vi.fn(), saveReport: vi.fn() }, () => '');
        store.dispatch({ type: 'solutionsLoaded', solutions: [sol] });
        store.dispatch({ type: 'selectSolution', id: sol.id });
        const base = input({ solution: sol, flows: [flow(10, ['sample_ref1'], { name: 'F1' })] });
        store.dispatch({ type: 'snapshotLoaded', snapshot: buildSnapshot({ ...base, references: base.references.map(r => (r.id === guid(1) ? { ...r, connectionId: longId, displayName: longName } : r)) }) });
        (root.querySelector('tbody tr:not(.detail-row)') as HTMLElement).click();
        expect(root.querySelector('.detail tbody .conn-id')!.textContent).toBe(longId);
        expect(root.querySelector('.detail tbody .conn-name')!.textContent).toBe(longName);
    });
    it('the tool stylesheet truncates nothing and hides columns step by step on narrow panes', () => {
        const css = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');
        expect(css).not.toMatch(/text-overflow:\s*ellipsis/);
        expect([...css.matchAll(/([^{}]+)\{[^}]*white-space:\s*nowrap/g)].map(m => m[1]!.trim())).toEqual(['.cell-time']); // only the short time text never wraps
        expect((css.match(/@media \(max-width:/g) ?? []).length).toBeGreaterThanOrEqual(3);
    });
    it('the kit makes grids wrap and tightens panels on narrow panes', () => {
        const kit = readFileSync(resolve(process.cwd(), 'src/ui/ui.css'), 'utf8');
        expect(kit).toMatch(/\.kv \{[^}]*auto-fit/);
        expect(kit).toMatch(/@media \(max-width: 700px\)[^}]*\.main-content/s);
    });
});

describe('the view keeps its place when it is rebuilt', () => {
    it('the scroll position of the page and of the table survives a change', () => {
        const tops = new WeakMap<Element, number>();
        Object.defineProperty(HTMLElement.prototype, 'scrollTop', { configurable: true, get() { return tops.get(this) ?? 0; }, set(v: number) { tops.set(this, v); } });
        try {
            document.body.innerHTML = '<main class="main-content"><div id="content"></div></main>';
            const sol = solution();
            const store = createStore(initialState());
            const root = document.getElementById('content')!;
            mountMain(root, store, { selectSolution: vi.fn(), refresh: vi.fn(), previewConnection: vi.fn(), previewRepoint: vi.fn(), previewRemove: vi.fn(), previewDelete: vi.fn(), createReference: vi.fn(), openNewReference: vi.fn(), refreshConnections: vi.fn(), checkConnection: vi.fn(), cleanupRemove: vi.fn(), cleanupDelete: vi.fn(), startMerge: vi.fn(), checkDependencies: vi.fn(), setTypedCode: vi.fn(), setManageState: vi.fn(), confirm: vi.fn(), saveBackup: vi.fn(), saveReport: vi.fn() }, () => '');
            store.dispatch({ type: 'solutionsLoaded', solutions: [sol] });
            store.dispatch({ type: 'selectSolution', id: sol.id });
            store.dispatch({ type: 'snapshotLoaded', snapshot: buildSnapshot(input({ solution: sol })) });
            const page = document.querySelector('.main-content') as HTMLElement;
            page.scrollTop = 340;
            (root.querySelector('.table-wrap') as HTMLElement).scrollTop = 120;
            store.dispatch({ type: 'toggle', id: guid(10) });
            expect(page.scrollTop).toBe(340);
            expect((root.querySelector('.table-wrap') as HTMLElement).scrollTop).toBe(120);
        } finally {
            delete (HTMLElement.prototype as unknown as Record<string, unknown>)['scrollTop'];
        }
    });
});

describe('scroll when the page changes', () => {
    it('a different page (the other view, a step, another solution) opens at the top; the same page keeps its place', () => {
        const tops = new WeakMap<Element, number>();
        Object.defineProperty(HTMLElement.prototype, 'scrollTop', { configurable: true, get() { return tops.get(this) ?? 0; }, set(v: number) { tops.set(this, v); } });
        try {
            document.body.innerHTML = '<main class="main-content"><div id="content"></div></main>';
            const sol = solution();
            const store = createStore(initialState());
            const root = document.getElementById('content')!;
            mountMain(root, store, { selectSolution: vi.fn(), refresh: vi.fn(), previewConnection: vi.fn(), previewRepoint: vi.fn(), previewRemove: vi.fn(), previewDelete: vi.fn(), createReference: vi.fn(), openNewReference: vi.fn(), refreshConnections: vi.fn(), checkConnection: vi.fn(), cleanupRemove: vi.fn(), cleanupDelete: vi.fn(), startMerge: vi.fn(), checkDependencies: vi.fn(), setTypedCode: vi.fn(), setManageState: vi.fn(), confirm: vi.fn(), saveBackup: vi.fn(), saveReport: vi.fn() }, () => '');
            store.dispatch({ type: 'solutionsLoaded', solutions: [sol] });
            store.dispatch({ type: 'selectSolution', id: sol.id });
            store.dispatch({ type: 'snapshotLoaded', snapshot: buildSnapshot(input({ solution: sol })) });
            const page = () => document.querySelector('.main-content') as HTMLElement;
            const wrap = () => root.querySelector('.table-wrap') as HTMLElement;
            page().scrollTop = 200;
            wrap().scrollTop = 90;
            store.dispatch({ type: 'toggle', id: guid(10) }); // the same page
            expect([page().scrollTop, wrap().scrollTop]).toEqual([200, 90]);
            store.dispatch({ type: 'setView', view: 'references' }); // another page
            expect([page().scrollTop, wrap().scrollTop]).toEqual([0, 0]);
            wrap().scrollTop = 60;
            store.dispatch({ type: 'selectAll', ids: [guid(1)] });
            store.dispatch({ type: 'openPlan', plan: planConnectionChange(store.get().snapshot!, [guid(1)], 'conn-2') }); // a step
            const body = root.querySelector('.step-body') as HTMLElement;
            body.scrollTop = 33;
            store.dispatch({ type: 'toggleItem', id: 'x' });
            expect((root.querySelector('.step-body') as HTMLElement).scrollTop).toBe(33);
            store.dispatch({ type: 'setTab', tab: 'table' }); // another tab of the step
            expect((root.querySelector('.step-body') as HTMLElement).scrollTop).toBe(0);
        } finally {
            delete (HTMLElement.prototype as unknown as Record<string, unknown>)['scrollTop'];
        }
    });
});

describe('stable layout (constitution VII)', () => {
    // options are content (a select gets more of them), everything else is structure
    const shape = (root: HTMLElement) => [...root.querySelectorAll('.action-strip *, .toolbar *')].filter(e => e.tagName !== 'OPTION' && !e.closest('.source-list')).map(e => `${e.tagName}.${e.className.replace(/ is-idle/g, '')}`).join('|'); // is-idle only hides an element that stays in place

    it('selecting rows changes the text of the count, never the structure or the classes around it', () => {
        const { root, store } = setup();
        const before = shape(root);
        store.dispatch({ type: 'toggle', id: guid(10) });
        store.dispatch({ type: 'toggle', id: guid(11) });
        expect(root.querySelector('.action-count')!.textContent).toBe('2 selected');
        // the selects get options and the button gets enabled, but no element appears or disappears
        expect(shape(root)).toBe(before);
    });
    it('the count keeps the same element and class for 0, 1 and many', () => {
        const { root, store } = setup();
        const classes = new Set<string>();
        for (const ids of [[], [guid(10)], [guid(10), guid(11)]]) {
            store.dispatch({ type: 'selectAll', ids });
            classes.add(root.querySelector('.action-count')!.className);
        }
        expect([...classes]).toEqual(['action-count']);
    });
    it('the status text is always in the page and only hidden when idle, so nothing next to it moves', () => {
        const { root, store } = setup();
        const slot = () => root.querySelector('.status-slot') as HTMLElement;
        expect(slot().className).toBe('status-slot is-idle');
        const idleShape = shape(root);
        store.dispatch({ type: 'busy', busy: true });
        expect(slot().className).toBe('status-slot');
        expect(slot().textContent).toBe('Updating...');
        expect(shape(root).replace(/ is-idle/g, '')).toBe(idleShape.replace(/ is-idle/g, ''));
    });
    it('the same for the list of solutions', () => {
        document.body.innerHTML = '';
        const store = createStore(initialState());
        const root = document.createElement('div');
        mountMain(root, store, { selectSolution: vi.fn(), refresh: vi.fn(), previewConnection: vi.fn(), previewRepoint: vi.fn(), previewRemove: vi.fn(), previewDelete: vi.fn(), createReference: vi.fn(), openNewReference: vi.fn(), refreshConnections: vi.fn(), checkConnection: vi.fn(), cleanupRemove: vi.fn(), cleanupDelete: vi.fn(), startMerge: vi.fn(), checkDependencies: vi.fn(), setTypedCode: vi.fn(), setManageState: vi.fn(), confirm: vi.fn(), saveBackup: vi.fn(), saveReport: vi.fn() }, () => '');
        const idle = root.querySelectorAll('.toolbar > *').length;
        store.dispatch({ type: 'busy', busy: true });
        expect(root.querySelectorAll('.toolbar > *').length).toBe(idle);
    });
    it('the stylesheets give selects, inputs and the count a fixed size', () => {
        const kit = readFileSync(resolve(process.cwd(), 'src/ui/ui.css'), 'utf8');
        expect(kit).toMatch(/\.select \{[^}]*\bwidth: \d+px/);
        expect(kit).toMatch(/\.field \.text-input \{[^}]*\bwidth: \d+px/);
        expect(kit).toMatch(/\.toolbar > \.text-input \{[^}]*\bwidth: \d+px/);
        expect(kit).toMatch(/\.action-count \{[^}]*\bmin-width: \d+ch/);
    });
    it('no browser suggestion list is used', () => {
        const { root, store } = setup();
        store.dispatch({ type: 'setView', view: 'references' });
        store.dispatch({ type: 'toggle', id: guid(1) });
        expect(root.querySelector('datalist')).toBeNull();
        expect(root.querySelector('input[list]')).toBeNull();
        expect(readFileSync(resolve(process.cwd(), 'src/views/main.ts'), 'utf8')).not.toMatch(/datalist|setAttribute\('list'/);
    });
});

describe('change the connection: pick or paste', () => {
    function refsView() {
        const r = setup();
        r.store.dispatch({ type: 'setView', view: 'references' });
        return r;
    }
    const studio = (root: HTMLElement) => button(root, 'Choose changes').click();
    const choices = (root: HTMLElement) => [...root.querySelectorAll('.choice')].map(c => c.getAttribute('aria-label'));
    const typed = (root: HTMLElement) => root.querySelector('input[aria-label="Or paste a connection id"]') as HTMLInputElement;

    it('is closed until a reference is selected, then lists the connections of the same connector, named by their references', () => {
        const { root, store } = refsView();
        expect((button(root, 'Choose changes') as HTMLButtonElement).disabled).toBe(true);
        store.dispatch({ type: 'toggle', id: guid(1) });
        studio(root);
        // ref 3 has another connector, so conn-3 is not offered for ref 1
        expect(choices(root)).toEqual(['Use conn-1', 'Use conn-2']);
        expect(root.querySelector('.choice')!.textContent).toContain('Ref 1');
    });
    it('choosing a connection sets it and leaves the text field empty', () => {
        const { root, store } = refsView();
        store.dispatch({ type: 'toggle', id: guid(1) });
        studio(root);
        (root.querySelector('.choice[aria-label="Use conn-2"]') as HTMLElement).click();
        expect(store.get().newConnectionId).toBe('conn-2');
        expect(root.querySelector('.choice[aria-label="Use conn-2"]')!.getAttribute('aria-checked')).toBe('true');
        expect(typed(root).value).toBe('');
    });
    it('a pasted id is trimmed, kept, and no listed connection stays chosen', () => {
        const { root, store } = refsView();
        store.dispatch({ type: 'toggle', id: guid(1) });
        studio(root);
        typed(root).value = '  my-own-id  ';
        typed(root).dispatchEvent(new Event('input'));
        expect(store.get().newConnectionId).toBe('my-own-id');
        expect(typed(root).value).toBe('my-own-id');
        expect([...root.querySelectorAll('.choice')].every(c => c.getAttribute('aria-checked') === 'false')).toBe(true);
    });
});

describe('typing does not lose the field', () => {
    it('the filter keeps focus, value and caret while the view is rebuilt on every key', () => {
        const { root, store } = setup();
        const filter = () => root.querySelector('input[aria-label="Filter..."]') as HTMLInputElement;
        filter().focus();
        filter().value = 'flo';
        filter().setSelectionRange(2, 2);
        filter().dispatchEvent(new Event('input'));
        expect(store.get().filter).toBe('flo');
        expect(document.activeElement).toBe(filter());
        expect(filter().value).toBe('flo');
        expect(filter().selectionStart).toBe(2);
    });
    it('the pasted connection id keeps focus too', () => {
        const { root, store } = setup();
        store.dispatch({ type: 'setView', view: 'references' });
        store.dispatch({ type: 'toggle', id: guid(1) });
        button(root, 'Choose changes').click();
        const box = () => root.querySelector('input[aria-label="Or paste a connection id"]') as HTMLInputElement;
        box().focus();
        box().value = 'abc';
        box().dispatchEvent(new Event('input'));
        expect(document.activeElement).toBe(box());
    });
});

describe('icons', () => {
    const REQUEST = { manual: { type: 'Request', kind: 'Button' } };
    const RECURRENCE = { Recurrence: { type: 'Recurrence' } };
    const EVENT = { t: { type: 'OpenApiConnectionNotification', inputs: { host: { operationId: 'OnNew' } } } };
    const mk = (n: number, triggers: Record<string, unknown>, over = {}) => flow(n, ['sample_ref1'], { clientData: clientData(['sample_ref1'], {}, triggers), name: `F${n}`, ...over });
    const kit = readFileSync(resolve(process.cwd(), 'src/ui/ui.css'), 'utf8');
    const used = (root: HTMLElement) => new Set([...root.querySelectorAll('.icon')].flatMap(i => [...i.classList].filter(c => c.startsWith('icon-') && !c.startsWith('icon--') && c !== 'icon-btn')));
    const rows = () => [mk(10, REQUEST, { stateCode: 1 }), mk(11, RECURRENCE, { stateCode: 2 }), mk(12, EVENT), mk(13, {})];
    const chipIcon = (root: HTMLElement, label: string) => [...root.querySelectorAll('.chip')].find(c => c.textContent === label)!.querySelector('.icon')!.className;

    it('each flow type has its own icon in its chip: pointer, bolt, clock, info', () => {
        const { root } = setup(false, rows());
        expect(chipIcon(root, 'Instant')).toContain('icon-pointer');
        expect(chipIcon(root, 'Scheduled')).toContain('icon-clock');
        expect(chipIcon(root, 'Automated')).toContain('icon-zap');
        expect(chipIcon(root, 'Unknown')).toContain('icon-info');
    });
    it('each state has an icon and a tone: on is a green power, off a grey power, suspended an amber pause', () => {
        const { root } = setup(false, rows());
        const tr = (label: string) => [...root.querySelectorAll('.chip')].find(c => c.textContent === label)!;
        expect([tr('On').className, tr('On').querySelector('.icon')!.className]).toEqual(['chip chip--success', expect.stringContaining('icon-power')]);
        expect(tr('Off').className).toBe('chip');
        expect(tr('Suspended').className).toBe('chip chip--warning');
        expect(tr('Suspended').querySelector('.icon')!.className).toContain('icon-pause');
    });
    it('the labels of the details carry an icon, and the text of each label is unchanged', () => {
        const { root } = setup(false, rows());
        (root.querySelector('tbody tr:not(.detail-row)') as HTMLElement).click();
        const dts = [...root.querySelectorAll('.detail .kv-item dt')];
        expect(dts.map(d => d.textContent)).toEqual(['Type', 'State', 'Trigger', 'Actions', 'Owner', 'Created', 'Modified', 'Flow ID', 'Description']);
        expect(dts.every(d => d.querySelector('.icon') !== null)).toBe(true);
        expect([...root.querySelectorAll('.detail .detail-title')].every(t => t.querySelector('.icon') !== null)).toBe(true);
    });
    it('connector tiles take the tone of their kind of service', () => {
        const { root } = setup(false, [mk(10, REQUEST)]);
        expect(root.querySelector('.tile-row .conn-tile')!.className).toContain('conn-tile--muted'); // the fixture connector is unknown
        const sol = solution();
        const store = createStore(initialState());
        const r2 = document.createElement('div');
        mountMain(r2, store, { selectSolution: vi.fn(), refresh: vi.fn(), previewConnection: vi.fn(), previewRepoint: vi.fn(), previewRemove: vi.fn(), previewDelete: vi.fn(), createReference: vi.fn(), openNewReference: vi.fn(), refreshConnections: vi.fn(), checkConnection: vi.fn(), cleanupRemove: vi.fn(), cleanupDelete: vi.fn(), startMerge: vi.fn(), checkDependencies: vi.fn(), setTypedCode: vi.fn(), setManageState: vi.fn(), confirm: vi.fn(), saveBackup: vi.fn(), saveReport: vi.fn() }, () => '');
        store.dispatch({ type: 'solutionsLoaded', solutions: [sol] });
        store.dispatch({ type: 'selectSolution', id: sol.id });
        const base = input({ solution: sol, flows: [mk(10, REQUEST)] });
        const dataverse = '/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps';
        store.dispatch({ type: 'snapshotLoaded', snapshot: buildSnapshot({ ...base, references: base.references.map(r => (r.id === guid(1) ? { ...r, connectorId: dataverse } : r)) }) });
        expect(r2.querySelector('.tile-row .conn-tile')!.className).toContain('conn-tile--primary');
        expect(r2.querySelector('.tile-row .conn-tile .icon-database')).not.toBeNull();
    });
    it('chips of warnings and of ids carry an icon: no connection, attention, connection id', () => {
        const { root } = setup(false, [flow(10, ['ghost'], { name: 'Bad', clientData: clientData(['ghost'], {}, REQUEST) })]);
        expect(chipIcon(root, 'Missing reference')).toContain('icon-alert-triangle');
        (root.querySelector('tbody tr:not(.detail-row)') as HTMLElement).click();
        expect(chipIcon(root, 'Missing')).toContain('icon-x-circle');
    });
    it('the action blocks, the buttons and the hero have icons', () => {
        const { root, store } = setup(false, rows());
        expect(root.querySelector('.action-title .icon-git-branch')).not.toBeNull();
        expect(root.querySelector('.action-strip .btn .icon-sliders')).not.toBeNull();
        store.dispatch({ type: 'setView', view: 'references' });
        expect(root.querySelector('.action-title .icon-link')).not.toBeNull();
        expect([...root.querySelectorAll('.segment .icon')].map(i => i.className)).toEqual([expect.stringContaining('icon-workflow'), expect.stringContaining('icon-plug')]);
    });
    it('the confirmation and the result use icons: link badge, arrow, check, save; done, failed, skipped chips', () => {
        const { root, store } = setup(false, rows());
        store.dispatch({ type: 'setView', view: 'references' });
        store.dispatch({ type: 'toggle', id: guid(1) });
        openConfirm(store, planConnectionChange(store.get().snapshot!, [guid(1), guid(2)], 'conn-2'));
        expect(root.querySelector('.modal-badge .icon-link')).not.toBeNull();
        store.dispatch({ type: 'setTab', tab: 'table' });
        expect(root.querySelector('.change-arrow')).not.toBeNull();
        expect(root.querySelector('.modal .btn--danger .icon-check')).not.toBeNull();
        expect(root.querySelector('.modal .btn .icon-save')).not.toBeNull();
        store.dispatch({ type: 'setAck', on: true });
        store.dispatch({ type: 'applyStarted', now: 1000, total: 3 });
        store.dispatch({ type: 'applied', results: [{ id: 'a', label: 'A', status: 'done', message: '' }, { id: 'b', label: 'B', status: 'failed', message: 'x' }, { id: 'c', label: 'C', status: 'skipped', message: 'y' }], now: 2000 });
        expect(['done', 'failed', 'skipped'].map(l => chipIcon(root, l).replace(/.*(icon-[a-z-]+)$/, '$1'))).toEqual(['icon-check-circle', 'icon-x-circle', 'icon-alert-triangle']);
    });
    it('empty states have an icon that fits why they are empty', () => {
        const { root, store } = setup(false, rows());
        store.dispatch({ type: 'setFilter', filter: 'zzz' });
        expect(root.querySelector('.empty-state .icon-search')).not.toBeNull();
        const none = setup(false, []);
        expect(none.root.querySelector('.empty-state .icon-workflow')).not.toBeNull();
    });
    it('every icon drawn anywhere on the screens exists in the kit and is drawn with a token colour, never a hex', () => {
        const { root, store } = setup(false, rows());
        const seen = used(root);
        (root.querySelector('tbody tr:not(.detail-row)') as HTMLElement).click();
        used(root).forEach(i => seen.add(i));
        store.dispatch({ type: 'setView', view: 'references' });
        (root.querySelector('tbody tr:not(.detail-row)') as HTMLElement).click();
        used(root).forEach(i => seen.add(i));
        expect(seen.size).toBeGreaterThan(15);
        for (const name of seen) expect(kit, name).toMatch(new RegExp(`\\.${name} \\{[^}]*mask-image`));
    });
});

describe('re-point: only compatible choices (defect reported in a hand test)', () => {
    const B = '/providers/Microsoft.PowerApps/apis/shared_b';
    const refs = [ref(1), ref(2), ref(3, { connectorId: B }), ref(4, { connectorId: B })];
    const noop = () => ({ selectSolution: vi.fn(), refresh: vi.fn(), previewConnection: vi.fn(), previewRepoint: vi.fn(), previewRemove: vi.fn(), previewDelete: vi.fn(), createReference: vi.fn(), openNewReference: vi.fn(), refreshConnections: vi.fn(), checkConnection: vi.fn(), cleanupRemove: vi.fn(), cleanupDelete: vi.fn(), startMerge: vi.fn(), checkDependencies: vi.fn(), setTypedCode: vi.fn(), setManageState: vi.fn(), confirm: vi.fn(), saveBackup: vi.fn(), saveReport: vi.fn() });
    function view(extraFlows = [flow(10, ['sample_ref1'], { name: 'F10' }), flow(11, ['sample_ref3'], { name: 'F11' })], references = refs) {
        const sol = solution();
        const store = createStore(initialState());
        const root = document.createElement('div');
        mountMain(root, store, noop(), () => '');
        store.dispatch({ type: 'solutionsLoaded', solutions: [sol] });
        store.dispatch({ type: 'selectSolution', id: sol.id });
        store.dispatch({ type: 'snapshotLoaded', snapshot: buildSnapshot(input({ solution: sol, references, memberReferenceIds: references.map(r => r.id), flows: extraFlows })) });
        return { root, store };
    }
    const byLabel = (root: HTMLElement, label: string) => [...root.querySelectorAll('[aria-label]')].find(e => e.getAttribute('aria-label') === label) as HTMLButtonElement;
    const choices = (root: HTMLElement) => [...root.querySelectorAll('.choice')].map(c => c.getAttribute('aria-label'));
    const studio = (root: HTMLElement) => button(root, 'Choose changes').click();
    const review = (root: HTMLElement) => button(root, 'Review changes') as HTMLButtonElement;

    it('the new reference stays closed until a reference to replace is chosen, even with flows selected', () => {
        const { root, store } = view();
        store.dispatch({ type: 'toggle', id: guid(10) });
        studio(root);
        expect(choices(root)).toEqual([]);
        expect(root.querySelector('.studio-pane--to')!.textContent).toContain('Tick the references to replace first');
    });
    it('after choosing the reference to replace, only the other references of the same connector are offered', () => {
        const { root, store } = view();
        store.dispatch({ type: 'toggle', id: guid(10) });
        studio(root);
        byLabel(root, 'Replace Ref 1').click();
        expect(choices(root)).toEqual(['Use Ref 2']);
    });
    it('the connector of the other kind is never offered, whichever reference is replaced', () => {
        const { root, store } = view();
        store.dispatch({ type: 'selectAll', ids: [guid(10), guid(11)] });
        studio(root);
        byLabel(root, 'Replace Ref 1').click();
        expect(choices(root)).toEqual(['Use Ref 2']);
        store.dispatch({ type: 'studioGo', step: 1 });
        byLabel(root, 'Replace Ref 3').click();
        expect(choices(root)).toEqual(['Use Ref 4']);
    });
    it('the choices of one category do not touch another: moving on keeps the first and the second is its own', () => {
        const { root, store } = view();
        store.dispatch({ type: 'selectAll', ids: [guid(10), guid(11)] });
        studio(root);
        byLabel(root, 'Replace Ref 1').click();
        byLabel(root, 'Use Ref 2').click();
        expect(targetOf(store.get())).toBe('sample_ref2');
        store.dispatch({ type: 'studioGo', step: 1 });
        byLabel(root, 'Replace Ref 3').click();
        expect(store.get().repointGroups.map(g => [g.from, g.target])).toEqual([[['sample_ref1'], 'sample_ref2'], [['sample_ref3'], '']]);
    });
    it('Review changes needs both choices', () => {
        const { root, store } = view();
        store.dispatch({ type: 'toggle', id: guid(10) });
        studio(root);
        expect(review(root).disabled).toBe(true);
        byLabel(root, 'Replace Ref 1').click();
        expect(review(root).disabled).toBe(true);
        byLabel(root, 'Use Ref 2').click();
        expect(review(root).disabled).toBe(false);
    });
    it('says so when there is no other reference of that connector in the solution', () => {
        const { root, store } = view([flow(10, ['sample_ref1'])], [ref(1), ref(3, { connectorId: B })]);
        store.dispatch({ type: 'toggle', id: guid(10) });
        studio(root);
        byLabel(root, 'Replace Ref 1').click();
        expect(choices(root)).toEqual([]);
        expect(root.querySelector('.studio-pane--to')!.textContent).toContain('no other reference of this connector in this solution');
    });
    it('each reference to replace says how many of the selected flows use it', () => {
        const { root, store } = view([flow(10, ['sample_ref1'], { name: 'F10' }), flow(11, ['sample_ref1', 'sample_ref3'], { name: 'F11' })]);
        store.dispatch({ type: 'selectAll', ids: [guid(10), guid(11)] });
        studio(root);
        const rows = () => [...root.querySelectorAll('.studio-panel .source-row')].map(r => [r.querySelector('.source-name')!.textContent, r.querySelector('.source-use')!.textContent]);
        expect(rows()).toEqual([['Ref 1', '2 of 2 flows']]);
        store.dispatch({ type: 'studioGo', step: 1 });
        expect(rows()).toEqual([['Ref 3', '1 of 2 flows']]);
    });
    it('a selection of references of different connectors offers no connection and says why', () => {
        const { root, store } = view();
        store.dispatch({ type: 'setView', view: 'references' });
        store.dispatch({ type: 'selectAll', ids: [guid(1), guid(3)] });
        studio(root);
        expect(choices(root)).toEqual([]);
        expect((root.querySelector('input[aria-label="Or paste a connection id"]') as HTMLInputElement).disabled).toBe(true);
        expect(root.querySelector('.studio-pane--to')!.textContent).toContain('different connectors');
        expect(review(root).disabled).toBe(true);
    });
});
