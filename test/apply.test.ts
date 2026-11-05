// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { guid } from './helpers/fixtures';
import { app, buttonByText, q, qa, settle, reviewChanges } from './helpers/scenario';

/** Feature 008, the Apply step: a run that is paused between rows so the screen can be looked at in the middle. */

type Gates = Map<string, () => void>;
function gated() {
    const gates: Gates = new Map();
    const wait = (id: string) => new Promise<void>(res => gates.set(id, res));
    const release = async (id: string) => {
        await settle();
        gates.get(id)!();
        gates.delete(id);
        await settle();
    };
    return { gates, wait, release };
}

async function toApplying(extra: Parameters<typeof app>[0] = {}) {
    const g = gated();
    const a = await app({ beforeUpdate: g.wait, ...extra });
    a.store.dispatch({ type: 'selectAll', ids: [guid(10), guid(11), guid(12)] });
    a.store.dispatch({ type: 'setRepoint', from: 'sample_ref1', target: 'sample_ref2' });
    reviewChanges(a);
    await settle();
    buttonByText(a.root, 'Apply...')!.click();
    await settle();
    (q(a.root, '.modal .toggle') as HTMLElement).click();
    buttonByText(a.root, 'Apply to 3 flows')!.click();
    await settle();
    return { ...a, ...g };
}
const rows = (root: ParentNode) => q(root, '.run-rows')!;
const status = (root: ParentNode) => q(root, '.pipe-status')!.textContent;
const phases = (root: ParentNode) => qa(root, '.pipe-step').map(s => `${q(s, '.pipe-label')!.textContent}:${s.className.replace('pipe-step ', '')}`);

describe('the Apply step while rows are being written', () => {
    it('opens by itself after the confirmation, with the stepper on Apply and the first two phases', async () => {
        const a = await toApplying();
        expect(q(a.root, '.step-title')!.textContent).toBe('Processing your changes');
        expect(qa(a.root, '.stepper-item').map(i => i.className.replace('stepper-item ', ''))).toEqual(['is-done', 'is-done', 'is-active', 'is-upcoming']);
        expect(phases(a.root)).toEqual(['Confirmed:is-done', 'Write and verify:is-active', 'Refresh:is-pending', 'Summary:is-pending']);
        expect(q(a.root, '.modal')).toBeNull();
    });
    it('the status line says how many rows are done and for how long, and it moves with the clock', async () => {
        const a = await toApplying();
        expect(status(a.root)).toBe('Writing and verifying: 0 of 3 rows · 0 s');
        a.advance(14_000);
        await settle(40);
        expect(status(a.root)).toBe('Writing and verifying: 0 of 3 rows · 14 s');
        a.advance(51_000);
        await settle(40);
        expect(status(a.root)).toBe('Writing and verifying: 0 of 3 rows · 1 min 05 s');
    });
    const items = (root: ParentNode) => qa(rows(root), '.run-item');
    const states = (root: ParentNode) => items(root).map(r => r.className.replace('run-item run-item--', ''));
    it('every row is there from the start, waiting; the one being written is marked; each takes its outcome as soon as it is finished', async () => {
        const a = await toApplying();
        expect(items(a.root).map(r => q(r, '.run-item-name')!.textContent)).toEqual(['Alpha flow', 'Beta flow', 'Gamma flow']);
        expect(states(a.root)).toEqual(['working', 'pending', 'pending']);
        expect(q(items(a.root)[1]!, '.run-item-msg')!.textContent).toBe('Waiting');
        await a.release(guid(10));
        expect(states(a.root)).toEqual(['done', 'working', 'pending']);
        expect(q(items(a.root)[0]!, '.run-item-msg')!.textContent).toBe('Written and read back.');
        expect(q(items(a.root)[0]!, '.chip')!.textContent).toBe('done');
        expect(status(a.root)).toContain('1 of 3 rows');
        expect(q(rows(a.root), '.run-rows-head .chip')!.textContent).toBe('1 of 3');
        await a.release(guid(11));
        expect(states(a.root)).toEqual(['done', 'done', 'working']);
        expect(status(a.root)).toContain('2 of 3 rows');
    });
    it('writes the rows one after the other, never two at once', async () => {
        const a = await toApplying();
        expect([...a.gates.keys()]).toEqual([guid(10)]);
        await a.release(guid(10));
        expect([...a.gates.keys()]).toEqual([guid(11)]);
    });
    it('Back is disabled and nothing can lead away from the run', async () => {
        const a = await toApplying();
        expect(buttonByText(a.root, 'Back')!.disabled).toBe(true);
        expect(buttonByText(a.root, 'Back')!.title).toContain('no way back');
        expect(qa(a.crumbs, '.crumb--link')).toHaveLength(0);
        expect(qa(a.crumbs, '.crumb').map(c => c.textContent)).toEqual(['Solutions', 'Sample', 'Apply']);
        a.controller.selectSolution('');
        a.store.dispatch({ type: 'closePlan' });
        a.store.dispatch({ type: 'dismissResults' });
        await settle();
        expect(a.store.get().wizard!.step).toBe('apply');
        expect(a.store.get().solutionId).toBe(a.sol.id);
    });
    it('a failed row does not stop the others, and shows its message', async () => {
        const items = (root: ParentNode) => qa(rows(root), '.run-item');
        const states = (root: ParentNode) => items(root).map(r => r.className.replace('run-item run-item--', ''));
        const a = await toApplying({ failUpdate: id => (id === guid(11) ? 'No privilege' : undefined) });
        await a.release(guid(10));
        await a.release(guid(11));
        expect(states(a.root)).toEqual(['done', 'failed', 'working']);
        expect(q(items(a.root)[1]!, '.run-item-msg')!.textContent).toBe('No privilege');
        await a.release(guid(12));
        expect(a.calls.updates.map(u => u.id)).toEqual([guid(10), guid(12)]);
    });
});

describe('the Apply step moves on by itself', () => {
    it('after the last row the refresh phase is active, then the Result opens', async () => {
        let letRefresh: () => void = () => undefined;
        const refreshGate = new Promise<void>(res => { letRefresh = res; });
        const a = await toApplying({ beforeRefresh: () => refreshGate });
        await a.release(guid(10));
        await a.release(guid(11));
        await a.release(guid(12));
        await settle(30);
        expect(a.store.get().wizard!.step).toBe('apply');
        expect(phases(a.root)).toEqual(['Confirmed:is-done', 'Write and verify:is-done', 'Refresh:is-active', 'Summary:is-pending']);
        expect(status(a.root)).toContain('Reading the solution again');
        letRefresh();
        await settle(40);
        expect(a.store.get().wizard!.step).toBe('result');
        expect(q(a.root, '.step-title')!.textContent).toBe('Result');
    });
    it('the timer stops when the run ends: the clock no longer moves', async () => {
        const a = await toApplying();
        await a.release(guid(10));
        await a.release(guid(11));
        await a.release(guid(12));
        await settle(40);
        const at = a.store.get().wizard!.now;
        a.advance(60_000);
        await settle(60);
        expect(a.store.get().wizard!.now).toBe(at);
    });
});

describe('the start of the run', () => {
    it('can only start after the confirmation is acknowledged', async () => {
        const g = gated();
        const a = await app({ beforeUpdate: g.wait });
        a.store.dispatch({ type: 'selectAll', ids: [guid(10)] });
        a.store.dispatch({ type: 'setRepoint', from: 'sample_ref1', target: 'sample_ref2' });
        reviewChanges(a);
        await settle();
        buttonByText(a.root, 'Apply...')!.click();
        await settle();
        a.controller.confirm(); // forged: the box is not ticked
        await settle();
        expect(a.store.get().wizard!.step).toBe('preview');
        expect(a.calls.updates).toEqual([]);
        expect([...g.gates.keys()]).toEqual([]);
    });
    it('a second confirm while the run is going does nothing', async () => {
        const a = await toApplying();
        a.controller.confirm();
        a.controller.confirm();
        await settle();
        await a.release(guid(10));
        expect(a.calls.updates).toHaveLength(1);
    });
});

describe('the timer of a run', () => {
    it('is started with the run and stopped when it ends, so nothing keeps ticking', async () => {
        const set = vi.spyOn(globalThis, 'setInterval');
        const clear = vi.spyOn(globalThis, 'clearInterval');
        try {
            const a = await toApplying();
            const started = set.mock.calls.length;
            expect(started).toBeGreaterThan(0);
            await a.release(guid(10));
            await a.release(guid(11));
            await a.release(guid(12));
            await a.controller.idle();
            expect(clear.mock.calls.length).toBe(started);
            const ids = set.mock.results.map(r => r.value);
            expect(clear.mock.calls.map(c => c[0])).toEqual(ids);
        } finally {
            set.mockRestore();
            clear.mockRestore();
        }
    });
});

describe('the Apply step says clearly that something is running (feature 012 look)', () => {
    const hero = (root: ParentNode) => q(root, '.run-hero')!;
    it('has a spinner, a headline, a warning not to close, and a progress bar that starts at zero', async () => {
        const a = await toApplying();
        expect(q(hero(a.root), '.run-spinner')).not.toBeNull();
        expect(q(hero(a.root), '.run-headline')!.textContent).toBe('Processing your changes');
        expect(hero(a.root).textContent).toContain('Do not close this tool');
        expect(hero(a.root).textContent).toContain('Test (Dev)');
        const bar = q(hero(a.root), '[role="progressbar"]')!;
        expect([bar.getAttribute('aria-valuemin'), bar.getAttribute('aria-valuemax'), bar.getAttribute('aria-valuenow')]).toEqual(['0', '100', '0']);
        expect(q(hero(a.root), '.run-percent')!.textContent).toBe('0%');
    });
    it('the bar follows the rows and the counters count outcomes as they come', async () => {
        const a = await toApplying();
        await a.release(guid(10));
        const bar = q(hero(a.root), '[role="progressbar"]')!;
        expect(bar.getAttribute('aria-valuenow')).toBe('28');
        expect(q(hero(a.root), '.run-count--done')!.textContent).toContain('1');
        expect(q(hero(a.root), '.run-now')!.textContent).toContain('row 2 of 3');
    });
    it('the spinner stops and is removed when the run ends', async () => {
        const a = await toApplying();
        await a.release(guid(10));
        await a.release(guid(11));
        await a.release(guid(12));
        a.advance(1000);
        await a.controller.idle();
        await settle(30);
        expect(q(a.root, '.run-spinner')).toBeNull();
    });
});
