// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { guid } from './helpers/fixtures';
import { app, buttonByText, q, qa, settle, type ConnectionSeed, type ScenarioOptions } from './helpers/scenario';

/**
 * Feature 024: the Connections area end to end on a synthetic environment: the list, its figures and filters, the
 * dependencies of a row, Check all, the selection, and the proof that the area is read only while the deletion flag is off.
 */

const TYPE_QUERY = "solutioncomponentdefinitions?$select=solutioncomponenttype&$filter=primaryentityname eq 'connectionreference'";
const answer: ScenarioOptions['answer'] = query => (query.startsWith(TYPE_QUERY) ? [{ solutioncomponenttype: 10001 }] : undefined);

const SEEDS: ConnectionSeed[] = [
    { name: 'conn-1', displayName: 'one@example.test', status: 'connected' },
    { name: 'conn-2', displayName: 'two@example.test', status: 'error' },
    { name: 'conn-3', displayName: 'three@example.test', status: 'reconnect' },
    { name: 'conn-free', displayName: 'free@example.test', status: 'connected' },
    { name: 'conn-other', displayName: 'other@example.test', connector: 'shared_b', status: 'connected' },
    { name: 'conn-dead', displayName: 'dead@example.test', status: 'error' },
];

async function open(opts: ScenarioOptions = {}) {
    const a = await app({ answer, connectionRows: SEEDS.map(s => ({ ...s })), dependents: { [guid(1)]: [{ id: guid(10), type: 29 }] }, apps: [{ name: 'app-1', displayName: 'Orders app', connections: ['conn-2'] }], ...opts });
    await a.controller.connections!.open();
    await a.controller.idle();
    await settle();
    return a;
}
type A = Awaited<ReturnType<typeof open>>;

const rows = (a: A) => qa(a.root, '.cm-item');
const names = (a: A) => rows(a).map(r => q(r, '.conn-name')!.textContent);
/** The counts the filters carry (All, Broken, No dependency found, In use): the one place the numbers are shown. */
const figs = (a: A) => Object.fromEntries(qa(a.root, '.cm-toolbar > .segmented .segment').map(b => {
    const count = q(b, '.segment-count')!.textContent!;
    const label = b.textContent!.replace(count, '').trim();
    return [label === 'All' ? 'Connections' : label, count];
}));
const byLabel = (a: A, label: string) => qa(a.root, '[aria-label]').find(e => e.getAttribute('aria-label') === label) as HTMLButtonElement;
const filter = (a: A, text: string) => qa(a.root, '.cm-toolbar > .segmented .segment').find(b => b.textContent!.startsWith(text))!;
const openRow = async (a: A, label: string) => {
    byLabel(a, `Show details of ${label}`).click();
    await a.controller.idle();
    await settle();
};

describe('the list', () => {
    it('reads the connections when the area opens and shows every one with its connector, status and dependencies state', async () => {
        const a = await open();
        expect(names(a)).toEqual(['one@example.test', 'two@example.test', 'three@example.test', 'free@example.test', 'other@example.test', 'dead@example.test'].sort());
        const by = (n: string) => rows(a).find(r => q(r, '.conn-name')!.textContent === n)!;
        expect(q(by('two@example.test'), '.chip')!.textContent).toContain('Error');
        expect(by('three@example.test').textContent).toContain('Needs reconnect');
        expect(by('one@example.test').textContent).toContain('Connected');
        expect(by('one@example.test').textContent).toContain('Not checked');
    });
    it('shows the figures: total, broken, no dependency found (of the checked ones), in use', async () => {
        const a = await open();
        expect(figs(a)).toMatchObject({ Connections: '6', Broken: '3', 'No dependency found': '0', 'In use': '0' });
    });
    it('says each number once, in the filters, with no header and no row of figures to take the room', async () => {
        const a = await open();
        expect(a.root.querySelector('.hero')).toBeNull();
        expect(qa(a.root, '.fig')).toHaveLength(0);
        expect(figs(a)).toMatchObject({ Connections: '6', Broken: '3' });
    });
    it('says that these are the connections the user can see, and that no dependency found is not unused', async () => {
        const a = await open();
        const info = q(a.root, '.cm-info')!; // an info mark next to the count, not a sentence that takes a line
        expect(info.title).toContain('connections you can see');
        expect(info.title).toContain('never means unused');
        expect(info.getAttribute('aria-label')).toBe(info.title);
        expect(info.tabIndex).toBe(0);
    });
    it('the Broken filter keeps the broken ones and shows its count', async () => {
        const a = await open();
        expect(filter(a, 'Broken').textContent).toContain('3');
        filter(a, 'Broken').click();
        expect(names(a)).toEqual(['dead@example.test', 'three@example.test', 'two@example.test']);
    });
    it('search looks at name, connector and creator without case; a search with no match says so', async () => {
        const a = await open();
        const box = q(a.root, '.search input, input[type="search"], input')! as HTMLInputElement;
        box.value = 'FREE@';
        box.dispatchEvent(new Event('input', { bubbles: true }));
        expect(names(a)).toEqual(['free@example.test']);
        const again = q(a.root, 'input')! as HTMLInputElement;
        again.value = 'zzzz';
        again.dispatchEvent(new Event('input', { bubbles: true }));
        expect(q(a.root, '.empty-state, .empty')!.textContent).toContain('No connection matches');
    });
    it('the connector filter and the sort change what is shown and its order', async () => {
        const a = await open();
        // the connector filter is a list in which every connector has its drawing, its name and its count
        const picker = byLabel(a, 'Connector');
        expect(q(a.root, '.cm-picker-list')!.hidden).toBe(true);
        picker.click();
        expect(q(a.root, '.cm-picker-list')!.hidden).toBe(false);
        const opts = qa(a.root, '.cm-picker-opt') as HTMLElement[];
        expect(opts.every(o => q(o, '.conn-tile') !== null && /^\d+$/.test(q(o, '.cm-picker-count')!.textContent!))).toBe(true);
        expect(opts[0]!.textContent).toContain('All connectors');
        opts.find(o => o.dataset['key'] === 'b')!.click();
        expect(names(a)).toEqual(['other@example.test']);
        expect(q(a.root, '.cm-picker-btn')!.textContent).toBe('B'); // the button says which connector is chosen
        (qa(a.root, '.cm-picker-opt') as HTMLElement[]).find(o => o.dataset['key'] === '')!.click();
        byLabel(a, 'Sort by Status').click(); // the header of the column sorts
        expect(names(a).slice(0, 3)).toEqual(['dead@example.test', 'two@example.test', 'three@example.test']); // broken first
        expect(byLabel(a, 'Sort by Status, ascending').getAttribute('aria-label')).toContain('ascending');
        byLabel(a, 'Sort by Status, ascending').click(); // a second press turns it round
        expect(names(a).slice(-1)).toEqual(['dead@example.test']);
        byLabel(a, 'Sort by Modified').click();
        expect(q(a.root, '.cm-sort.is-active')!.textContent).toContain('Modified');
    });
    it('draws 100 rows at a time with Show more', async () => {
        const many = Array.from({ length: 120 }, (_, i) => ({ name: `c${String(i).padStart(3, '0')}` }));
        const a = await open({ connectionRows: many });
        expect(rows(a)).toHaveLength(100);
        buttonByText(a.root, 'Show more (20 left)')!.click();
        expect(rows(a)).toHaveLength(120);
    });
    it('reads page by page and the whole list is shown', async () => {
        const a = await open({ pageSize: 2 });
        expect(rows(a)).toHaveLength(6);
        expect(a.calls.connectionPages).toEqual(['', 'page-1', 'page-2']);
    });
    it('says why when the connections cannot be read, and offers to try again', async () => {
        const a = await open({ connectionRows: undefined, connections: 'unavailable' });
        expect(q(a.root, '.cm-failed')!.textContent).toContain('could not be read');
        expect(buttonByText(a.root, 'Try again')).toBeDefined();
    });
    it('an environment with no connections says so', async () => {
        const a = await open({ connectionRows: [] });
        expect(a.root.textContent).toContain('There are no connections that you can see');
    });
    it('Refresh reads again and keeps the filter, the search and the open rows', async () => {
        const a = await open();
        filter(a, 'Broken').click();
        await openRow(a, 'two@example.test');
        const before = a.calls.connectionReads;
        buttonByText(a.root, 'Refresh')!.click();
        await a.controller.idle();
        await settle();
        expect(a.calls.connectionReads).toBe(before + 1);
        expect(names(a)).toEqual(['dead@example.test', 'three@example.test', 'two@example.test']);
        expect(rows(a).find(r => q(r, '.conn-name')!.textContent === 'two@example.test')!.classList.contains('is-open')).toBe(true);
    });
    it('while the list is read every button is disabled by the one rule, and the wait says how many are in', async () => {
        let release!: () => void;
        const gate = new Promise<void>(r => { release = r; });
        const a = await app({ answer, connectionRows: SEEDS, beforeConnections: () => gate });
        const run = a.controller.connections!.open();
        await settle();
        expect(q(a.root, '.dep-loading .spinner')).not.toBeNull();
        expect(q(a.root, '.cm-wait')!.textContent).toContain('Reading the connections');
        for (const b of qa(a.root, 'button') as HTMLButtonElement[]) expect(b.disabled, b.textContent ?? '').toBe(true);
        release();
        await run;
        await settle();
        expect(names(a)).toHaveLength(6);
    });
    it('uses no emoji and every control has an accessible name', async () => {
        const a = await open();
        expect(a.root.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
        for (const b of qa(a.root, 'button')) expect((b.textContent ?? '').trim() !== '' || b.getAttribute('aria-label') !== null || b.getAttribute('title') !== null, b.outerHTML.slice(0, 80)).toBe(true);
        for (const i of qa(a.root, 'input, select')) expect(i.getAttribute('aria-label') ?? i.getAttribute('placeholder')).not.toBeNull();
    });
    it('a status is never colour alone: each chip has its label', async () => {
        const a = await open();
        for (const r of rows(a)) expect(q(r, '.cm-cell--status .chip')!.textContent!.trim().length).toBeGreaterThan(2);
    });
});

describe('the dependencies of a row', () => {
    it('opening a row reads them by itself, once, and shows the groups, where they live and the coverage note', async () => {
        const a = await open({ references: undefined });
        await openRow(a, 'one@example.test');
        const detail = q(a.root, '.cm-detail')!;
        expect(qa(detail, '.dep-group-title').map(t => t.textContent!.replace(/\s+/g, ' ').trim())).toEqual(['Flows 1', 'Connection references 1']);
        expect(detail.textContent).toContain('Alpha flow');
        expect(detail.textContent).toContain('Through the reference Ref 1');
        expect(q(detail, '.cm-coverage')!.textContent).toContain('Components that the signed-in user cannot read may still use this connection.');
        expect(a.calls.appReads).toBe(1);
        // closing and opening again reads nothing more
        byLabel(a, 'Hide details of one@example.test').click();
        await openRow(a, 'one@example.test');
        expect(a.calls.appReads).toBe(1);
    });
    it('a connection nothing was found for says No dependency found, never unused, and says next to it that the portal can show more', async () => {
        const a = await open();
        await openRow(a, 'free@example.test');
        const detail = q(a.root, '.cm-detail')!;
        expect(q(detail, '.cm-verdict')!.textContent).toContain('No dependency found');
        expect(detail.textContent).toContain('Flows using this connection');
        expect(detail.textContent).toContain('cannot see'); // the limit is in the text, not only in a tooltip
        expect(detail.textContent!.toLowerCase()).not.toContain('unused');
        expect(figs(a)).toMatchObject({ 'No dependency found': '1' });
        expect(q(a.root, '.cm-checked')!.textContent).toBe('Checked 1 of 6');
    });
    it('an app that uses the connection is found through the Power Apps list', async () => {
        const a = await open();
        await openRow(a, 'two@example.test');
        expect(q(a.root, '.cm-detail')!.textContent).toContain('Orders app');
        expect(figs(a)['In use']).toBe('1');
    });
    it('a refused apps list is named, the other sources still show, and the connection is not called free', async () => {
        const a = await open({ appsFail: 'Forbidden: administrator rights are needed' });
        await openRow(a, 'free@example.test');
        const detail = q(a.root, '.cm-detail')!;
        expect(detail.textContent).toContain('Could not read the apps: Forbidden');
        expect(q(detail, '.cm-verdict')!.textContent).toContain('Could not be checked');
        expect(rows(a).find(r => r.classList.contains('is-open'))!.textContent).toContain('Could not be checked');
    });
    it('says each problem once: the yellow line names the source, and the note under it only says what was looked at', async () => {
        const a = await open({ flowSearch: 'refused' });
        await openRow(a, 'free@example.test');
        const detail = q(a.root, '.cm-detail')!;
        expect(detail.textContent!.match(/Not scanned: flows/g)).toHaveLength(1);
        expect(q(detail, '.cm-coverage')!.textContent).toContain('Looked at:');
        expect(q(detail, '.cm-coverage')!.textContent).not.toContain('Not scanned');
    });
    it('a refused search by name is shown as not scanned and does not block', async () => {
        const a = await open({ flowSearch: 'refused' });
        await openRow(a, 'free@example.test');
        expect(q(a.root, '.cm-detail')!.textContent).toContain('Not scanned: flows');
        expect(q(a.root, '.cm-verdict')!.textContent).toContain('No dependency found');
    });
    it('Check again reads the shared sources again', async () => {
        const a = await open();
        await openRow(a, 'free@example.test');
        buttonByText(a.root, 'Check again')!.click();
        await a.controller.idle();
        await settle();
        expect(a.calls.appReads).toBe(2);
    });
    it('while a row is read it shows a spinner and what is being read', async () => {
        let release!: () => void;
        const gate = new Promise<void>(r => { release = r; });
        const a = await open({ beforeApps: () => gate });
        byLabel(a, 'Show details of free@example.test').click();
        await settle();
        expect(q(a.root, '.cm-detail .dep-loading .spinner')).not.toBeNull();
        expect(q(a.root, '.cm-detail')!.textContent).toContain('Reading what depends on this connection');
        release();
        await a.controller.idle();
        await settle();
        expect(q(a.root, '.cm-verdict')).not.toBeNull();
    });
    it('a row can be opened from the keyboard: the chevron is a real button with aria-expanded', async () => {
        const a = await open();
        const chevron = byLabel(a, 'Show details of free@example.test');
        expect(chevron.tagName).toBe('BUTTON');
        expect(chevron.getAttribute('aria-expanded')).toBe('false');
        chevron.click();
        await a.controller.idle();
        await settle();
        expect(byLabel(a, 'Hide details of free@example.test').getAttribute('aria-expanded')).toBe('true');
    });
});

describe('the details are laid out without gaps or floating text', () => {
    it('a dependent is two groups, the icon with the name on the left and the state alone on the right', async () => {
        const a = await open();
        await openRow(a, 'one@example.test');
        const head = q(a.root, '.cm-detail .dep-row-head')!;
        expect(head.children).toHaveLength(2);
        expect(head.children[0]!.classList.contains('dep-title')).toBe(true);
        expect(q(head, '.dep-title .icon')).not.toBeNull();
        expect(q(head, '.dep-title .dep-name')).not.toBeNull();
        expect(head.children[1]!.classList.contains('dep-tags')).toBe(true);
    });
    it('the coverage note does not grow: its flex rule is reset where it sits in a column', async () => {
        const css = (await import('node:fs')).readFileSync(`${process.cwd()}/src/styles.css`, 'utf8');
        expect(css).toMatch(/\.cm-coverage \{[^}]*flex: none/);
        const a = await open();
        await openRow(a, 'free@example.test');
        const note = q(a.root, '.cm-detail .cm-coverage')!;
        expect(note.closest('.dep-foot')).toBeNull(); // it is a column child, not in a row where flex-grow is meant
    });
});

describe('the columns do not touch', () => {
    it('the dependencies column is wide enough for its longest chip, the gap is generous and a chip wraps inside its own column', async () => {
        const css = (await import('node:fs')).readFileSync(`${process.cwd()}/src/styles.css`, 'utf8');
        const m = /\.cm-head, \.cm-row \{[^}]*grid-template-columns: 32px 28px minmax\(0, 1fr\) (\d+)px (\d+)px (\d+)px 36px;[^}]*column-gap: var\(--sp-4\)/.exec(css);
        expect(m).not.toBeNull();
        const [status, dependencies, modified] = m!.slice(1).map(Number) as [number, number, number];
        expect(status).toBeGreaterThanOrEqual(160); // NEEDS RECONNECT
        expect(dependencies).toBeGreaterThanOrEqual(210); // HELD BY 9 REFERENCES / COULD NOT BE CHECKED
        expect(modified).toBeGreaterThanOrEqual(110);
        expect(css).toMatch(/\.cm-cell \.chip \{[^}]*white-space: normal/);
    });
    it('the header and the rows share one grid, so their columns line up', async () => {
        const css = (await import('node:fs')).readFileSync(`${process.cwd()}/src/styles.css`, 'utf8');
        expect(css).toMatch(/\.cm-head, \.cm-row \{ display: grid/);
    });
});

describe('what was looked at is read first', () => {
    it('the note sits right under the verdict, before the groups, so a long list never hides it', async () => {
        const a = await open();
        await openRow(a, 'one@example.test');
        const kids = [...q(a.root, '.cm-detail .cm-deps')!.children].map(c => c.className.split(' ')[0]);
        expect(kids.indexOf('dep-source')).toBe(1); // after the verdict (index 0), before every group
        expect(kids.indexOf('dep-source')).toBeLessThan(kids.indexOf('dep-group'));
        expect(q(a.root, '.cm-coverage')!.textContent).toContain('Looked at:');
    });
});

describe('the layout is simple', () => {
    it('has the tabs, one toolbar row and one row of actions above the list, which is the only thing that scrolls', async () => {
        const a = await open();
        const children = [...q(a.root, '.cm-screen')!.children].map(c => c.className.split(' ')[0]);
        expect(children).toEqual(['area-switch', 'toolbar', 'cm-actions', 'table-wrap']);
    });
    it('a row is short: the connector and a short code of the id sit under the name, nothing is truncated and the whole id is in the tooltip', async () => {
        const a = await open({ connectionRows: [{ name: 'shared-webcontents-4b648095-8190-4e4d-9d4e-a5b49bc49528', displayName: 'Web contents' }] });
        const sub = q(rows(a)[0]!, '.cm-sub')!;
        expect(sub.title).toContain('shared-webcontents-4b648095-8190-4e4d-9d4e-a5b49bc49528');
        expect(q(sub, '.cm-id')!.textContent).toBe('#4b648095');
        expect(rows(a)[0]!.textContent).not.toContain('a5b49bc49528'); // the whole id is in the tooltip and the details, not in the row
        expect(q(rows(a)[0]!, '.cm-cell--dep .chip')).toBeNull(); // before it is read the dependencies are a quiet word, not 100 chips
        expect(q(rows(a)[0]!, '.cm-unchecked')!.textContent).toBe('Not checked');
    });
    it('the columns that sort are headers, and Dependencies is not one of them', async () => {
        const a = await open();
        const heads = qa(a.root, '.cm-head .cm-sort').map(b => b.textContent);
        expect(heads).toEqual(['Connection', 'Status', 'Modified']);
        expect(q(a.root, '.cm-head')!.textContent).toContain('Dependencies');
    });
    it('there is no Sort by select, no direction button and no sentence line under the actions', async () => {
        const a = await open();
        expect(qa(a.root, '[aria-label]').some(e => e.getAttribute('aria-label') === 'Sort by')).toBe(false);
        expect(buttonByText(a.root, 'Ascending')).toBeUndefined();
        expect(q(a.root, '.cm-scope')).toBeNull();
    });
});

describe('Check all is a slim line of steps and one connector at a time', () => {
    it('shows the three steps in words while the apps are read, no list of connectors, and gives it all up when it ends', async () => {
        let release!: () => void;
        const gate = new Promise<void>(r => { release = r; });
        const a = await open({ beforeApps: () => gate });
        const run = a.controller.connections!.checkAll();
        await settle();
        const steps = qa(a.root, '.cm-pipe .pipe-step');
        expect(steps.map(e => q(e, '.pipe-label')!.textContent)).toEqual(['Apps', 'Connection references', 'Connections']);
        expect(steps[0]!.classList.contains('is-active')).toBe(true);
        expect(q(a.root, '.cm-pipe .run-ring')!.getAttribute('aria-label')).toBe('Progress of Check all');
        expect(qa(a.root, '.cm-pipe .run-count').length).toBe(3);
        expect(qa(a.root, '.cm-pipe .cm-block').length).toBeLessThanOrEqual(1); // never the whole list of connectors
        release();
        await run;
        await settle();
        expect(q(a.root, '.cm-pipe')).toBeNull();
    });
});

describe('a connection held only by a reference', () => {
    it('is told apart from one that is in use, in the row and in the detail, and is still a dependency', async () => {
        const a = await open({ dependents: {} }); // ref3 holds conn-3 and nothing uses ref3
        await openRow(a, 'three@example.test');
        const row = rows(a).find(r => q(r, '.conn-name')!.textContent === 'three@example.test')!;
        expect(q(row, '.cm-cell--dep')!.textContent).toContain('Held by 1 reference');
        expect(q(row, '.cm-cell--dep .chip')!.title).toContain('no flow, app or agent');
        expect(q(row, '.cm-verdict')!.textContent).toContain('Only a connection reference holds this connection');
        expect(figs(a)['In use']).toBe('1'); // still counted: it cannot be deleted by this run
        await a.controller.connections!.checkAll();
        await settle();
        expect((byLabel(a, 'Select three@example.test') as HTMLButtonElement).disabled).toBe(true);
    });
});

describe('Check all and the selection', () => {
    it('shows the progress and ends with the figures; only connections with no dependency found can be ticked', async () => {
        const a = await open();
        // unchecked: nothing can be ticked
        for (const ck of qa(a.root, '.cm-check') as HTMLButtonElement[]) expect(ck.disabled).toBe(true);
        expect(buttonByText(a.root, 'Select the ones with no dependency found')!.disabled).toBe(true);
        await a.controller.connections!.checkAll();
        await settle();
        expect(q(a.root, '.cm-progress')).toBeNull(); // it is over
        expect(figs(a)).toMatchObject({ 'No dependency found': '3', 'In use': '3' });
        expect(q(a.root, '.cm-checked')!.textContent).toBe('Checked 6 of 6');
        const ticked = (label: string) => (byLabel(a, `Select ${label}`) as HTMLButtonElement);
        expect(ticked('free@example.test').disabled).toBe(false);
        expect(ticked('one@example.test').disabled).toBe(true); // used by a reference
        buttonByText(a.root, 'Select the ones with no dependency found')!.click();
        expect([...a.store.get().connections.selected].sort()).toEqual(['conn-dead', 'conn-free', 'conn-other']);
        expect(q(a.root, '.cm-selected')!.textContent).toBe('3 selected');
    });
    it('a broken connection with no dependency found is eligible too', async () => {
        const a = await open();
        await a.controller.connections!.checkAll();
        await settle();
        expect((byLabel(a, 'Select dead@example.test') as HTMLButtonElement).disabled).toBe(false);
    });
    it('shows the progress bar with the count while it runs and Cancel keeps what was read', async () => {
        let release!: () => void;
        const gate = new Promise<void>(r => { release = r; });
        const a = await open({ beforeApps: () => gate });
        const run = a.controller.connections!.checkAll();
        await settle();
        expect(q(a.root, '.cm-pipe .run-ring')).not.toBeNull();
        expect(q(a.root, '.cm-pipe .run-now')!.textContent).toContain('Reading the apps');
        const cancel = buttonByText(a.root, 'Cancel')!;
        expect(cancel.disabled).toBe(false); // the one control that stays usable
        for (const b of (qa(a.root, 'button') as HTMLButtonElement[]).filter(b => b !== cancel)) expect(b.disabled, b.textContent ?? '').toBe(true);
        cancel.click();
        release();
        await run;
        await settle();
        expect(a.store.get().connections.checkAll).toBeNull();
        expect(Object.keys(a.store.get().connections.deps).length).toBeLessThanOrEqual(6);
        expect(a.store.get().connections.selected).toEqual([]); // nothing is ticked on its own
    });
    it('a failed apps read leaves every connection unchecked and none selectable', async () => {
        const a = await open({ appsFail: 'denied' });
        await a.controller.connections!.checkAll();
        await settle();
        buttonByText(a.root, 'Select the ones with no dependency found');
        expect(buttonByText(a.root, 'Select the ones with no dependency found')!.disabled).toBe(true);
        expect(figs(a)['No dependency found']).toBe('0');
        expect(q(a.root, '.cm-checked')!.textContent).toBe('Checked 6 of 6');
    });
    it('a refresh drops the answers and the ticks', async () => {
        const a = await open();
        await a.controller.connections!.checkAll();
        await settle();
        buttonByText(a.root, 'Select the ones with no dependency found')!.click();
        buttonByText(a.root, 'Refresh')!.click();
        await a.controller.idle();
        await settle();
        expect(a.store.get().connections.selected).toEqual([]);
        expect(Object.keys(a.store.get().connections.deps)).toEqual([]);
    });
    it('ticking by hand toggles an eligible connection', async () => {
        const a = await open();
        await a.controller.connections!.checkAll();
        await settle();
        byLabel(a, 'Select free@example.test').click();
        expect(a.store.get().connections.selected).toEqual(['conn-free']);
        byLabel(a, 'Select free@example.test').click();
        expect(a.store.get().connections.selected).toEqual([]);
    });
});

describe('the area switch', () => {
    it('is on the solutions home, opens the area and reads the list anew each time', async () => {
        const a = await open();
        a.controller.connections!.backToSolutions();
        a.controller.selectSolution('');
        await settle();
        const sw = q(a.root, '.area-switch')!;
        expect(sw.textContent).toContain('Connections');
        expect(sw.querySelector('.segmented')).toBeNull(); // tabs, so they never look like the filters
        const before = a.calls.connectionReads;
        qa(sw, '.area-tab').find(b => b.textContent!.includes('Connections'))!.click();
        await a.controller.idle();
        await settle();
        expect(a.calls.connectionReads).toBe(before + 1);
        expect(q(a.root, '.cm-list')).not.toBeNull();
    });
    it('the breadcrumb says Solutions then Connections, and Solutions leads back', async () => {
        const a = await open();
        const trail = a.crumbs.textContent!;
        expect(trail).toContain('Solutions');
        expect(trail).toContain('Connections');
        a.crumbs.querySelector<HTMLElement>('a, button, .crumb-link')?.click();
        await settle();
        expect(a.store.get().area).toBe('solutions');
    });
});

describe('scroll and focus are kept', () => {
    it('the list is the one region that scrolls (the frame is fixed) and a dependency read, a filter change and Refresh leave it where it was', async () => {
        const many = Array.from({ length: 40 }, (_, i) => ({ name: `c${String(i).padStart(2, '0')}` }));
        const a = await open({ connectionRows: many });
        const page = q(a.root, '.cm-list') as HTMLElement;
        expect(page.classList.contains('table-wrap')).toBe(true); // the class that gives it the scroll and keeps its place on a redraw
        expect(a.root.querySelector('.cm-screen > .cm-list')).not.toBeNull(); // a direct child of the screen, so the flex layout gives it the room
        page.scrollTop = 420;
        byLabel(a, 'Show details of c05@example.test').click();
        await a.controller.idle();
        await settle();
        expect(page.scrollTop).toBe(420);
        filter(a, 'All').click();
        expect(page.scrollTop).toBe(420);
        buttonByText(a.root, 'Refresh')!.click();
        await a.controller.idle();
        await settle();
        expect(page.scrollTop).toBe(420);
    });
    it('typing in the search keeps the focus on the field', async () => {
        const a = await open();
        const box = q(a.root, 'input')! as HTMLInputElement;
        box.focus();
        box.value = 'one';
        box.dispatchEvent(new Event('input', { bubbles: true }));
        expect(document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.getAttribute('placeholder')).toBe(box.getAttribute('aria-label') ?? box.getAttribute('placeholder'));
    });
});

describe('Check selected (the author, 2026-11-12: with ticks, a check reads only those)', () => {
    it('shows the count of the ticks on the right and reads only the ticked connections', async () => {
        const a = await open();
        await a.controller.connections!.checkAll();
        await settle();
        buttonByText(a.root, 'Select the ones with no dependency found')!.click();
        await settle();
        const ticked = a.store.get().connections.selected.length;
        expect(ticked).toBeGreaterThan(0);
        expect(q(a.root, '.cm-checked')!.textContent).toContain(`Selected ${ticked}  -  checked ${ticked} of ${ticked}`);
        expect(buttonByText(a.root, `Check selected (${ticked})`)).toBeDefined();
        expect(buttonByText(a.root, 'Check all again')).toBeUndefined();
        const before = Object.keys(a.store.get().connections.deps).length;
        await a.controller.connections!.checkAll('selected');
        await settle();
        expect(Object.keys(a.store.get().connections.deps).length).toBe(before); // nothing else was read
        expect(a.store.get().connections.checkAll).toBeNull();
    });
    it('without ticks the button is Check all again, as before', async () => {
        const a = await open();
        await a.controller.connections!.checkAll();
        await settle();
        expect(buttonByText(a.root, 'Check all again')).toBeDefined();
        expect(q(a.root, '.cm-checked')!.textContent).toContain('Checked 6 of 6');
    });
});

describe('every row has its own Copy portal address button (the author, 2026-11-12: to check it in the portal before deleting)', () => {
    it('is in the row, copies the address of that connection only and does not open the row', async () => {
        const a = await open();
        const first = rows(a)[0]!;
        const btn = q(first, '.cm-link-btn') as HTMLButtonElement;
        expect(btn).not.toBeNull();
        expect(btn.getAttribute('aria-label')).toContain('Copy the portal address of');
        expect(qa(a.root, '.cm-row .cm-link-btn').length).toBe(rows(a).length);
        btn.click();
        await settle();
        expect(a.store.get().connections.open).toEqual([]); // the click did not open the row
    });
});

describe('the connector filter shows a drawing next to every connector (the author, 2026-11-12)', () => {
    it('closes on Escape and on a click outside, and the button wears the drawing of the chosen connector', async () => {
        const a = await open();
        const picker = byLabel(a, 'Connector');
        picker.click();
        expect(q(a.root, '.cm-picker-list')!.hidden).toBe(false);
        q(a.root, '.cm-picker')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(q(a.root, '.cm-picker-list')!.hidden).toBe(true);
        picker.click();
        document.body.click();
        expect(q(a.root, '.cm-picker-list')!.hidden).toBe(true);
        expect(q(a.root, '.cm-picker-btn .conn-tile')).not.toBeNull();
        expect(picker.getAttribute('aria-haspopup')).toBe('listbox');
    });
});

describe('the filter bar wears icons (the author, 2026-11-12)', () => {
    it('every filter has an SVG icon before its label and its count', async () => {
        const a = await open();
        const segments = qa(a.root, '.cm-toolbar > .segmented .segment');
        expect(segments).toHaveLength(4);
        expect(segments.every(s => q(s, '.icon') !== null && q(s, '.segment-count') !== null)).toBe(true);
    });
});
