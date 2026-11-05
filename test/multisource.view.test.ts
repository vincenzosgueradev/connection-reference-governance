// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { clientData, flow, guid } from './helpers/fixtures';
import { REQUEST, app, buttonByText, q, qa, reviewChanges, settle } from './helpers/scenario';

/** Feature 009 on screen and through the whole run: several references to replace by one, in one operation. */

const three = () => [
    flow(10, ['sample_ref1', 'sample_ref2'], { name: 'Alpha flow', clientData: clientData(['sample_ref1', 'sample_ref2'], {}, REQUEST) }),
    flow(11, ['sample_ref2'], { name: 'Beta flow', clientData: clientData(['sample_ref2'], {}, REQUEST) }),
    flow(12, ['sample_ref1', 'sample_ref4'], { name: 'Gamma flow', clientData: clientData(['sample_ref1', 'sample_ref4'], {}, REQUEST) }),
];
const box = (root: ParentNode, name: string) => qa(root, '.check').find(c => c.getAttribute('aria-label') === `Replace ${name}`) as HTMLButtonElement;
const studio = (a: { root: ParentNode }) => buttonByText(a.root, 'Choose changes...')!.click();
const names = (c: unknown) => (c as { flows: { clientData: string }[] }).flows.map(f => (JSON.parse(f.clientData).properties.connectionReferences as Record<string, { connection: { connectionReferenceLogicalName: string } }>)).map(m => Object.values(m).map(e => e.connection.connectionReferenceLogicalName));

describe('choosing several references to replace', () => {
    it('every category is ticked on its own step: ticking one does not lock or change the other', async () => {
        const a = await app({ flows: three() });
        a.store.dispatch({ type: 'selectAll', ids: [guid(10), guid(11), guid(12)] });
        studio(a);
        box(a.root, 'Ref 1').click();
        expect(box(a.root, 'Ref 2').disabled).toBe(false);
        a.store.dispatch({ type: 'studioGo', step: 1 });
        box(a.root, 'Ref 4').click();
        expect(a.store.get().repointGroups.map(g => g.from)).toEqual([['sample_ref1'], ['sample_ref4']]);
    });
    it('the new reference list includes the chosen references as well, so one of them can be kept', async () => {
        const a = await app({ flows: three() });
        a.store.dispatch({ type: 'selectAll', ids: [guid(10), guid(11), guid(12)] });
        studio(a);
        box(a.root, 'Ref 1').click();
        box(a.root, 'Ref 2').click();
        expect(qa(a.root, '.choice').map(o => o.getAttribute('aria-label'))).toEqual(['Use Ref 1', 'Use Ref 2', 'Use Ref 3']);
    });
    it('Review changes needs at least one source and a target', async () => {
        const a = await app({ flows: three() });
        a.store.dispatch({ type: 'selectAll', ids: [guid(10), guid(11)] });
        studio(a);
        expect(buttonByText(a.root, 'Review changes')!.disabled).toBe(true);
        box(a.root, 'Ref 1').click();
        box(a.root, 'Ref 2').click();
        expect(buttonByText(a.root, 'Review changes')!.disabled).toBe(true);
        (qa(a.root, '.choice').find(c => c.getAttribute('aria-label') === 'Use Ref 3') as HTMLElement).click();
        expect(buttonByText(a.root, 'Review changes')!.disabled).toBe(false);
    });
});

describe('one operation for several sources, written and read back', () => {
    it('every selected flow ends up on the one chosen reference, nothing else changes', async () => {
        const a = await app({ flows: three() });
        a.store.dispatch({ type: 'selectAll', ids: [guid(10), guid(11)] });
        a.store.dispatch({ type: 'setRepoint', from: ['sample_ref1', 'sample_ref2'], target: 'sample_ref3' });
        reviewChanges(a);
        await settle();
        expect(a.store.get().plan!.rows.map(r => [r.label, r.oldValue, r.newValue])).toEqual([['Alpha flow', 'sample_ref1, sample_ref2', 'sample_ref3'], ['Beta flow', 'sample_ref2', 'sample_ref3']]);
        buttonByText(a.root, 'Apply...')!.click();
        await settle();
        (q(a.root, '.modal .toggle') as HTMLElement).click();
        (qa(a.root, '.modal .btn--danger')[0] as HTMLButtonElement).click();
        a.advance(5000);
        await a.controller.idle();
        await settle(30);
        expect(a.calls.updates).toHaveLength(2);
        expect(names(a)).toEqual([['sample_ref3', 'sample_ref3'], ['sample_ref3'], ['sample_ref1', 'sample_ref4']]);
    });
});

describe('two categories in one run (feature 013)', () => {
    it('each flow is written once and ends on the new reference of every category it held', async () => {
        const { defaultReferences } = await import('./helpers/scenario');
        const { ref } = await import('./helpers/fixtures');
        const a = await app({ flows: three(), references: [...defaultReferences(), ref(5, { connectorId: '/providers/Microsoft.PowerApps/apis/shared_b' })] });
        a.store.dispatch({ type: 'selectAll', ids: [guid(10), guid(11), guid(12)] });
        studio(a);
        buttonByText(a.root, 'Select all')!.click();
        (qa(a.root, '.choice').find(c => c.getAttribute('aria-label') === 'Use Ref 3') as HTMLElement).click();
        (qa(a.root, '.studio-pipe-item')[1] as HTMLElement).click();
        buttonByText(a.root, 'Select all')!.click();
        (qa(a.root, '.choice').find(c => c.getAttribute('aria-label') === 'Use Ref 5') as HTMLElement).click();
        buttonByText(a.root, 'Review changes')!.click();
        await settle();
        expect(a.store.get().plan!.rows.map(r => r.blocked)).toEqual([undefined, undefined, undefined]);
        buttonByText(a.root, 'Apply...')!.click();
        await settle();
        (q(a.root, '.modal .toggle') as HTMLElement).click();
        (qa(a.root, '.modal .btn--danger')[0] as HTMLButtonElement).click();
        a.advance(5000);
        await a.controller.idle();
        await settle(30);
        expect(a.calls.updates).toHaveLength(3);
        expect(names(a)).toEqual([['sample_ref3', 'sample_ref3'], ['sample_ref3'], ['sample_ref3', 'sample_ref5']]);
        // regression from a hand test: the read-back check must understand several references per row
        expect(a.store.get().results!.map(r => [r.status, r.message])).toEqual([['done', 'Written and read back.'], ['done', 'Written and read back.'], ['done', 'Written and read back.']]);
    });
});
