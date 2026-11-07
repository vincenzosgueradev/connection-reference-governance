// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { clientData, flow, guid, ref } from './helpers/fixtures';
import { app, buttonByText, q, qa, REQUEST, settle } from './helpers/scenario';

/** Feature 022: clean up, end to end over the in-memory environment. Synthetic data only. */

type App = Awaited<ReturnType<typeof app>>;
const B = '/providers/Microsoft.PowerApps/apis/shared_b';
const flowOf = (n: number, names: string[]) => flow(n, names, { name: `Flow ${n}`, clientData: clientData(names, {}, REQUEST) });

/** ref1, ref2 and ref3 hold the same connection (ref2 in other capitals); ref4 is alone; ref5 has none. Flows 10 and 11 use ref1, flow 12 ref2. */
const refs = () => [ref(1, { connectionId: 'dup-conn' }), ref(2, { connectionId: 'DUP-CONN' }), ref(3, { connectionId: 'dup-conn' }), ref(4, { connectionId: 'solo' }), ref(5, { connectorId: B, connectionId: '' })];
const flows = () => [flowOf(10, ['sample_ref1']), flowOf(11, ['sample_ref1']), flowOf(12, ['sample_ref2'])];

async function opened(over: Parameters<typeof app>[0] = {}): Promise<App> {
    const a = await app({ references: refs(), flows: flows(), ...over });
    a.store.dispatch({ type: 'setView', view: 'references' });
    return a;
}
const clean = (a: App) => qa(a.root, 'button').find(b => b.getAttribute('aria-label') === 'Clean up references') as HTMLButtonElement;
const dialog = (a: App) => q(a.root, '.cleanup-dialog');
const footer = (a: App, text: string) => qa(dialog(a)!, '.modal-actions button').find(b => b.textContent!.trim() === text) as HTMLButtonElement | undefined;
const byLabel = (root: ParentNode, label: string) => qa(root, '[aria-label]').find(e => e.getAttribute('aria-label') === label) as HTMLButtonElement;
const tab = (a: App, label: string) => qa(dialog(a)!, '.segment').find(b => b.textContent!.startsWith(label))!;
const open = async (a: App) => {
    clean(a).click();
    await settle();
};

describe('the button', () => {
    it('is in the references view with how many things there are to clean (3 unused and 1 group), and not in the flows view', async () => {
        const a = await opened();
        expect(clean(a).textContent).toContain('4');
        expect(clean(a).title).toBe('3 unused, 1 duplicate group');
        a.store.dispatch({ type: 'setView', view: 'flows' });
        expect(clean(a)).toBeUndefined();
    });
    it('is locked on a managed solution and says why', async () => {
        const a = await opened();
        a.store.dispatch({ type: 'snapshotLoaded', snapshot: { ...a.store.get().snapshot!, solution: { ...a.store.get().snapshot!.solution, managed: true } } });
        expect(clean(a).disabled).toBe(true);
        expect(clean(a).title).toContain('managed');
    });
    it('says there is nothing to clean when every reference is used and none is a duplicate', async () => {
        const a = await opened({ references: [ref(1)], flows: [flowOf(10, ['sample_ref1'])] });
        expect(clean(a).title).toContain('Nothing to clean up');
        await open(a);
        expect(dialog(a)!.textContent).toContain('every one is used by a flow');
        tab(a, 'Duplicates').click();
        expect(dialog(a)!.textContent).toContain('No duplicates');
    });
});

describe('the dialog', () => {
    it('shows the figures and two tabs, opens on Unused, and writes nothing', async () => {
        const a = await opened();
        await open(a);
        expect(q(dialog(a)!, '.modal-title')!.textContent).toBe('Clean up connection references');
        expect(qa(dialog(a)!, '.fig').map(f => `${q(f, '.fig-value')!.textContent} ${q(f, '.fig-label')!.textContent}`)).toEqual(['3 Unused', '1 Duplicate groups', '1 Flows to re-point']);
        expect(tab(a, 'Unused').classList.contains('is-active')).toBe(true);
        expect(a.calls.updates).toEqual([]);
        expect(a.calls.created).toEqual([]);
    });
    it('Close, the close button and Escape close it, and write nothing', async () => {
        for (const how of ['close', 'x', 'escape']) {
            const a = await opened();
            await open(a);
            if (how === 'close') footer(a, 'Close')!.click();
            else if (how === 'x') byLabel(a.root, 'Close').click();
            else q(a.root, '.modal')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            expect(a.store.get().cleanup, how).toBeNull();
            expect(a.calls.updates, how).toEqual([]);
        }
    });
});

describe('the unused references', () => {
    it('lists only the references no flow uses, with their connector, connection and what is worth knowing', async () => {
        const a = await opened();
        await open(a);
        const rows = qa(dialog(a)!, '.cleanup-row');
        expect(rows.map(r => q(r, '.source-name')!.textContent)).toEqual(['Ref 3', 'Ref 4', 'Ref 5']); // ref1 and ref2 are used by flows
        expect(rows[0]!.textContent).toContain('dup-conn');
        expect(rows[0]!.textContent).toContain('Duplicate of Ref 1');
        expect(rows[2]!.textContent).toContain('No connection');
        expect(rows[2]!.textContent).toContain('Never connected');
    });
    it('Remove and Delete are closed until something is ticked; Select all and Clear work and the count follows', async () => {
        const a = await opened();
        await open(a);
        expect(footer(a, 'Remove from solution...')!.disabled).toBe(true);
        expect(footer(a, 'Delete...')!.disabled).toBe(true);
        expect(q(dialog(a)!, '.cleanup-count')!.textContent).toBe('0 of 3 ticked');
        buttonByText(dialog(a)!, 'Select all')!.click();
        expect(q(dialog(a)!, '.cleanup-count')!.textContent).toBe('3 of 3 ticked');
        expect(footer(a, 'Remove from solution...')!.disabled).toBe(false);
        buttonByText(dialog(a)!, 'Clear')!.click();
        expect(q(dialog(a)!, '.cleanup-count')!.textContent).toBe('0 of 3 ticked');
        byLabel(dialog(a)!, 'Tick Ref 4').click();
        expect(a.store.get().cleanup!.picked).toEqual([guid(4)]);
    });
    it('warns when some flows could not be read (they might use a reference that looks unused)', async () => {
        const bad = flow(13, [], { name: 'Broken', clientData: 'not json' });
        const a = await opened({ flows: [...flows(), bad] });
        await open(a);
        expect(dialog(a)!.textContent).toContain('1 flow could not be read');
    });
    it('Remove from solution opens the usual removal dialog with the ticked references, and nothing is written', async () => {
        const a = await opened();
        await open(a);
        byLabel(dialog(a)!, 'Tick Ref 4').click();
        byLabel(dialog(a)!, 'Tick Ref 5').click();
        footer(a, 'Remove from solution...')!.click();
        await a.controller.idle();
        await settle();
        expect(a.store.get().cleanup).not.toBeNull(); // the dialog stays behind the confirmation
        const plan = a.store.get().plan!;
        expect(plan.kind).toBe('remove');
        expect(plan.rows.map(r => r.id).sort()).toEqual([guid(4), guid(5)]);
        expect(plan.rows.every(r => r.blocked === undefined)).toBe(true);
        expect(qa(a.root, '.modal').pop()!.textContent).toContain('Ref 4');
        expect(a.calls.updates).toEqual([]);
    });
    it('Delete opens the usual delete dialog (code to unlock, dependency check) with the ticked references', async () => {
        const a = await opened();
        await open(a);
        byLabel(dialog(a)!, 'Tick Ref 3').click();
        footer(a, 'Delete...')!.click();
        await a.controller.idle();
        await settle();
        expect(a.store.get().plan!.kind).toBe('delete');
        expect(a.store.get().plan!.rows.map(r => r.id)).toEqual([guid(3)]);
        expect(a.store.get().confirmCode).toMatch(/^DELETE-/);
        expect(a.calls.updates).toEqual([]);
    });
    it('a managed reference is listed but cannot be ticked', async () => {
        const a = await opened({ references: [ref(1), ref(2, { managed: true })], flows: [flowOf(10, ['sample_ref1'])] });
        await open(a);
        const box = byLabel(dialog(a)!, 'Tick Ref 2');
        expect(box.disabled).toBe(true);
        expect(box.title).toBe('Managed: read-only.');
        expect(dialog(a)!.textContent).toContain('Managed');
    });
});

describe('the duplicates', () => {
    const cards = (a: App) => qa(dialog(a)!, '.dup-card');
    it('shows a card per group with the connector, the connection, who holds it and the suggested keeper', async () => {
        const a = await opened();
        await open(a);
        tab(a, 'Duplicates').click();
        expect(cards(a)).toHaveLength(1);
        const card = cards(a)[0]!;
        expect(card.textContent).toContain('dup-conn');
        expect(card.textContent).toContain('3 references share it');
        const choices = qa(card, '[role="radio"]');
        expect(choices.map(c => c.getAttribute('aria-label'))).toEqual(['Keep Ref 1', 'Keep Ref 2', 'Keep Ref 3']);
        expect(choices[0]!.getAttribute('aria-checked')).toBe('true'); // the most used
        expect(choices[0]!.textContent).toContain('Suggested');
        expect(choices[1]!.textContent).toContain('Used by 1 flow: Flow 12');
        expect(choices[2]!.textContent).toContain('No flow of this solution uses it');
    });
    it('says what a merge does, and changing the keeper changes it (and the button)', async () => {
        const a = await opened();
        await open(a);
        tab(a, 'Duplicates').click();
        expect(q(dialog(a)!, '.dup-effect')!.textContent).toContain('1 flow will be re-pointed to Ref 1');
        expect(q(dialog(a)!, '.dup-foot button')!.textContent).toBe('Merge into Ref 1...');
        byLabel(dialog(a)!, 'Keep Ref 3').click();
        expect(q(dialog(a)!, '.dup-effect')!.textContent).toContain('3 flows will be re-pointed to Ref 3');
        expect(q(dialog(a)!, '.dup-foot button')!.textContent).toBe('Merge into Ref 3...');
        expect(a.calls.updates).toEqual([]); // choosing writes nothing
    });
    it('a merge starts the re-point with its Preview: the flows and the reference are chosen, nothing is written before it is confirmed', async () => {
        const a = await opened();
        await open(a);
        tab(a, 'Duplicates').click();
        byLabel(dialog(a)!, 'Merge into Ref 1').click();
        await settle();
        expect(a.store.get().cleanup).toBeNull();
        const s = a.store.get();
        expect(s.wizard!.step).toBe('preview');
        expect(s.plan!.kind).toBe('repoint');
        expect(s.plan!.rows.map(r => r.id)).toEqual([guid(12)]); // only the flow that uses a duplicate
        expect([...s.cleanupFollowUp!.ids].sort()).toEqual([guid(2), guid(3)]);
        expect(a.calls.updates).toEqual([]);
    });
    it('with no flow to re-point it goes straight to the unused list with the duplicates ticked', async () => {
        const a = await opened({ flows: [flowOf(10, ['sample_ref1'])] });
        await open(a);
        tab(a, 'Duplicates').click();
        expect(q(dialog(a)!, '.dup-foot button')!.textContent).toBe('Review as unused...');
        byLabel(dialog(a)!, 'Review the duplicates of dup-conn as unused').click();
        expect(a.store.get().wizard).toBeNull();
        expect(a.store.get().cleanup).toMatchObject({ tab: 'unused' });
        expect([...a.store.get().cleanup!.picked].sort()).toEqual([guid(2), guid(3)]);
    });
    it('a managed duplicate is said to stay (it cannot be removed), and is still re-pointed away from', async () => {
        const a = await opened({ references: [ref(1, { connectionId: 'x' }), ref(2, { connectionId: 'x', managed: true })], flows: [flowOf(10, ['sample_ref1']), flowOf(11, ['sample_ref2'])] });
        await open(a);
        tab(a, 'Duplicates').click();
        expect(dialog(a)!.textContent).toContain('1 managed reference cannot be removed');
    });
});

describe('a whole clean up: merge the duplicates, then take them away', () => {
    it('re-points the flow of a duplicate (preview, confirm), then offers the duplicates, now unused, for removal with their own dialog', async () => {
        const a = await opened();
        await open(a);
        tab(a, 'Duplicates').click();
        byLabel(dialog(a)!, 'Merge into Ref 1').click();
        await settle();

        // first operation: the re-point, previewed and confirmed on its own
        buttonByText(a.root, 'Apply...')!.click();
        await settle();
        (q(a.root, '.modal .toggle') as HTMLElement).click();
        buttonByText(a.root, 'Apply to 1 flow')!.click();
        await a.controller.idle();
        await settle(60);
        expect(a.store.get().wizard!.step).toBe('result');
        expect(a.calls.updates).toHaveLength(1);
        expect(a.calls.updates[0]!.id).toBe(guid(12)); // the flow; no reference was written
        expect(a.calls.updates[0]!.record).toHaveProperty('clientdata');
        expect(JSON.parse(String(a.calls.updates[0]!.record['clientdata'])).properties.connectionReferences.shared_k0.connection.connectionReferenceLogicalName).toBe('sample_ref1');

        // the Result offers the second step; the references are not touched yet
        const next = buttonByText(a.root, 'Clean up the duplicates')!;
        expect(next).toBeDefined();
        expect(buttonByText(a.root, 'Back to solution')).toBeDefined();
        next.click();
        await settle();
        expect(a.store.get().view).toBe('references');
        expect(a.store.get().cleanup!.tab).toBe('unused');
        expect([...a.store.get().cleanup!.picked].sort()).toEqual([guid(2), guid(3)]); // both are unused now (the solution was read again)
        expect(qa(dialog(a)!, '.cleanup-row.is-on')).toHaveLength(2);

        // second operation: its own dialog
        footer(a, 'Remove from solution...')!.click();
        await a.controller.idle();
        await settle();
        const plan = a.store.get().plan!;
        expect(plan.kind).toBe('remove');
        expect(plan.rows.map(r => r.id).sort()).toEqual([guid(2), guid(3)]);
        expect(plan.rows.every(r => r.blocked === undefined)).toBe(true);
        expect(a.calls.updates).toHaveLength(1); // still only the flow: the removal is not confirmed yet
    });
    it('Back to solution leaves the merge without the second step, and the follow-up is forgotten', async () => {
        const a = await opened();
        await open(a);
        tab(a, 'Duplicates').click();
        byLabel(dialog(a)!, 'Merge into Ref 1').click();
        await settle();
        buttonByText(a.root, 'Apply...')!.click();
        await settle();
        (q(a.root, '.modal .toggle') as HTMLElement).click();
        buttonByText(a.root, 'Apply to 1 flow')!.click();
        await a.controller.idle();
        await settle(60);
        buttonByText(a.root, 'Back to solution')!.click();
        expect(a.store.get().cleanupFollowUp).toBeNull();
        expect(buttonByText(a.root, 'Clean up the duplicates')).toBeUndefined();
    });
    it('a re-point that is not confirmed (Back) leaves nothing written and no follow-up', async () => {
        const a = await opened();
        await open(a);
        tab(a, 'Duplicates').click();
        byLabel(dialog(a)!, 'Merge into Ref 1').click();
        await settle();
        buttonByText(a.root, 'Back')!.click();
        expect(a.store.get().cleanupFollowUp).toBeNull();
        expect(a.calls.updates).toEqual([]);
    });
});

describe('Remove and Delete open over the clean up dialog, not on another screen', () => {
    const tickAndDelete = async (a: App, ...names: string[]) => {
        await open(a);
        for (const n of names) byLabel(dialog(a)!, `Tick ${n}`).click();
        footer(a, 'Delete...')!.click();
        await a.controller.idle();
        await settle();
    };
    const modals = (a: App) => qa(a.root, '.modal');
    it('the confirmation is on top of the clean up dialog, which stays in the page behind it', async () => {
        const a = await opened();
        await tickAndDelete(a, 'Ref 4');
        expect(modals(a)).toHaveLength(2);
        expect(modals(a)[0]!.classList.contains('cleanup-dialog')).toBe(true); // behind
        expect(modals(a)[1]!.textContent).toContain('Delete 1 connection reference permanently'); // on top, the last in the page
        expect(a.store.get().view).toBe('references'); // no other screen
    });
    it('Cancel returns to the clean up as it was, with the same ticks, and nothing selected behind', async () => {
        const a = await opened();
        await tickAndDelete(a, 'Ref 4', 'Ref 5');
        buttonByText(modals(a)[1]!, 'Cancel')!.click();
        expect(modals(a)).toHaveLength(1);
        expect(dialog(a)).not.toBeNull();
        expect([...a.store.get().cleanup!.picked].sort()).toEqual([guid(4), guid(5)]);
        expect(qa(dialog(a)!, '.cleanup-row.is-on')).toHaveLength(2);
        expect(a.store.get().selected).toEqual([]);
        expect(a.store.get().plan).toBeNull();
        expect(a.calls.updates).toEqual([]);
    });
    it('Escape and the close button of the confirmation close only the confirmation', async () => {
        for (const how of ['escape', 'x']) {
            const a = await opened();
            await tickAndDelete(a, 'Ref 4');
            const top = modals(a)[1]!;
            if (how === 'escape') top.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            else (top.querySelector('.modal-close') as HTMLElement).click();
            expect(modals(a), how).toHaveLength(1);
            expect(a.store.get().cleanup, how).not.toBeNull();
        }
    });
    it('the focus goes to the confirmation, not to the dialog behind it', async () => {
        const a = await opened();
        await tickAndDelete(a, 'Ref 4');
        expect(modals(a)[1]!.contains(document.activeElement) || document.activeElement === document.body).toBe(true);
        expect(modals(a)[0]!.contains(document.activeElement) && document.activeElement !== document.body).toBe(false);
    });
    it('after the delete and its result, Back to solution opens the clean up again, without the reference that was deleted', async () => {
        const a = await opened();
        await tickAndDelete(a, 'Ref 4');
        a.store.dispatch({ type: 'setAck', on: true });
        a.store.dispatch({ type: 'setTypedCode', value: a.store.get().confirmCode });
        a.controller.confirm();
        await a.controller.idle();
        await settle(60);
        expect(a.store.get().wizard!.step).toBe('result');
        expect(dialog(a)).toBeNull(); // the Result is its own screen
        expect(a.refs.some(r => r.id === guid(4))).toBe(false); // really deleted
        buttonByText(a.root, 'Back to solution')!.click();
        await settle();
        expect(dialog(a)).not.toBeNull();
        expect(a.store.get().cleanup).toMatchObject({ tab: 'unused', picked: [] });
        expect(qa(dialog(a)!, '.cleanup-row').map(r => q(r, '.source-name')!.textContent)).toEqual(['Ref 3', 'Ref 5']); // read anew: Ref 4 is gone
    });
    it('a click does not replay the opening of either dialog; only a dialog that has just opened animates', async () => {
        const a = await opened();
        const overlays = () => qa(a.root, '.modal-overlay');
        qa(a.root, 'button').find(b => b.getAttribute('aria-label') === 'Clean up references')!.click();
        expect(overlays()).toHaveLength(1);
        expect(overlays()[0]!.classList.contains('no-anim')).toBe(false); // the first draw of a dialog that has just opened: it animates
        await settle();
        byLabel(dialog(a)!, 'Tick Ref 4').click(); // an interaction: a redraw
        expect(overlays().map(o => o.classList.contains('no-anim'))).toEqual([true]);
        footer(a, 'Delete...')!.click();
        await a.controller.idle();
        await settle();
        expect(overlays()).toHaveLength(2);
        for (const again of [{ type: 'setAck', on: true }, { type: 'setAck', on: false }, { type: 'setTypedCode', value: 'x' }] as const) {
            a.store.dispatch(again); // interactions in the confirmation: a redraw of both dialogs
            expect(overlays().map(o => o.classList.contains('no-anim')), again.type).toEqual([true, true]); // neither one flashes
        }
        // and an interaction behind it, in the dialog under the confirmation, does not make the confirmation flash either
        a.store.dispatch({ type: 'toggleCleanupDeps', id: guid(4) });
        expect(overlays().map(o => o.classList.contains('no-anim'))).toEqual([true, true]);
    });
});
