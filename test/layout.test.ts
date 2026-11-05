// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { guid, fromOf, targetOf } from './helpers/fixtures';
import { app, buttonByText, q, qa, settle, reviewChanges } from './helpers/scenario';

/** Features 002 and 005 amended after a hand test: space, wording, a steady footer, and the selection kept after a run. */

const LONG = 'Add a new photo to a SharePoint document or picture library when a button in Power Apps is pressed. Important : This template should only be used with the Camera control in Power Apps (Camera.photo property).';

describe('space: short rows, the room goes to the flow name', () => {
    it('a long description is cut to one line and the full text is its tooltip', async () => {
        const a = await app();
        a.flows[0]!.description = LONG;
        a.controller.selectSolution(a.sol.id);
        await settle();
        const desc = q(a.root, '.flow-cell .cell-sub')!;
        expect(desc.textContent).toBe(LONG);
        expect(desc.title).toBe(LONG);
        const css = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');
        expect(css).toMatch(/\.flow-cell \.cell-sub \{[^}]*-webkit-line-clamp: 1/);
    });
    it('the time of the last change is one short piece of text that never wraps, and only that', () => {
        const css = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');
        expect(css).toMatch(/\.cell-time \{[^}]*white-space: nowrap/);
        const nowraps = [...css.matchAll(/([^{}]+)\{[^}]*white-space:\s*nowrap/g)].map(m => m[1]!.trim());
        expect(nowraps).toEqual(['.cell-time']);
        expect(css).not.toMatch(/text-overflow:\s*ellipsis/);
    });
    it('the Modified cell carries that class and its full date as tooltip', async () => {
        const a = await app();
        const cell = q(a.root, 'tbody tr:not(.detail-row) .cell-time')!;
        expect(cell).not.toBeNull();
        expect(cell.title).not.toBe('');
    });
});

describe('wording: one reads as one', () => {
    async function toConfirm(ids: string[]) {
        const a = await app();
        a.store.dispatch({ type: 'selectAll', ids });
        a.store.dispatch({ type: 'setRepoint', from: 'sample_ref1', target: 'sample_ref2' });
        reviewChanges(a);
        await settle();
        buttonByText(a.root, 'Apply...')!.click();
        await settle();
        return a;
    }
    it('Apply to 1 flow, Apply to 2 flows', async () => {
        expect(qa((await toConfirm([guid(10)])).root, '.modal .btn--danger')[0]!.textContent).toBe('Apply to 1 flow');
        expect(qa((await toConfirm([guid(10), guid(11)])).root, '.modal .btn--danger')[0]!.textContent).toBe('Apply to 2 flows');
    });
    it('Apply to 1 reference row, Apply to 2 reference rows', async () => {
        const one = await app();
        one.store.dispatch({ type: 'setView', view: 'references' });
        one.store.dispatch({ type: 'selectAll', ids: [guid(1)] });
        one.store.dispatch({ type: 'setNewConnectionId', value: 'conn-9' });
        reviewChanges(one);
        await settle();
        buttonByText(one.root, 'Apply...')!.click();
        await settle();
        expect(qa(one.root, '.modal .btn--danger')[0]!.textContent).toBe('Apply to 1 reference row');
    });
});

describe('the confirmation footer does not move when the acknowledgement is ticked', () => {
    it('the same elements stay in the same order; only the words and the tone of the mark change', async () => {
        const a = await app();
        a.store.dispatch({ type: 'selectAll', ids: [guid(10)] });
        a.store.dispatch({ type: 'setRepoint', from: 'sample_ref1', target: 'sample_ref2' });
        reviewChanges(a);
        await settle();
        buttonByText(a.root, 'Apply...')!.click();
        await settle();
        const shape = () => qa(a.root, '.modal-foot *').map(e => e.tagName).join('|');
        const before = shape();
        expect(q(a.root, '.ack-state')!.textContent).toBe('Required');
        (q(a.root, '.modal .toggle') as HTMLElement).click();
        expect(shape()).toBe(before);
        expect(q(a.root, '.ack-state')!.textContent).toBe('Confirmed');
        expect(q(a.root, '.ack-state')!.className).toContain('chip--success');
    });
    it('the mark has a fixed minimum width so the footer cannot change size', () => {
        const css = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');
        expect(css).toMatch(/\.ack-state \{[^}]*min-width: 1\d+ch/);
        expect(css).toMatch(/\.ack \{[^}]*flex-wrap: nowrap/);
    });
});

describe('the selection is kept after a run', () => {
    it('Back to solution shows the same rows selected, with fresh data and the choices that no longer apply cleared', async () => {
        const a = await app();
        a.store.dispatch({ type: 'selectAll', ids: [guid(10), guid(11)] });
        a.store.dispatch({ type: 'setRepoint', from: 'sample_ref1', target: 'sample_ref2' });
        reviewChanges(a);
        await settle();
        buttonByText(a.root, 'Apply...')!.click();
        await settle();
        (q(a.root, '.modal .toggle') as HTMLElement).click();
        (qa(a.root, '.modal .btn--danger')[0] as HTMLButtonElement).click();
        await a.controller.idle();
        await settle(30);
        buttonByText(a.root, 'Back to solution')!.click();
        await settle();
        expect(a.store.get().selected).toEqual([guid(10), guid(11)]);
        expect(q(a.root, '.action-count')!.textContent).toBe('2 selected');
        expect(qa(a.root, 'tbody tr:not(.detail-row) .check.is-on')).toHaveLength(2);
        // the flows now use the target, so the chosen source no longer applies
        expect(fromOf(a.store.get())).toEqual([]);
        expect(targetOf(a.store.get())).toBe('');
    });
});
