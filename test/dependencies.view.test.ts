// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { clientData, flow, guid, ref, USER } from './helpers/fixtures';
import { app, buttonByText, q, qa, REQUEST, settle } from './helpers/scenario';

/** Feature 023: what depends on a reference in the whole environment, shown where it is needed. Synthetic data only. */

type App = Awaited<ReturnType<typeof app>>;
const SALES = guid(901);
const OUT_FLOW = guid(80);
const AGENT = guid(81);
const APP_OUT = guid(82);
const flowOf = (n: number, names: string[]) => flow(n, names, { name: `Flow ${n}`, clientData: clientData(names, {}, REQUEST) });

/** The names the environment gives for the components that are outside the open solution. */
const answer = (q: string): Record<string, unknown>[] | undefined => {
    if (q.startsWith('solutioncomponentdefinitions?')) return [{ solutioncomponenttype: 10110, name: 'Agent', primaryentityname: 'bot' }];
    if (q.startsWith('workflows?$select=workflowid,name,statecode,category')) return [{ workflowid: guid(10), name: 'Alpha flow', statecode: 1, category: 5, ismanaged: false, _ownerid_value: USER }, { workflowid: OUT_FLOW, name: 'Order sync', statecode: 1, category: 5, ismanaged: false, _ownerid_value: USER }];
    if (q.startsWith('bots?$select=botid,name,statecode,ismanaged,_ownerid_value&$filter=_providerconnectionreferenceid_value')) return [];
    if (q.startsWith('bots?$select=botid,name,statecode,ismanaged,_ownerid_value')) return [{ botid: AGENT, name: 'Help desk', ismanaged: false, _ownerid_value: USER }];
    if (q.startsWith('canvasapps?')) return [{ canvasappid: APP_OUT, displayname: 'Orders app' }];
    if (q.startsWith('solutioncomponents?$select=objectid,_solutionid_value&$filter=')) return [{ objectid: OUT_FLOW, _solutionid_value: SALES }, { objectid: APP_OUT, _solutionid_value: SALES }];
    if (q.startsWith('solutions?$select=solutionid,friendlyname,uniquename&$filter=solutionid eq')) return [{ solutionid: SALES, friendlyname: 'Sales', uniquename: 'sales' }];
    return undefined;
};
/** ref1: a flow of the solution, a flow of Sales and an agent. ref2: an app of Sales. ref3: nothing. */
const world = (over: Parameters<typeof app>[0] = {}): Parameters<typeof app>[0] => ({
    answer,
    dependents: {
        [guid(1)]: [{ id: guid(10), type: 29 }, { id: OUT_FLOW, type: 29 }, { id: AGENT, type: 10110 }],
        [guid(2)]: [{ id: APP_OUT, type: 300 }],
    },
    blockers: { [guid(2)]: [{ id: APP_OUT, type: 300 }] },
    ...over,
});
const inReferences = async (over: Parameters<typeof app>[0] = {}): Promise<App> => {
    const a = await app(world(over));
    a.store.dispatch({ type: 'setView', view: 'references' });
    return a;
};
const byLabel = (root: ParentNode, label: string) => qa(root, '[aria-label]').find(e => e.getAttribute('aria-label') === label) as HTMLButtonElement;
const block = (root: ParentNode) => q(root, '.dep-block')!;
const go = async (a: App) => {
    await a.controller.idle();
    await settle();
};

describe('the details of a reference', () => {
    const detail = (a: App, id: string) => { a.store.dispatch({ type: 'toggleExpand', id }); return q(a.root, '.detail')!; };
    it('has a Dependencies block in the whole environment that reads nothing until the button is pressed', async () => {
        const a = await inReferences();
        const d = detail(a, guid(1));
        const title = qa(d, '.detail-title').find(t => t.textContent!.includes('Dependencies in the whole environment'))!;
        expect(title).toBeDefined();
        expect(byLabel(d, 'Check dependencies of Ref 1')).toBeDefined();
        expect(d.textContent).toContain('also outside this solution');
        expect(a.calls.dependentReads).toEqual([]);
    });
    it('opening a row reads the whole environment by itself, without pressing anything, and closing then opening again does not read again', async () => {
        const a = await inReferences();
        byLabel(a.root, 'Show details of Ref 1').click();
        await go(a);
        expect(q(block(a.root), '.dep-summary-text')!.textContent).toContain('3 components depend on it');
        byLabel(a.root, 'Hide details of Ref 1').click(); // closes
        byLabel(a.root, 'Show details of Ref 1').click(); // opens again
        await go(a);
        expect(a.calls.dependentReads.length).toBe(1);
    });
    it('a click on Used by opens the row and reads the whole environment at once, once', async () => {
        const a = await inReferences();
        byLabel(a.root, 'What uses Ref 1').click();
        await go(a);
        expect(a.store.get().expanded).toContain(guid(1));
        expect(q(block(a.root), '.dep-summary-text')!.textContent).toContain('3 components depend on it');
        byLabel(a.root, 'What uses Ref 1').click(); // already open and read: nothing is read again, the row stays open
        await go(a);
        expect(a.store.get().expanded).toContain(guid(1));
        expect(a.calls.dependentReads.length).toBe(1);
    });
    it('shows a wait while it reads, then every dependent grouped by kind, with what is outside this solution marked', async () => {
        let release!: () => void;
        const gate = new Promise<void>(r => { release = r; });
        const a = await inReferences({ beforeDependents: () => gate });
        detail(a, guid(1));
        byLabel(a.root, 'Check dependencies of Ref 1').click();
        await settle();
        expect(q(a.root, '.dep-loading .spinner')).not.toBeNull();
        expect(q(a.root, '.dep-loading')!.textContent).toContain('Reading what depends on it in the whole environment');
        release();
        await go(a);
        const b = block(a.root);
        expect(q(b, '.dep-summary-text')!.textContent).toBe('3 components depend on it: 1 in this solution, 2 outside.');
        expect(qa(b, '.dep-group-title').map(t => t.textContent!.replace(/\s+/g, ' ').trim())).toEqual(['Flows 2', 'Agents 1']);
        const rows = qa(b, '.dep-row');
        expect(rows.map(r => q(r, '.dep-name')!.textContent)).toEqual(['Order sync', 'Alpha flow', 'Help desk']); // outside the solution first
        expect(rows[0]!.classList.contains('is-outside')).toBe(true);
        expect(rows[0]!.textContent).toContain('Outside this solution');
        expect(rows[0]!.textContent).toContain('In solution: Sales');
        expect(rows[0]!.textContent).toContain('Cloud flow');
        expect(rows[0]!.textContent).toContain('On');
        expect(rows[1]!.textContent).toContain('In this solution');
        expect(rows[2]!.textContent).toContain('Agent');
        expect(b.textContent).toContain('Dataverse dependency tracking');
        expect(a.calls.dependentReads).toEqual([guid(1)]);
    });
    it('says that nothing depends on a reference nobody uses, anywhere', async () => {
        const a = await inReferences();
        detail(a, guid(3));
        byLabel(a.root, 'Check dependencies of Ref 3').click();
        await go(a);
        expect(q(block(a.root), '.dep-summary-text')!.textContent).toBe('Nothing depends on it anywhere in the environment.');
        expect(q(block(a.root), '.icon-check-circle')).not.toBeNull();
    });
    it('says why when the environment refuses, and a retry reads again', async () => {
        const a = await inReferences({ failDependents: 'The caller does not have the privilege.' });
        detail(a, guid(1));
        byLabel(a.root, 'Check dependencies of Ref 1').click();
        await go(a);
        expect(block(a.root).textContent).toContain('The dependencies could not be read: The caller does not have the privilege.');
        byLabel(a.root, 'Try again to check the dependencies of Ref 1').click();
        await go(a);
        expect(a.calls.dependentReads).toEqual([guid(1), guid(1)]);
    });
    it('is dropped when the solution is read again, so the screen never shows an old answer', async () => {
        const a = await inReferences();
        detail(a, guid(1));
        byLabel(a.root, 'Check dependencies of Ref 1').click();
        await go(a);
        expect(a.store.get().dependencies[guid(1)]!.status).toBe('ready');
        a.controller.refresh();
        await go(a);
        expect(a.store.get().dependencies).toEqual({});
        expect(byLabel(a.root, 'Check dependencies of Ref 1')).toBeDefined();
    });
    it('the Used by column says it is about this solution, and where to see the rest', async () => {
        const a = await inReferences();
        const cell = qa(a.root, 'tbody tr').find(r => r.textContent!.includes('Ref 3'))!.querySelector<HTMLElement>('td:last-child span, td:last-child')!;
        expect(qa(a.root, 'tbody [title]').some(e => e.title.includes('whole environment'))).toBe(true);
        expect(cell).not.toBeNull();
    });
});

describe('the Used by of a connection in the new-reference panel', () => {
    const openPanel = async (a: App) => {
        a.store.dispatch({ type: 'selectAll', ids: [guid(10), guid(11), guid(12)] });
        buttonByText(a.root, 'Choose changes...')!.click();
        byLabel(a.root, 'Replace Ref 1').click();
        buttonByText(a.root, 'New reference')!.click();
        await go(a);
        qa(a.root, '.conn-expander').find(b => b.getAttribute('aria-label') === 'Used by, connection conn-1')!.click();
    };
    it('gives each reference that holds the connection its own dependencies block, in any solution', async () => {
        const a = await app(world());
        await openPanel(a);
        const users = qa(a.root, '.conn-user').filter(u => !u.classList.contains('conn-user--total'));
        expect(users).toHaveLength(1);
        byLabel(a.root, 'Check dependencies of Ref 1').click();
        await go(a);
        expect(q(a.root, '.conn-users .dep-summary-text')!.textContent).toBe('3 components depend on it: 1 in this solution, 2 outside.');
    });
    it('Check every dependency of this connection reads all of its references and shows the total', async () => {
        const refs = [ref(1, { connectionId: 'conn-1' }), ref(2, { connectionId: 'conn-1' })];
        const a = await app(world({ references: refs, flows: [flowOf(10, ['sample_ref1']), flowOf(11, ['sample_ref1']), flowOf(12, ['sample_ref1'])], connections: [{ name: 'conn-1', connector: 'shared_a', displayName: 'one@example.test' }] }));
        await openPanel(a);
        expect(q(a.root, '.conn-user--total')!.textContent).toContain('Check every dependency of this connection');
        byLabel(a.root, 'Check every dependency of connection conn-1').click();
        await go(a);
        expect(a.calls.dependentReads.sort()).toEqual([guid(1), guid(2)]);
        // ref1: a flow of the solution, a flow of Sales, an agent; ref2: an app of Sales: four distinct components, three outside
        expect(q(a.root, '.conn-user--total')!.textContent).toContain('4 components depend on the references that hold this connection: 1 in this solution, 3 outside.');
    });
});

describe('Clean up checks the whole environment', () => {
    const open = async (a: App) => {
        qa(a.root, 'button').find(b => b.getAttribute('aria-label') === 'Clean up references')!.click();
        await settle();
    };
    const dialog = (a: App) => q(a.root, '.cleanup-dialog')!;
    /** The one button of the toolbar that reads the dependencies: Check..., Checking..., Check again. */
    const checkBtn = (a: App) => qa(dialog(a), '.cleanup-bar button').find(b => /^(Check|Checking)/.test(b.textContent!.trim())) as HTMLButtonElement;
    it('the unused references are checked on request: one has an app outside the solution, the other has nothing', async () => {
        const a = await inReferences();
        await open(a);
        expect(qa(dialog(a), '.cleanup-row').map(r => q(r, '.source-name')!.textContent)).toEqual(['Ref 2', 'Ref 3']);
        expect(a.calls.dependentReads).toEqual([]); // not read before the button
        expect(buttonByText(dialog(a), 'Select the ones nobody uses')!.disabled).toBe(true);
        checkBtn(a).click();
        await go(a);
        const chips = qa(dialog(a), '.cleanup-row').map(r => r.textContent);
        expect(chips[0]).toContain('Used by 1 outside this solution');
        expect(chips[1]).toContain('Nothing depends on it');
        expect(dialog(a).textContent).toContain('Checked 2: 1 still has dependents.');
        expect(a.calls.dependentReads.sort()).toEqual([guid(2), guid(3)]);
    });
    it('Select the ones nobody uses ticks only the reference with no dependent anywhere', async () => {
        const a = await inReferences();
        await open(a);
        checkBtn(a).click();
        await go(a);
        buttonByText(dialog(a), 'Select the ones nobody uses')!.click();
        expect(a.store.get().cleanup!.picked).toEqual([guid(3)]);
    });
    it('the verdict opens the list of what depends on a reference, under its row', async () => {
        const a = await inReferences();
        await open(a);
        checkBtn(a).click();
        await go(a);
        byLabel(a.root, 'Show what depends on Ref 2').click();
        const open2 = qa(dialog(a), '.cleanup-item')[0]!;
        expect(q(open2, '.cleanup-deps')!.textContent).toContain('Orders app');
        expect(q(open2, '.cleanup-deps')!.textContent).toContain('Canvas app');
        expect(q(open2, '.cleanup-deps')!.textContent).toContain('In solution: Sales');
        byLabel(a.root, 'Hide what depends on Ref 2').click();
        expect(q(dialog(a), '.cleanup-deps')).toBeNull();
    });
    it('says when nothing depends on any of them: they are safe', async () => {
        const a = await inReferences({ dependents: {}, blockers: {} });
        await open(a);
        checkBtn(a).click();
        await go(a);
        expect(dialog(a).textContent).toContain('Checked 2: nothing depends on them in any solution, agent or app.');
        expect(checkBtn(a).textContent).toContain('Check again (all)');
    });
    it('while it reads, the button that works shows its progress and every button of the dialog is disabled (the global rule)', async () => {
        let release!: () => void;
        const gate = new Promise<void>(r => { release = r; });
        const a = await inReferences({ beforeDependents: () => gate });
        await open(a);
        byLabel(a.root, 'Tick Ref 3').click();
        checkBtn(a).click();
        await settle();
        const buttons = qa(dialog(a), 'button') as HTMLButtonElement[];
        expect(buttons.length).toBeGreaterThan(6);
        expect(buttons.filter(b => !b.disabled).map(b => b.textContent!.trim() || b.getAttribute('aria-label'))).toEqual([]); // not one is left on
        expect(checkBtn(a).getAttribute('aria-busy')).toBe('true');
        expect(checkBtn(a).textContent).toContain('Checking...');
        expect(checkBtn(a).querySelector('.spinner')).not.toBeNull(); // the wait is in the button
        expect(a.root.classList.contains('is-running')).toBe(true);
        expect(qa(dialog(a), '.cleanup-row').some(r => r.textContent!.includes('Checking...'))).toBe(true);
        release();
        await go(a);
        // done: the buttons that are normally available are back
        expect(a.root.classList.contains('is-running')).toBe(false);
        expect(buttonByText(dialog(a), 'Close')!.disabled).toBe(false);
        expect(buttonByText(dialog(a), 'Select all')!.disabled).toBe(false);
        expect(checkBtn(a).disabled).toBe(false);
        expect(checkBtn(a).getAttribute('aria-busy')).toBe('false');
    });
    it('the list keeps its scroll position when a row is ticked, and another tab opens at the top', async () => {
        const a = await inReferences();
        await open(a);
        const content = () => q(dialog(a), '.cleanup-content')!;
        content().scrollTop = 180;
        byLabel(a.root, 'Tick Ref 3').click(); // a redraw
        expect(content().scrollTop).toBe(180);
        qa(dialog(a), '.segment').find(b => b.textContent!.startsWith('Duplicates'))!.click();
        expect(content().scrollTop).toBe(0);
    });
    it('with some references ticked the check reads only those, and the button says so', async () => {
        const a = await inReferences();
        await open(a);
        expect(checkBtn(a).textContent).toContain('Check dependencies (all 2)');
        byLabel(a.root, 'Tick Ref 3').click();
        expect(checkBtn(a).textContent).toContain('Check dependencies (1 ticked)');
        checkBtn(a).click();
        await go(a);
        expect(a.calls.dependentReads).toEqual([guid(3)]); // only the ticked one
        const rows = qa(dialog(a), '.cleanup-row');
        expect(rows[0]!.textContent).not.toContain('Nothing depends on it'); // Ref 2 was not checked
        expect(rows[1]!.textContent).toContain('Nothing depends on it');
        expect(dialog(a).textContent).toContain('Checked 1: nothing depends on it in any solution, agent or app.');
        expect(checkBtn(a).textContent).toContain('Check again (1)');
    });
    it('with nothing ticked it reads all of them', async () => {
        const a = await inReferences();
        await open(a);
        checkBtn(a).click();
        await go(a);
        expect(a.calls.dependentReads.sort()).toEqual([guid(2), guid(3)]);
    });
    it('the buttons are on one line: check, select the ones nobody uses, the count, Select all and Clear share one toolbar', async () => {
        const a = await inReferences();
        await open(a);
        const bar = q(dialog(a), '.cleanup-bar')!;
        const labels = qa(bar, 'button').map(b => b.textContent!.trim());
        expect(labels).toEqual([expect.stringContaining('Check dependencies'), 'Select the ones nobody uses', 'Select all', 'Clear']);
        expect(q(bar, '.cleanup-count')).not.toBeNull();
        expect(q(dialog(a), '.cleanup-check')).toBeNull(); // no second row of buttons
        expect(qa(dialog(a), 'button').filter(b => /^(Select all|Clear|Select the ones nobody uses)$/.test(b.textContent!.trim())).every(b => b.parentElement === bar)).toBe(true);
    });
    it('the summary is one line that can be closed, and comes back after a new check', async () => {
        const a = await inReferences();
        await open(a);
        expect(q(dialog(a), '.cleanup-summary')).toBeNull(); // nothing checked yet
        checkBtn(a).click();
        await go(a);
        expect(qa(dialog(a), '.cleanup-summary')).toHaveLength(1);
        expect(q(dialog(a), '.cleanup-summary')!.classList.contains('is-warn')).toBe(true);
        byLabel(a.root, 'Dismiss the summary').click();
        expect(q(dialog(a), '.cleanup-summary')).toBeNull();
        expect(a.store.get().cleanup!.summaryHidden).toBe(true);
        checkBtn(a).click(); // a new check
        await go(a);
        expect(qa(dialog(a), '.cleanup-summary')).toHaveLength(1);
    });
    it('Delete names what blocks it: the component, its kind and the solutions that hold it', async () => {
        const a = await inReferences();
        await open(a);
        byLabel(a.root, 'Tick Ref 2').click();
        buttonByText(dialog(a), 'Delete...')!.click();
        await go(a);
        const row = a.store.get().plan!.rows[0]!;
        expect(row.blocked).toBe('Other components depend on it (Orders app (Canvas app, in Sales)): it cannot be deleted.');
    });
    it('Delete falls back to the type when the names cannot be read', async () => {
        const a = await inReferences({ answer: q => (q.startsWith('canvasapps?') ? (() => { throw new Error('x'); })() : answer(q)) });
        await open(a);
        byLabel(a.root, 'Tick Ref 2').click();
        buttonByText(dialog(a), 'Delete...')!.click();
        await go(a);
        expect(a.store.get().plan!.rows[0]!.blocked).toMatch(/Other components depend on it \(.+\): it cannot be deleted\./);
    });
});

describe('the duplicates know what else uses each one', () => {
    it('after a check each member says what depends on it, so the keeper is chosen knowing it', async () => {
        const refs = [ref(1, { connectionId: 'dup' }), ref(2, { connectionId: 'dup' })];
        const a = await app(world({ references: refs, flows: [flowOf(10, ['sample_ref1']), flowOf(11, ['sample_ref2'])] }));
        a.store.dispatch({ type: 'setView', view: 'references' });
        qa(a.root, 'button').find(b => b.getAttribute('aria-label') === 'Clean up references')!.click();
        await settle();
        qa(a.root, '.segment').find(b => b.textContent!.startsWith('Duplicates'))!.click();
        byLabel(a.root, 'Check the dependencies of the references that share dup').click();
        await go(a);
        const members = qa(a.root, '.dup-members [role="radio"]');
        expect(members[0]!.textContent).toContain('Used by 2 outside this solution'); // ref1: the Sales flow and the agent
        expect(members[1]!.textContent).toContain('Used by 1 outside this solution'); // ref2: the Sales app
        expect(buttonByText(q(a.root, '.dup-card')!, 'Check again')).toBeDefined();
    });
});
