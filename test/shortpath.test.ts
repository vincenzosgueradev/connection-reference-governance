// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { app, buttonByText, q, qa, settle, reviewChanges } from './helpers/scenario';
import { guid, fromOf, targetOf } from './helpers/fixtures';

/** Features 006 and 015: the guided path is Choose, Preview, Apply, Result; Review changes opens the Preview at once. */

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

describe('the choose screen leads straight to the Preview', () => {
    it('Review changes opens the Preview and writes nothing', async () => {
        const a = await toPreview();
        expect(q(a.root, '.step-title')!.textContent).toBe('Preview what will be stored');
        expect(a.calls.updates).toEqual([]);
        expect(a.store.get().wizard).toMatchObject({ step: 'preview', operation: 'repoint' });
    });
    it('a change of connection opens the Preview too', async () => {
        const a = await toPreview('connection');
        expect(a.store.get().wizard).toMatchObject({ step: 'preview', operation: 'connection' });
        expect(a.calls.updates).toEqual([]);
    });
    it('there is no Review step: no Continue to preview button, no Review crumb, no Review title', async () => {
        const a = await toPreview();
        expect(buttonByText(a.root, 'Continue to preview')).toBeUndefined();
        expect(a.root.textContent).not.toContain('Review the changes');
        expect(qa(a.crumbs, '.crumb').map(c => c.textContent)).not.toContain('Review');
    });
    it('the choose screen is gone while the workflow is open', async () => {
        const a = await toPreview();
        expect(q(a.root, '.action-strip')).toBeNull();
        expect(q(a.root, '.step-panel')).not.toBeNull();
    });
});

describe('the stepper and the breadcrumb of the path', () => {
    it('shows four steps: Choose done, Preview current, the rest upcoming', async () => {
        const a = await toPreview();
        expect(qa(a.root, '.stepper-item').map(i => i.className.replace('stepper-item ', ''))).toEqual(['is-done', 'is-active', 'is-upcoming', 'is-upcoming']);
        expect(qa(a.root, '.stepper-label').map(l => l.textContent)).toEqual(['Choose', 'Preview', 'Apply', 'Result']);
    });
    it('the stepper is a labelled list and marks the current step for assistive technology', async () => {
        const a = await toPreview();
        const list = q(a.root, '.stepper')!;
        expect(list.getAttribute('aria-label')).toBeTruthy();
        expect(qa(a.root, '.stepper-item[aria-current="step"]')).toHaveLength(1);
    });
    it('the breadcrumb is Solutions, the solution and the step; the first two lead out', async () => {
        const a = await toPreview();
        expect(qa(a.crumbs, '.crumb').map(c => c.textContent)).toEqual(['Solutions', 'Sample', 'Preview']);
        expect(qa(a.crumbs, '.crumb--link').map(c => c.textContent)).toEqual(['Solutions', 'Sample']);
        (qa(a.crumbs, '.crumb--link')[1] as HTMLElement).click();
        await settle();
        expect(a.store.get().wizard).toBeNull();
        expect(a.store.get().solutionId).toBe(a.sol.id);
        expect(a.calls.updates).toEqual([]);
    });
});

describe('going back from the Preview', () => {
    it('returns to the choices with the selection and the choices kept, and nothing written', async () => {
        const a = await toPreview();
        buttonByText(a.root, 'Back')!.click();
        await settle();
        expect(a.store.get().wizard).toBeNull();
        expect(a.store.get().plan).toBeNull();
        expect(a.store.get().selected).toEqual([guid(10), guid(11)]);
        expect([fromOf(a.store.get()), targetOf(a.store.get())]).toEqual([['sample_ref1'], 'sample_ref2']);
        expect(q(a.root, '.action-count')!.textContent).toBe('2 selected');
        expect(a.calls.updates).toEqual([]);
    });
    it('a second Review changes after coming back opens a fresh Preview', async () => {
        const a = await toPreview();
        buttonByText(a.root, 'Back')!.click();
        await settle();
        reviewChanges(a);
        await settle();
        expect(a.store.get().wizard).toMatchObject({ step: 'preview', live: [], finishedAt: null });
        expect([a.store.get().planAck, a.store.get().backupSaved]).toEqual([false, false]);
    });
});
