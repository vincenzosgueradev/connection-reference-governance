// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { buildReport } from '../src/model/report';
import { clientData, flow, guid } from './helpers/fixtures';
import { REQUEST, app, buttonByText, q, qa, settle } from './helpers/scenario';

/** Feature 011 on screen: the permission in the studio, the warnings and the second acknowledgement, the run, the result. */

const mk = (n: number, stateCode: number, name = `Flow ${n}`) => flow(n, ['sample_ref1'], { name, stateCode, clientData: clientData(['sample_ref1'], {}, REQUEST) });
const byLabel = (root: ParentNode, label: string) => qa(root, '[aria-label]').find(e => e.getAttribute('aria-label') === label) as HTMLButtonElement;

async function inStudio(flows = [mk(10, 1), mk(11, 0)], opts: Parameters<typeof app>[0] = {}) {
    const a = await app({ flows, ...opts });
    a.store.dispatch({ type: 'selectAll', ids: flows.map(f => f.id) });
    buttonByText(a.root, 'Choose changes...')!.click();
    byLabel(a.root, 'Replace Ref 1').click();
    byLabel(a.root, 'Use Ref 2').click();
    a.store.dispatch({ type: 'studioGo', step: 1 }); // the summary: that is where the permission is asked
    return a;
}
const permission = (root: ParentNode) => q(root, '.studio-state .toggle') as HTMLButtonElement;

describe('the permission in the studio', () => {
    it('is a block that is always there, off by default, with the number of flows that are on', async () => {
        const a = await inStudio();
        expect(q(a.root, '.studio-state')).not.toBeNull();
        expect(permission(a.root).getAttribute('aria-checked')).toBe('false');
        expect(q(a.root, '.studio-state')!.textContent).toContain('1 selected flow is turned on');
        expect(a.store.get().manageState).toBe(false);
    });
    it('turning it on sets the choice, and the plan then writes the flow that is on and marks it', async () => {
        const a = await inStudio();
        permission(a.root).click();
        expect(a.store.get().manageState).toBe(true);
        buttonByText(a.root, 'Review changes')!.click();
        await settle();
        expect(a.store.get().plan!.rows.map(r => [r.label, r.blocked, r.turnOff])).toEqual([['Flow 10', undefined, true], ['Flow 11', undefined, undefined]]);
    });
    it('without it the flow that is on stays blocked, as before', async () => {
        const a = await inStudio();
        buttonByText(a.root, 'Review changes')!.click();
        await settle();
        expect(a.store.get().plan!.rows.map(r => r.blocked)).toEqual(['The flow is turned on: turn it off first.', undefined]);
    });
    it('is closed and says so when no selected flow is on', async () => {
        const a = await inStudio([mk(10, 0), mk(11, 0)]);
        expect(permission(a.root).disabled).toBe(true);
        expect(q(a.root, '.studio-state')!.textContent).toContain('No selected flow is turned on');
    });
    it('has the same shape whatever the flows, and is not in the change of connection', async () => {
        const a = await inStudio();
        const on = qa(a.root, '.studio-state *').map(e => e.tagName).join('|');
        a.store.dispatch({ type: 'closeStudio' });
        const b = await inStudio([mk(10, 0)]);
        expect(qa(b.root, '.studio-state *').map(e => e.tagName).join('|')).toBe(on);
        b.store.dispatch({ type: 'closeStudio' });
        b.store.dispatch({ type: 'setView', view: 'references' });
        b.store.dispatch({ type: 'selectAll', ids: [guid(1)] });
        buttonByText(b.root, 'Choose changes...')!.click();
        expect(q(b.root, '.studio-state')).toBeNull();
    });
    it('is asked on the summary only, not at every connector', async () => {
        const a = await inStudio();
        expect(q(a.root, '.studio-state')).not.toBeNull();
        a.store.dispatch({ type: 'studioGo', step: 0 });
        expect(q(a.root, '.studio-state')).toBeNull();
        a.store.dispatch({ type: 'studioGo', step: 1 });
        expect(q(a.root, '.studio-state')).not.toBeNull();
    });
});

async function toConfirm(flows = [mk(10, 1), mk(11, 0)], opts: Parameters<typeof app>[0] = {}) {
    const a = await inStudio(flows, opts);
    permission(a.root).click();
    buttonByText(a.root, 'Review changes')!.click();
    await settle();
    buttonByText(a.root, 'Apply...')!.click();
    await settle();
    return a;
}
const toggles = (root: ParentNode) => qa(root, '.modal .toggle');

describe('the confirmation when flows will be turned off', () => {
    it('lists what it means, in words, and the flows by name', async () => {
        const a = await toConfirm();
        const c = q(a.root, '.callout--warning.state-callout')!;
        expect(c.querySelector('.callout-title')!.textContent).toBe('Flows will be turned off');
        const text = c.textContent!;
        for (const part of ['does not run', 'triggers', 'already started', 'can be refused', 'Do not close this tool', 'Flow 10']) expect(text.toLowerCase()).toContain(part.toLowerCase());
        expect(text).not.toContain('Flow 11');
    });
    it('needs the general acknowledgement and a second one that says the flows are turned off; Apply waits for both', async () => {
        const a = await toConfirm();
        expect(toggles(a.root)).toHaveLength(2);
        expect(q(a.root, '.modal-foot')!.textContent).toContain('turned off');
        const apply = () => buttonByText(a.root, 'Apply to 2 flows')!;
        expect(apply().disabled).toBe(true);
        toggles(a.root)[0]!.click();
        expect(apply().disabled).toBe(true);
        toggles(a.root)[1]!.click();
        expect(apply().disabled).toBe(false);
        toggles(a.root)[0]!.click();
        expect(apply().disabled).toBe(true);
    });
    it('without a flow to turn off there is no warning and only one acknowledgement', async () => {
        const a = await toConfirm([mk(10, 0), mk(11, 0)]);
        expect(q(a.root, '.state-callout')).toBeNull();
        expect(toggles(a.root)).toHaveLength(1);
    });
});

describe('a run that turns flows off and on', () => {
    async function run(opts: Parameters<typeof app>[0] = {}) {
        const a = await toConfirm([mk(10, 1), mk(11, 0)], opts);
        toggles(a.root)[0]!.click();
        toggles(a.root)[1]!.click();
        buttonByText(a.root, 'Apply to 2 flows')!.click();
        a.advance(5000);
        await a.controller.idle();
        await settle(30);
        return a;
    }
    it('ends with every flow written and the one that was on, on again', async () => {
        const a = await run();
        expect(a.flows.map(f => f.stateCode)).toEqual([1, 0]);
        expect(a.store.get().results!.map(r => [r.label, r.status, r.stateChange])).toEqual([['Flow 11', 'done', undefined], ['Flow 10', 'done', 'back-on']]);
        expect(q(a.root, '.callout--success')).not.toBeNull();
        expect(a.root.textContent).toContain('turned off for the write and is on again');
    });
    it('shows the six phases while it runs', async () => {
        const a = await toConfirm([mk(10, 1)], { beforeUpdate: () => new Promise<void>(() => undefined) });
        toggles(a.root)[0]!.click();
        toggles(a.root)[1]!.click();
        buttonByText(a.root, 'Apply to 1 flow')!.click();
        await settle(40);
        expect(qa(a.root, '.pipe-step .pipe-label').map(l => l.textContent)).toEqual(['Confirmed', 'Turn off', 'Write and verify', 'Turn on', 'Refresh', 'Summary']);
        expect(q(a.root, '.run-headline')!.textContent).toBe('Turning flows off');
    });
    it('a flow left off is shown prominently, by name, with what to do', async () => {
        const a = await run({ failState: (_id, to) => (to === 'on' ? 'A connection is not valid' : undefined) });
        const c = q(a.root, '.callout--error.left-off')!;
        expect(c.querySelector('.callout-title')!.textContent).toBe('1 flow was left turned off');
        expect(c.textContent).toContain('Flow 10');
        expect(c.textContent).toContain('maker portal');
        expect(a.flows[0]!.stateCode).toBe(0);
    });
    it('the report records which flows were turned off and whether they are on again', async () => {
        const a = await run();
        buttonByText(a.root, 'Save report')!.click();
        await settle();
        const r = JSON.parse(a.calls.saved[0]!.content);
        expect(r.rows.find((x: { name: string }) => x.name === 'Flow 10').stateChange).toBe('back-on');
        expect(r.rows.find((x: { name: string }) => x.name === 'Flow 11').stateChange).toBeUndefined();
        expect(r.turnedOff).toEqual([{ name: 'Flow 10', onAgain: true }]);
    });
});

describe('the report', () => {
    it('lists the flows turned off and whether each is on again', () => {
        const text = buildReport({ operation: 'Re-point flows', solution: 'S', environment: 'E', startedAt: 0, finishedAt: 1000, results: [
            { id: 'a', label: 'A', status: 'done', message: 'ok', stateChange: 'back-on' },
            { id: 'b', label: 'B', status: 'failed', message: 'x', stateChange: 'left-off' },
            { id: 'c', label: 'C', status: 'done', message: 'ok' },
        ] });
        expect(JSON.parse(text).turnedOff).toEqual([{ name: 'A', onAgain: true }, { name: 'B', onAgain: false }]);
    });
    it('has an empty list when nothing was turned off', () => {
        expect(JSON.parse(buildReport({ operation: 'x', solution: 's', environment: 'e', startedAt: 0, finishedAt: 1, results: [] })).turnedOff).toEqual([]);
    });
});

describe('when nothing can be written (hand test: "no row can be written")', () => {
    it('the studio keeps Review changes closed and says why: the flows that use the references are on and the permission is off', async () => {
        const a = await inStudio([mk(10, 1), mk(11, 1)]);
        const review = buttonByText(a.root, 'Review changes')!;
        expect(review.disabled).toBe(true);
        const line = q(a.root, '.studio-impact .studio-note')!;
        expect(line.className).not.toContain('is-idle');
        expect(line.textContent).toContain('2 flows that use these references are turned on');
        expect(line.textContent).toContain('allow the tool to turn them off');
    });
    it('with the permission it opens, and the reason is gone', async () => {
        const a = await inStudio([mk(10, 1), mk(11, 1)]);
        permission(a.root).click();
        expect(buttonByText(a.root, 'Review changes')!.disabled).toBe(false);
        expect(q(a.root, '.studio-impact .studio-note')!.className).toContain('is-idle');
    });
    it('a mix is fine: the flow that is off is written, so Review changes opens even without the permission', async () => {
        const a = await inStudio([mk(10, 1), mk(11, 0)]);
        expect(buttonByText(a.root, 'Review changes')!.disabled).toBe(false);
    });
    it('the Preview explains it in a banner when no row can be written, with the counts per reason', async () => {
        const { planRepointGroups } = await import('../src/model/plans');
        const a = await app({ flows: [mk(10, 1), mk(11, 1)] });
        a.store.dispatch({ type: 'openPlan', plan: planRepointGroups(a.store.get().snapshot!, [guid(10), guid(11)], [{ connectorId: '', from: ['sample_ref1'], target: 'sample_ref2' }]) });
        await settle();
        const c = q(a.root, '.callout--error.nothing-written')!;
        expect(c.querySelector('.callout-title')!.textContent).toBe('No row can be written');
        expect(c.textContent).toContain('2 flows: The flow is turned on: turn it off first.');
        expect(c.textContent).toContain('Go back and allow the tool to turn the flows off');
        expect(buttonByText(a.root, 'Apply...')!.disabled).toBe(true);
    });
    it('the banner is not shown when some row can be written', async () => {
        const { planRepointGroups } = await import('../src/model/plans');
        const a = await app({ flows: [mk(10, 1), mk(11, 0)] });
        a.store.dispatch({ type: 'openPlan', plan: planRepointGroups(a.store.get().snapshot!, [guid(10), guid(11)], [{ connectorId: '', from: ['sample_ref1'], target: 'sample_ref2' }]) });
        await settle();
        expect(q(a.root, '.nothing-written')).toBeNull();
    });
});
