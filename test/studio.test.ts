// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { guid, fromOf } from './helpers/fixtures';
import { app, buttonByText, q, qa, settle } from './helpers/scenario';

/** Feature 010: the choices are made in a roomy dialog that can fill the window; the choose screen keeps a slim bar. */

const sel = (a: Awaited<ReturnType<typeof app>>, ids: string[]) => a.store.dispatch({ type: 'selectAll', ids });
const flows = [guid(10), guid(11), guid(12)];
const byLabel = (root: ParentNode, label: string) => qa(root, '[aria-label]').find(e => e.getAttribute('aria-label') === label) as HTMLButtonElement;
const open = (a: Awaited<ReturnType<typeof app>>) => buttonByText(a.root, 'Choose changes...')!.click();

describe('the selection bar', () => {
    it('replaces the action block: a count of fixed width and one button, nothing to choose in it', async () => {
        const a = await app();
        expect(q(a.root, '.action-box')).toBeNull();
        expect(qa(a.root, '.action-strip select, .action-strip input')).toHaveLength(0);
        expect(q(a.root, '.action-strip .action-count')!.textContent).toBe('0 selected');
        expect(buttonByText(a.root, 'Choose changes...')!.disabled).toBe(true);
    });
    it('has the same shape with nothing selected and with rows selected', async () => {
        const a = await app();
        const shape = () => qa(a.root, '.action-strip *').map(e => `${e.tagName}.${e.className.replace(/ is-idle/g, '')}`).join('|');
        const before = shape();
        sel(a, flows);
        expect(shape()).toBe(before);
        expect(buttonByText(a.root, 'Choose changes...')!.disabled).toBe(false);
    });
    it('says why it is locked on a managed solution', async () => {
        const a = await app();
        a.store.dispatch({ type: 'snapshotLoaded', snapshot: { ...a.store.get().snapshot!, solution: { ...a.store.get().snapshot!.solution, managed: true } } });
        expect(q(a.root, '.action-strip')!.textContent).toContain('managed');
        expect(buttonByText(a.root, 'Choose changes...')!.disabled).toBe(true);
    });
});

describe('the studio for a re-point', () => {
    it('opens as a dialog with the title and the environment, writes nothing, and the table stays behind it', async () => {
        const a = await app();
        sel(a, flows);
        open(a);
        expect(a.store.get().studio).toBe(true);
        expect(q(a.root, '.modal .modal-title')!.textContent).toBe('Re-point flows');
        expect(q(a.root, '.modal .modal-subtitle')!.textContent).toContain('Test (Dev)');
        expect(q(a.root, 'table')).not.toBeNull();
        expect(a.calls.updates).toEqual([]);
    });
    it('Cancel, Escape and the close button close it, keep the choices and write nothing', async () => {
        const a = await app();
        sel(a, flows);
        for (const how of ['cancel', 'escape', 'close']) {
            open(a);
            byLabel(a.root, 'Replace Ref 1').click();
            if (how === 'cancel') buttonByText(a.root, 'Cancel')!.click();
            else if (how === 'escape') q(a.root, '.modal')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            else byLabel(a.root, 'Close').click();
            expect(a.store.get().studio, how).toBe(false);
            expect(fromOf(a.store.get()), how).toEqual(['sample_ref1']);
            a.store.dispatch({ type: 'setRepoint', from: [], target: '' });
        }
        expect(a.calls.updates).toEqual([]);
    });
    it('reopening shows the choices that were made', async () => {
        const a = await app();
        sel(a, flows);
        open(a);
        byLabel(a.root, 'Replace Ref 1').click();
        byLabel(a.root, 'Use Ref 2').click();
        buttonByText(a.root, 'Cancel')!.click();
        open(a);
        expect(byLabel(a.root, 'Replace Ref 1').getAttribute('aria-checked')).toBe('true');
        expect(byLabel(a.root, 'Use Ref 2').getAttribute('aria-checked')).toBe('true');
    });
    it('focus starts on the first control', async () => {
        const a = await app();
        sel(a, flows);
        open(a);
        expect((document.activeElement as HTMLElement).getAttribute('aria-label')).toBe('Replace Ref 1');
    });
});

describe('the pipeline of categories (feature 014)', () => {
    const B = '/providers/Microsoft.PowerApps/apis/shared_b';
    /** Two connectors, each with something to choose: A has Ref 1 in use and Ref 2, Ref 3 free; B has Ref 4 in use and Ref 5 free. */
    async function start() {
        const { defaultReferences } = await import('./helpers/scenario');
        const { ref } = await import('./helpers/fixtures');
        const a = await app({ references: [...defaultReferences(), ref(5, { connectorId: B })] });
        sel(a, flows);
        open(a);
        return a;
    }
    const items = (root: ParentNode) => qa(root, '.studio-pipe-item');
    const stepsText = (root: ParentNode) => items(root).map(i => q(i, '.studio-pipe-name')!.textContent);
    const statusOf = (root: ParentNode) => items(root).map(i => i.className.match(/is-(done|warn|empty)/)?.[1] ?? 'pending');
    /** One step forward, as a click on the next item of the pipeline. */
    const next = (a: Awaited<ReturnType<typeof app>>) => ({ click: () => (items(a.root)[Math.min(a.store.get().studioStep + 1, items(a.root).length - 1)] as HTMLElement).click() });
    /** Moving between the categories and the summary is done with the pipeline. */
    const goTo = (a: Awaited<ReturnType<typeof app>>, i: number) => (items(a.root)[i]!.querySelector('button') ?? items(a.root)[i]!).click();
    const sources = (root: ParentNode) => qa(root, '.studio-panel .source-name').map(e => e.textContent);

    it('shows one step per connector and then the summary, the first one current', async () => {
        const a = await start();
        expect(stepsText(a.root)).toEqual(['A', 'B', 'Summary']);
        expect(items(a.root).map(i => i.getAttribute('aria-current'))).toEqual(['step', null, null]);
        expect(a.store.get().studioStep).toBe(0);
    });
    it('shows only the references of the current connector', async () => {
        const a = await start();
        expect(sources(a.root)).toEqual(['Ref 1']);
        next(a).click();
        expect(sources(a.root)).toEqual(['Ref 4']);
    });
    it('there are no Back and Next buttons: the pipeline moves between the steps, keeping the choices', async () => {
        const a = await start();
        expect(buttonByText(a.root, 'Back')).toBeUndefined();
        expect(buttonByText(a.root, 'Next')).toBeUndefined();
        byLabel(a.root, 'Replace Ref 1').click();
        byLabel(a.root, 'Use Ref 2').click();
        goTo(a, 1);
        expect(a.store.get().studioStep).toBe(1);
        goTo(a, 0);
        expect(byLabel(a.root, 'Replace Ref 1').getAttribute('aria-checked')).toBe('true');
        expect(byLabel(a.root, 'Use Ref 2').getAttribute('aria-checked')).toBe('true');
    });
    it('says where you are: Category 1 of 2, then the summary', async () => {
        const a = await start();
        expect(q(a.root, '.studio-where')!.textContent).toBe('Category 1 of 2');
        goTo(a, 2);
        expect(q(a.root, '.studio-where')!.textContent).toBe('Summary');
    });
    it('a step with nothing chosen can be passed: the category is not changed', async () => {
        const a = await start();
        goTo(a, 1);
        expect(a.store.get().repointGroups).toEqual([]);
        expect(statusOf(a.root)).toEqual(['empty', 'pending', 'pending']);
    });
    it('references ticked without a new reference say what is missing and mark the step incomplete', async () => {
        const a = await start();
        byLabel(a.root, 'Replace Ref 1').click();
        expect(q(a.root, '.studio-nav-note')!.textContent).toContain('Choose the reference to use instead');
        expect(statusOf(a.root)[0]).toBe('warn');
        byLabel(a.root, 'Use Ref 2').click();
        expect(statusOf(a.root)[0]).toBe('done');
    });
    it('the right side offers only the references of this connector, and nothing until one is ticked', async () => {
        const a = await start();
        expect(qa(a.root, '.studio-panel .choice')).toHaveLength(0);
        expect(q(a.root, '.studio-pane--to')!.textContent).toContain('Tick the references to replace first');
        byLabel(a.root, 'Replace Ref 1').click();
        expect(qa(a.root, '.studio-panel .choice').map(c => c.getAttribute('aria-label'))).toEqual(['Use Ref 2', 'Use Ref 3']);
    });
    it('each new reference shows its name, logical name, the connection in full and its owner', async () => {
        const a = await start();
        byLabel(a.root, 'Replace Ref 1').click();
        const text = byLabel(a.root, 'Use Ref 2').textContent!;
        for (const part of ['Ref 2', 'sample_ref2', 'conn-2', 'Owner:']) expect(text).toContain(part);
    });
    it('a click on a step goes straight there, forward or back, and changes no choice', async () => {
        const a = await start();
        byLabel(a.root, 'Replace Ref 1').click();
        const groups = a.store.get().repointGroups;
        items(a.root)[2]!.click();
        expect(a.store.get().studioStep).toBe(2);
        items(a.root)[0]!.click();
        expect(a.store.get().studioStep).toBe(0);
        expect(a.store.get().repointGroups).toBe(groups);
    });
    it('a category with nothing else to offer says so and still lets you go on', async () => {
        const a = await app();
        sel(a, flows);
        open(a);
        next(a).click();
        byLabel(a.root, 'Replace Ref 4').click();
        expect(q(a.root, '.studio-pane--to')!.textContent).toContain('no other reference of this connector');
    });
    it('Select all and Clear act on the current category only', async () => {
        const a = await start();
        buttonByText(a.root, 'Select all')!.click();
        expect(a.store.get().repointGroups.map(g => g.from)).toEqual([['sample_ref1']]);
        buttonByText(a.root, 'Clear')!.click();
        expect(a.store.get().repointGroups).toEqual([]);
    });
    it('there is no select-everything button over the pipeline: each category has its own Select all and Clear', async () => {
        const a = await start();
        expect(buttonByText(a.root, 'Select every category')).toBeUndefined();
        expect(buttonByText(a.root, 'Clear all')).toBeUndefined();
        buttonByText(a.root, 'Select all')!.click();
        expect(a.store.get().repointGroups.map(g => g.from)).toEqual([['sample_ref1']]);
        buttonByText(a.root, 'Clear')!.click();
        expect(a.store.get().repointGroups).toEqual([]);
    });
    it('the figures are under every step, in the same place, and there is no overview any more', async () => {
        const a = await start();
        const shapeOf = () => qa(a.root, '.studio-bottom *').map(e => e.tagName + e.className.replace(/ is-idle| studio-note--warn/g, '')).join('|');
        byLabel(a.root, 'Replace Ref 1').click();
        byLabel(a.root, 'Use Ref 2').click();
        const before = shapeOf();
        next(a).click();
        expect(q(a.root, '.studio-bottom .studio-impact')).not.toBeNull();
        expect(shapeOf()).toBe(before);
        next(a).click();
        expect(shapeOf()).toBe(before);
        expect(q(a.root, '.studio-overview')).toBeNull();
    });
    it('the bar at the bottom holds where you are, Cancel and Review changes, and nothing that repeats the pipeline', async () => {
        const a = await start();
        const foot = q(a.root, '.modal-foot')!;
        expect(foot.contains(buttonByText(a.root, 'Review changes')!)).toBe(true);
        expect(foot.contains(buttonByText(a.root, 'Cancel')!)).toBe(true);
        expect([...foot.querySelectorAll('button')].map(b => b.textContent?.trim())).toEqual(['Cancel', 'Review changes']);
        expect(q(a.root, '.studio-where')!.textContent).toBe('Category 1 of 2');
    });
    it('the connector is shown by the pipeline only: the step has no bar with its name again', async () => {
        const a = await start();
        expect(q(a.root, '.studio-panel-head')).toBeNull();
        expect(q(a.root, '.studio-pipe-item.is-current .studio-pipe-name')!.textContent).toBe('A');
    });
    it('the figures count what the choices touch', async () => {
        const a = await start();
        const figs = () => Object.fromEntries(qa(a.root, '.studio-impact .fig').map(f => [q(f, '.fig-label')!.textContent, q(f, '.fig-value')!.textContent]));
        expect(figs()).toEqual({ Categories: '0', 'Flows affected': '0', 'Turned on': '0', 'Without these references': '3' });
        next(a).click();
        byLabel(a.root, 'Replace Ref 4').click();
        expect(figs()).toEqual({ Categories: '1', 'Flows affected': '1', 'Turned on': '0', 'Without these references': '2' });
    });
});

describe('the summary step (feature 014)', () => {
    const B = '/providers/Microsoft.PowerApps/apis/shared_b';
    async function summary(choose: (a: Awaited<ReturnType<typeof app>>) => void) {
        const { defaultReferences } = await import('./helpers/scenario');
        const { ref } = await import('./helpers/fixtures');
        const a = await app({ references: [...defaultReferences(), ref(5, { connectorId: B })] });
        sel(a, flows);
        open(a);
        choose(a);
        a.store.dispatch({ type: 'studioGo', step: 2 });
        return a;
    }
    const lines = (root: ParentNode) => qa(root, '.summary-line').map(l => [q(l, '.summary-name')!.textContent, q(l, '.summary-state')!.textContent]);
    it('lists every category with its state, and says nothing is written yet', async () => {
        const a = await summary(x => {
            byLabel(x.root, 'Replace Ref 1').click();
            byLabel(x.root, 'Use Ref 2').click();
        });
        expect(lines(a.root)).toEqual([['A', 'Done'], ['B', 'Not changed']]);
        expect(q(a.root, '.studio-panel')!.textContent).toContain('Nothing is written yet');
        expect(q(a.root, '.studio-where')!.textContent).toBe('Summary');
        expect(buttonByText(a.root, 'Review changes')!.disabled).toBe(false);
    });
    it('an incomplete category is flagged, and Review changes stays closed', async () => {
        const a = await summary(x => byLabel(x.root, 'Replace Ref 1').click());
        expect(lines(a.root)[0]).toEqual(['A', 'Incomplete']);
        expect(buttonByText(a.root, 'Review changes')!.disabled).toBe(true);
    });
    it('with nothing chosen anywhere Review changes is closed and the summary says so', async () => {
        const a = await summary(() => undefined);
        expect(buttonByText(a.root, 'Review changes')!.disabled).toBe(true);
        expect(lines(a.root)).toEqual([['A', 'Not changed'], ['B', 'Not changed']]);
    });
    it('Edit goes to the step of that category', async () => {
        const a = await summary(x => {
            x.store.dispatch({ type: 'studioGo', step: 1 });
            byLabel(x.root, 'Replace Ref 4').click();
        });
        qa(a.root, '.summary-line .summary-edit')[1]!.click();
        expect(a.store.get().studioStep).toBe(1);
    });
    it('Review changes opens the review with every category done', async () => {
        const a = await summary(x => {
            byLabel(x.root, 'Replace Ref 1').click();
            byLabel(x.root, 'Use Ref 2').click();
            x.store.dispatch({ type: 'studioGo', step: 1 });
            byLabel(x.root, 'Replace Ref 4').click();
            byLabel(x.root, 'Use Ref 5').click();
        });
        buttonByText(a.root, 'Review changes')!.click();
        await settle();
        expect(a.store.get().studio).toBe(false);
        expect(a.store.get().plan!.kind).toBe('repoint');
        expect(a.store.get().plan!.rows.map(r => r.blocked)).toEqual([undefined, undefined, undefined]);
    });
});

describe('the motion between steps (feature 014)', () => {
    const B = '/providers/Microsoft.PowerApps/apis/shared_b';
    async function start() {
        const { defaultReferences } = await import('./helpers/scenario');
        const { ref } = await import('./helpers/fixtures');
        const a = await app({ references: [...defaultReferences(), ref(5, { connectorId: B })] });
        sel(a, flows);
        open(a);
        return a;
    }
    const panel = (a: Awaited<ReturnType<typeof app>>) => q(a.root, '.studio-panel')!;
    it('forward slides in from the right, back from the left, and a plain redraw does not play it again', async () => {
        const a = await start();
        expect(panel(a).className).not.toMatch(/slide--/);
        (qa(a.root, '.studio-pipe-item')[1] as HTMLElement).click();
        expect(panel(a).className).toContain('slide--next');
        byLabel(a.root, 'Replace Ref 4').click();
        expect(panel(a).className).not.toMatch(/slide--/);
        (qa(a.root, '.studio-pipe-item')[0] as HTMLElement).click();
        expect(panel(a).className).toContain('slide--prev');
    });
    it('the CSS plays the motion and switches it off for reduced motion', async () => {
        const { readFileSync } = await import('node:fs');
        const { resolve } = await import('node:path');
        const css = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');
        expect(css).toMatch(/\.studio-panel\.slide--next \{[^}]*animation:/);
        expect(css).toMatch(/\.studio-panel\.slide--prev \{[^}]*animation:/);
        expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[^{]*\{[^}]*\.studio-panel/);
    });
});

describe('expanding the studio', () => {
    it('opens filling the window; Restore size gives the smaller dialog, Expand fills again, and the state survives closing', async () => {
        const a = await app();
        sel(a, flows);
        open(a);
        const modal = () => q(a.root, '.modal')!;
        expect(modal().className).toContain('is-expanded');
        expect(byLabel(a.root, 'Restore size').getAttribute('aria-pressed')).toBe('true');
        byLabel(a.root, 'Restore size').click();
        expect(modal().className).not.toContain('is-expanded');
        expect(byLabel(a.root, 'Expand').getAttribute('aria-pressed')).toBe('false');
        buttonByText(a.root, 'Cancel')!.click();
        open(a);
        expect(modal().className).not.toContain('is-expanded');
        byLabel(a.root, 'Expand').click();
        expect(modal().className).toContain('is-expanded');
    });
});

describe('the studio for a change of connection', () => {
    const toRefs = async () => {
        const a = await app();
        a.store.dispatch({ type: 'setView', view: 'references' });
        a.store.dispatch({ type: 'selectAll', ids: [guid(1), guid(2)] });
        open(a);
        return a;
    };
    it('lists the selected references on the left and the connections already used by that connector on the right', async () => {
        const a = await toRefs();
        expect(q(a.root, '.modal .modal-title')!.textContent).toBe('Change connection');
        expect(qa(a.root, '.studio-pane--from .source-name').map(e => e.textContent)).toEqual(['Ref 1', 'Ref 2']);
        const choices = qa(a.root, '.choice').map(c => c.getAttribute('aria-label'));
        expect(choices).toContain('Use conn-1');
        expect(choices).toContain('Use conn-3');
    });
    it('choosing a connection or pasting an id enables Review changes, which opens the review', async () => {
        const a = await toRefs();
        expect(buttonByText(a.root, 'Review changes')!.disabled).toBe(true);
        byLabel(a.root, 'Use conn-3').click();
        expect(a.store.get().newConnectionId).toBe('conn-3');
        const typed = byLabel(a.root, 'Or paste a connection id') as unknown as HTMLInputElement;
        typed.value = 'conn-9';
        typed.dispatchEvent(new Event('input'));
        expect(a.store.get().newConnectionId).toBe('conn-9');
        buttonByText(a.root, 'Review changes')!.click();
        await settle();
        expect(a.store.get().plan!.kind).toBe('connection');
        expect(a.store.get().studio).toBe(false);
    });
    it('the impact strip counts the flows that follow', async () => {
        const a = await toRefs();
        const figs = Object.fromEntries(qa(a.root, '.studio-impact .fig').map(f => [q(f, '.fig-label')!.textContent, q(f, '.fig-value')!.textContent]));
        expect(figs).toEqual({ 'References': '2', 'Flows affected': '3', 'Turned on': '0' });
    });
    it('references of different connectors cannot be changed together: the dialog says why and offers nothing', async () => {
        const a = await app();
        a.store.dispatch({ type: 'setView', view: 'references' });
        a.store.dispatch({ type: 'selectAll', ids: [guid(1), guid(4)] });
        open(a);
        expect(q(a.root, '.studio-pane--to')!.textContent).toContain('different connectors');
        expect(qa(a.root, '.choice')).toHaveLength(0);
        expect(buttonByText(a.root, 'Review changes')!.disabled).toBe(true);
    });
});

describe('the studio does not blink when a choice is made', () => {
    it('opens with its animation once, and a re-draw while it is open has none', async () => {
        const a = await app();
        sel(a, flows);
        open(a);
        expect(q(a.root, '.modal-overlay')!.className).not.toContain('no-anim');
        byLabel(a.root, 'Replace Ref 1').click();
        expect(q(a.root, '.modal-overlay')!.className).toContain('no-anim');
        byLabel(a.root, 'Replace Ref 1').click();
        expect(q(a.root, '.modal-overlay')!.className).toContain('no-anim');
        buttonByText(a.root, 'Cancel')!.click();
        open(a);
        expect(q(a.root, '.modal-overlay')!.className).not.toContain('no-anim');
    });
    it('the scroll of both panes is kept across a choice', async () => {
        const a = await app();
        sel(a, flows);
        open(a);
        const panes = () => qa(a.root, '.studio-pane-body');
        panes()[0]!.scrollTop = 40;
        panes()[1]!.scrollTop = 25;
        byLabel(a.root, 'Replace Ref 1').click();
        expect(panes()[0]!.scrollTop).toBe(40);
        expect(panes()[1]!.scrollTop).toBe(25);
    });
});

describe('a reference row is one line: check, name, then the usage on the right', () => {
    it('the row is a flex row that does not wrap, so nothing drops below the check', async () => {
        const { readFileSync } = await import('node:fs');
        const { resolve } = await import('node:path');
        const css = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');
        const rule = (sel: string) => [...css.matchAll(new RegExp(`(?:^|\n)${sel.replace('.', '\.')} \{([^}]*)\}`, 'g'))].map(m => m[1]).join(' ');
        expect(rule('.source-row')).toMatch(/display:\s*flex/);
        expect(rule('.source-row')).toMatch(/align-items:\s*center/);
        expect(rule('.source-row')).not.toMatch(/flex-wrap:\s*wrap/);
        expect(rule('.source-usage')).toMatch(/flex:\s*0 0/);
    });
});

describe('the confirmation dialog (retyle)', () => {
    async function toConfirm() {
        const a = await app();
        sel(a, flows);
        a.store.dispatch({ type: 'setRepoint', from: 'sample_ref1', target: 'sample_ref2' });
        const { reviewChanges } = await import('./helpers/scenario');
        reviewChanges(a);
        await settle();
        buttonByText(a.root, 'Apply...')!.click();
        await settle();
        return a;
    }
    it('opens filling the window like the studio, can be restored, and the preference is shared', async () => {
        const a = await toConfirm();
        expect(q(a.root, '.confirm-dialog')!.className).toContain('is-expanded');
        byLabel(a.root, 'Restore size').click();
        expect(q(a.root, '.confirm-dialog')!.className).not.toContain('is-expanded');
        expect(a.store.get().dialogExpanded).toBe(false);
    });
    it('ticking the acknowledgement does not make the dialog blink: no opening animation on a re-draw', async () => {
        const a = await toConfirm();
        expect(q(a.root, '.modal-overlay')!.className).not.toContain('no-anim');
        (q(a.root, '.modal .toggle') as HTMLElement).click();
        expect(q(a.root, '.modal-overlay')!.className).toContain('no-anim');
    });
    it('the header is the calm accent, not the error one, and the Apply button is styled by rules that cover both states', async () => {
        const a = await toConfirm();
        expect(q(a.root, '.confirm-dialog')!.className).toContain('modal--primary');
        const { readFileSync } = await import('node:fs');
        const { resolve } = await import('node:path');
        const css = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');
        expect(css).toMatch(/\.modal-actions \.btn--danger:not\(:disabled\) \{[^}]*linear-gradient/);
        expect(css).toMatch(/\.modal-actions \.btn--danger:disabled \{[^}]*opacity: 1/);
    });
});

describe('the studio keeps room for the choices (hand test: everything was squashed)', () => {
    it('the overview and the figures share one band under the panes, and the panes have a minimum height', async () => {
        const { readFileSync } = await import('node:fs');
        const { resolve } = await import('node:path');
        const a = await app();
        sel(a, flows);
        open(a);
        const band = q(a.root, '.studio-bottom')!;
        expect(band.contains(q(a.root, '.studio-impact'))).toBe(true);
        expect(q(a.root, '.modal-body')!.lastElementChild).toBe(band);
        const css = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');
        expect(css).toMatch(/\.studio \{[^}]*min-height: 300px/);
        expect(css).toMatch(/\.studio-bottom \{[^}]*display: grid/);
    });
});
