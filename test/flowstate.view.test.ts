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
    return a;
}
const permission = (root: ParentNode) => q(root, '.modal .studio-state .toggle') as HTMLButtonElement;

describe('the permission is asked in the confirmation, not in the studio', () => {
    it('the studio has no such block, at any step', async () => {
        const a = await inStudio();
        expect(q(a.root, '.studio-state')).toBeNull();
        a.store.dispatch({ type: 'studioGo', step: 0 });
        expect(q(a.root, '.studio-state')).toBeNull();
    });
    it('the confirmation shows it, off, with the number of flows that are on', async () => {
        const a = await inStudio();
        buttonByText(a.root, 'Review changes')!.click();
        await settle();
        buttonByText(a.root, 'Apply...')!.click();
        await settle();
        expect(q(a.root, '.modal .studio-state')!.textContent).toContain('1 flow is turned on');
        expect(a.store.get().manageState).toBe(false);
        expect(permission(a.root).getAttribute('aria-pressed') ?? permission(a.root).getAttribute('aria-checked')).not.toBe('true');
    });
    it('turning it on reads the preview again: the flow that is on is now written and marked', async () => {
        const a = await inStudio();
        buttonByText(a.root, 'Review changes')!.click();
        await settle();
        buttonByText(a.root, 'Apply...')!.click();
        await settle();
        expect(a.store.get().plan!.rows.filter(r => r.blocked === undefined)).toHaveLength(1);
        permission(a.root).click();
        const plan = a.store.get().plan!;
        expect(a.store.get().manageState).toBe(true);
        expect(plan.rows.filter(r => r.blocked === undefined)).toHaveLength(2);
        expect(plan.rows.filter(r => r.turnOff === true)).toHaveLength(1);
        expect(a.store.get().wizard!.confirmOpen).toBe(true);
    });
    it('turning it on again clears what was ticked: the plan it applies to has changed', async () => {
        const a = await inStudio();
        buttonByText(a.root, 'Review changes')!.click();
        await settle();
        buttonByText(a.root, 'Apply...')!.click();
        await settle();
        a.store.dispatch({ type: 'setAck', on: true });
        permission(a.root).click();
        expect(a.store.get().planAck).toBe(false);
    });
    it('is not shown when no flow of the plan is on, and not in the change of connection', async () => {
        const a = await inStudio([mk(10, 0), mk(11, 0)]);
        buttonByText(a.root, 'Review changes')!.click();
        await settle();
        buttonByText(a.root, 'Apply...')!.click();
        await settle();
        expect(q(a.root, '.modal .studio-state')).toBeNull();
    });
    it('it does not matter whether the summary was ever visited: Review changes from the first category gets the same dialog', async () => {
        const a = await app({ flows: [mk(10, 1), mk(11, 0)] });
        a.store.dispatch({ type: 'selectAll', ids: [guid(10), guid(11)] });
        buttonByText(a.root, 'Choose changes...')!.click();
        byLabel(a.root, 'Replace Ref 1').click();
        byLabel(a.root, 'Use Ref 2').click();
        expect(a.store.get().studioStep).toBe(0);
        buttonByText(a.root, 'Review changes')!.click();
        await settle();
        buttonByText(a.root, 'Apply...')!.click();
        await settle();
        expect(q(a.root, '.modal .studio-state')).not.toBeNull();
    });
});

async function toConfirm(flows = [mk(10, 1), mk(11, 0)], opts: Parameters<typeof app>[0] = {}) {
    const a = await inStudio(flows, opts);
    buttonByText(a.root, 'Review changes')!.click();
    await settle();
    buttonByText(a.root, 'Apply...')!.click();
    await settle();
    if (q(a.root, '.modal .studio-state')) permission(a.root).click();
    return a;
}
/** The acknowledgements in the footer (the permission block has its own toggle). */
const toggles = (root: ParentNode) => qa(root, '.modal-foot .toggle');

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
    it('the studio keeps Review changes open: the permission is asked in the confirmation, so flows that are on are no reason to stop here', async () => {
        const a = await inStudio([mk(10, 1), mk(11, 1)]);
        expect(buttonByText(a.root, 'Review changes')!.disabled).toBe(false);
    });
    it('the Preview of flows that are all on keeps Apply open, to reach the permission', async () => {
        const a = await inStudio([mk(10, 1), mk(11, 1)]);
        buttonByText(a.root, 'Review changes')!.click();
        await settle();
        expect(q(a.root, '.callout--error.nothing-written')).not.toBeNull();
        expect(buttonByText(a.root, 'Apply...')!.disabled).toBe(false);
        buttonByText(a.root, 'Apply...')!.click();
        await settle();
        expect((buttonByText(a.root, 'Apply to 0 flows') ?? buttonByText(a.root, 'Apply to 0'))!.disabled).toBe(true);
        permission(a.root).click();
        expect(a.store.get().plan!.rows.filter(r => r.blocked === undefined)).toHaveLength(2);
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
        expect(c.textContent).toContain('2 flows: The flow is turned on: turn it off first');
        expect(c.textContent).toContain('Apply... lets you allow the tool to turn the flows off');
        expect(buttonByText(a.root, 'Apply...')!.disabled).toBe(false);
    });
    it('the banner is not shown when some row can be written', async () => {
        const { planRepointGroups } = await import('../src/model/plans');
        const a = await app({ flows: [mk(10, 1), mk(11, 0)] });
        a.store.dispatch({ type: 'openPlan', plan: planRepointGroups(a.store.get().snapshot!, [guid(10), guid(11)], [{ connectorId: '', from: ['sample_ref1'], target: 'sample_ref2' }]) });
        await settle();
        expect(q(a.root, '.nothing-written')).toBeNull();
    });
});

describe('the area tabs and a write path', () => {
    it('offers the area tabs on the solution screen and not during the write path, so a write is never left by a tab', async () => {
        const a = await inStudio();
        a.store.dispatch({ type: 'closeStudio' } as never);
        await settle();
        expect(qa(a.root, '.area-tab').length).toBe(2);
        const b = await inStudio();
        buttonByText(b.root, 'Review changes')!.click();
        await settle();
        expect(q(b.root, '.preview, .step-body')).not.toBeNull(); // the preview step is open
        expect(qa(b.root, '.area-tab').length).toBe(0);
    });
});
