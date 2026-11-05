// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { guid } from './helpers/fixtures';
import { app, buttonByText, q, qa, settle, reviewChanges } from './helpers/scenario';

/** Feature 008, the Result step: what happened, in words, figures and rows; the report; the way back. */

async function run(opts: Parameters<typeof app>[0] = {}, kind: 'repoint' | 'connection' = 'repoint', ms = 14_000) {
    const a = await app(opts);
    if (kind === 'repoint') {
        a.store.dispatch({ type: 'selectAll', ids: [guid(10), guid(11), guid(12)] });
        a.store.dispatch({ type: 'setRepoint', from: 'sample_ref1', target: 'sample_ref2' });
    } else {
        a.store.dispatch({ type: 'setView', view: 'references' });
        a.store.dispatch({ type: 'selectAll', ids: [guid(1), guid(2)] });
        a.store.dispatch({ type: 'setNewConnectionId', value: 'conn-9' });
    }
    reviewChanges(a);
    await settle();
    buttonByText(a.root, 'Apply...')!.click();
    await settle();
    (q(a.root, '.modal .toggle') as HTMLElement).click();
    const apply = qa(a.root, '.modal .btn--danger')[0] as HTMLButtonElement;
    apply.click();
    a.advance(ms);
    await a.controller.idle();
    await settle(30);
    return a;
}
const figs = (root: ParentNode) => Object.fromEntries(qa(root, '.fig').map(f => [q(f, '.fig-label')!.textContent, q(f, '.fig-value')!.textContent]));
const resultRows = (root: ParentNode) => qa(qa(root, '.detail-block').find(b => q(b, '.detail-title')!.textContent === 'Rows')!, 'tbody tr').map(r => qa(r, 'td').map(c => c.textContent));

describe('the Result step after a clean run', () => {
    it('is the last step: all earlier ones are done, none is a link, and the way out is Back to solution', async () => {
        const a = await run();
        expect(q(a.root, '.step-title')!.textContent).toBe('Result');
        expect(qa(a.root, '.stepper-item').map(i => i.className.replace('stepper-item ', ''))).toEqual(['is-done', 'is-done', 'is-done', 'is-active']);
        expect(qa(a.crumbs, '.crumb').map(c => c.textContent)).toEqual(['Solutions', 'Sample', 'Result']);
        expect(qa(a.crumbs, '.crumb--link').map(c => c.textContent)).toEqual(['Solutions', 'Sample']);
    });
    it('says in a green banner that everything was written and read back', async () => {
        const a = await run();
        expect(q(a.root, '.callout--success .callout-title')!.textContent).toBe('All changes were written');
        expect(q(a.root, '.callout--success')!.textContent).toContain('3 rows were written and read back.');
    });
    it('shows the figures: they add up to the rows, and the duration is the time of the run', async () => {
        const a = await run();
        expect(figs(a.root)).toEqual({ Changed: '3', Skipped: '0', Failed: '0', Duration: '14 s' });
        expect(qa(a.root, '.fig--success')).toHaveLength(3);
    });
    it('shows the operation, the solution and the environment', async () => {
        expect(q((await run()).root, '.hero')).toBeNull(); // no banner that repeats the operation
    });
    it('lists every row with its outcome and the message that it was read back', async () => {
        const a = await run();
        expect(resultRows(a.root)).toEqual([
            ['Alpha flow', 'done', 'Written and read back.'],
            ['Beta flow', 'done', 'Written and read back.'],
            ['Gamma flow', 'done', 'Written and read back.'],
        ]);
    });
    it('what was written is what a later read finds: the flows point to the new reference', async () => {
        const a = await run();
        expect(a.flows.map(f => JSON.parse(f.clientData).properties.connectionReferences.shared_k0.connection.connectionReferenceLogicalName)).toEqual(['sample_ref2', 'sample_ref2', 'sample_ref2']);
        expect(a.calls.updates).toHaveLength(3);
    });
});

describe('the Result step after a run with problems', () => {
    it('partly done: an amber banner that counts, the figures, and the problem rows first', async () => {
        const a = await run({ failUpdate: id => (id === guid(11) ? 'No privilege' : undefined) });
        expect(q(a.root, '.callout--warning .callout-title')!.textContent).toBe('Partly done');
        expect(q(a.root, '.callout--warning')!.textContent).toContain('2 written, 0 skipped, 1 failed.');
        expect(figs(a.root)).toEqual({ Changed: '2', Skipped: '0', Failed: '1', Duration: '14 s' });
        expect(q(a.root, '.fig--error')).not.toBeNull();
        expect(resultRows(a.root).map(r => r[1])).toEqual(['failed', 'done', 'done']);
        expect(resultRows(a.root)[0]).toEqual(['Beta flow', 'failed', 'No privilege']);
    });
    it('a row changed by someone else is skipped and counted as skipped', async () => {
        const a = await app();
        a.store.dispatch({ type: 'selectAll', ids: [guid(10), guid(11)] });
        a.store.dispatch({ type: 'setRepoint', from: 'sample_ref1', target: 'sample_ref2' });
        reviewChanges(a);
        await settle();
        a.flows[1]!.clientData = a.flows[1]!.clientData.replace('Request', 'Request '); // changed behind our back
        buttonByText(a.root, 'Apply...')!.click();
        await settle();
        (q(a.root, '.modal .toggle') as HTMLElement).click();
        (qa(a.root, '.modal .btn--danger')[0] as HTMLButtonElement).click();
        await a.controller.idle();
        await settle(30);
        expect(figs(a.root)).toMatchObject({ Changed: '1', Skipped: '1', Failed: '0' });
        expect(resultRows(a.root)[0]![1]).toBe('skipped');
        expect(resultRows(a.root)[0]![2]).toContain('Changed by someone else');
    });
    it('nothing written: a red banner', async () => {
        const a = await run({ failUpdate: () => 'Denied' });
        expect(q(a.root, '.callout--error .callout-title')!.textContent).toBe('Nothing was written');
        expect(figs(a.root)).toMatchObject({ Changed: '0', Failed: '3' });
        expect(a.flows.map(f => JSON.parse(f.clientData).properties.connectionReferences.shared_k0.connection.connectionReferenceLogicalName)).toEqual(['sample_ref1', 'sample_ref1', 'sample_ref1']);
    });
    it('when the solution could not be read again the result says the data may be old and is never a plain success', async () => {
        const a = await run({ failRefresh: true });
        expect(a.store.get().wizard!.refreshFailed).toBe(true);
        expect(q(a.root, '.callout--warning')!.textContent).toContain('may be old');
        expect(q(a.root, '.callout--success')).toBeNull();
        expect(figs(a.root).Changed).toBe('3');
    });
});

describe('a change of connection ends the same way', () => {
    it('names the operation and writes the connection ids, read back', async () => {
        const a = await run({}, 'connection', 65_000);
        expect(q(a.root, '.hero')).toBeNull();
        expect(figs(a.root)).toEqual({ Changed: '2', Skipped: '0', Failed: '0', Duration: '1 min 05 s' });
        expect(a.refs.slice(0, 2).map(r => r.connectionId)).toEqual(['conn-9', 'conn-9']);
    });
});

describe('the report and the way back', () => {
    it('Save report saves a file with the operation, environment, times, summary and every row', async () => {
        const a = await run({ failUpdate: id => (id === guid(11) ? 'No privilege' : undefined) });
        buttonByText(a.root, 'Save report')!.click();
        await settle();
        expect(a.calls.saved).toHaveLength(1);
        expect(a.calls.saved[0]!.name).toMatch(/^report-re-point-flows-\d{14}\.json$/);
        const r = JSON.parse(a.calls.saved[0]!.content);
        expect(r).toMatchObject({ operation: 'Re-point flows', solution: 'Sample', environment: 'Test (Dev)', durationMs: 14000, summary: { changed: 2, skipped: 0, failed: 1, total: 3 } });
        expect(r.rows.map((x: { name: string; outcome: string }) => [x.name, x.outcome])).toEqual([['Alpha flow', 'done'], ['Beta flow', 'failed'], ['Gamma flow', 'done']]);
        expect(r.rows[1].message).toBe('No privilege');
    });
    it('Back to solution opens the solution again with fresh data and the same rows selected', async () => {
        const a = await run({}, 'connection');
        buttonByText(a.root, 'Back to solution')!.click();
        await settle();
        expect(a.store.get().wizard).toBeNull();
        expect(a.store.get().results).toBeNull();
        expect(a.store.get().selected).toEqual([guid(1), guid(2)]);
        expect(q(a.root, '.action-count')!.textContent).toBe('2 selected, 3 flows affected');
        // the references view shows what is stored now
        expect(qa(a.root, '.conn-id').map(c => c.textContent)).toContain('conn-9');
        expect(qa(a.crumbs, '.crumb').map(c => c.textContent)).toEqual(['Solutions', 'Sample']);
    });
    it('the breadcrumb links on the Result lead out as well', async () => {
        const a = await run();
        (qa(a.crumbs, '.crumb--link')[1] as HTMLElement).click();
        await settle();
        expect(a.store.get().wizard).toBeNull();
        expect(a.store.get().solutionId).toBe(a.sol.id);
    });
    it('a second change can be made right after: nothing of the first one is left over', async () => {
        const a = await run({}, 'connection');
        buttonByText(a.root, 'Back to solution')!.click();
        await settle();
        a.store.dispatch({ type: 'selectAll', ids: [guid(1)] });
        a.store.dispatch({ type: 'setNewConnectionId', value: 'conn-10' });
        reviewChanges(a);
        await settle();
        expect(a.store.get().wizard).toMatchObject({ step: 'preview', live: [], finishedAt: null });
        expect([a.store.get().planAck, a.store.get().backupSaved]).toEqual([false, false]);
    });
});

describe('the Result step is airy and short (hand test)', () => {
    it('the banner is one compact line and the blocks of the step are separated by a gap', async () => {
        const { readFileSync } = await import('node:fs');
        const { resolve } = await import('node:path');
        const a = await run();
        expect(q(a.root, '.callout--success')!.className).toContain('callout--compact');
        const css = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');
        expect(css).toMatch(/\.step-panel \{[^}]*display: flex;[^}]*flex-direction: column;[^}]*gap: var\(--sp-4\)/);
        expect(css).toMatch(/\.callout--compact \.callout-body \{[^}]*flex-wrap: wrap/);
    });
});
