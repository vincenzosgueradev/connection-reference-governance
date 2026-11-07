// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PANEL_ENTER_MS, PANEL_MS } from '../src/views/newReference';
import { planRemoval } from '../src/model/removal';
import { guid, targetOf } from './helpers/fixtures';
import { app, buttonByText, q, qa, settle } from './helpers/scenario';

/** Feature 021: a new connection reference from a side panel of the re-point dialog, end to end over the in-memory environment. */

type App = Awaited<ReturnType<typeof app>>;
const byLabel = (root: ParentNode, label: string) => qa(root, '[aria-label]').find(e => e.getAttribute('aria-label') === label) as HTMLInputElement;
const type = (a: App, label: string, value: string) => {
    const i = byLabel(a.root, label);
    i.value = value;
    i.dispatchEvent(new Event('input', { bubbles: true }));
};
const panel = (a: App) => q(a.root, '.newref-panel');
const inPanel = (a: App, text: string) => qa(panel(a)!, 'button').find(b => b.textContent!.trim() === text) as HTMLButtonElement | undefined;
const closed = () => settle(PANEL_MS + 60);
/** The slide is timed from Date.now: a test that looks at it holds the clock, so a slow machine cannot change the result. */
let now = 1_000_000;
const holdClock = () => {
    now = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
};
afterEach(() => vi.restoreAllMocks());
const card = (a: App, id: string) => qa(a.root, '.conn-item').find(c => c.textContent!.includes(id))!;
async function open(a: App) {
    a.store.dispatch({ type: 'selectAll', ids: [guid(10), guid(11), guid(12)] });
    buttonByText(a.root, 'Choose changes...')!.click();
    byLabel(a.root, 'Replace Ref 1').click();
    buttonByText(a.root, 'New reference')!.click();
    await a.controller.idle();
    await settle();
}
async function create(a: App, name = 'Brand New') {
    await open(a);
    type(a, 'Display name', name);
    inPanel(a, 'Review')!.click();
    inPanel(a, 'Create in Sample')!.click();
    await a.controller.idle();
    await settle();
}

describe('the side panel', () => {
    it('opens over the dialog with the connector fixed, steps, and the list untouched behind it', async () => {
        const a = await app();
        await open(a);
        expect(panel(a)!.getAttribute('role')).toBe('dialog');
        expect(q(a.root, '.modal .newref-panel')).not.toBeNull(); // inside the dialog box, so it can slide over it
        expect(q(a.root, '.newref-title')!.textContent).toBe('New connection reference');
        expect(qa(panel(a)!, 'select')).toHaveLength(0);
        expect(q(a.root, '.studio-pane--to .studio-pane-title')!.textContent).toBe('Reference to use instead');
        expect(q(a.root, '.newref-step.is-current')!.textContent).toBe('Details');
        expect(inPanel(a, 'Review')!.disabled).toBe(true);
        expect(a.calls.created).toEqual([]);
    });
    it('slides in once: a redraw during the slide continues it, one after it does not replay it', async () => {
        const a = await app();
        holdClock();
        a.store.dispatch({ type: 'selectAll', ids: [guid(10), guid(11), guid(12)] });
        buttonByText(a.root, 'Choose changes...')!.click();
        byLabel(a.root, 'Replace Ref 1').click();
        buttonByText(a.root, 'New reference')!.click(); // the panel opens already reading the connections: one draw, not two
        const layer = q(a.root, '.newref-layer')!;
        expect(layer.classList.contains('is-entering')).toBe(true);
        now += 80;
        type(a, 'Display name', 'x'); // a redraw during the slide: the same motion goes on from where it was
        expect(q(a.root, '.newref-layer')!.classList.contains('is-entering')).toBe(true);
        expect(q(a.root, '.newref-layer')!.style.getPropertyValue('--newref-elapsed')).toBe('-80ms');
        now += PANEL_ENTER_MS;
        type(a, 'Display name', 'xy');
        expect(q(a.root, '.newref-layer')!.classList.contains('is-entering')).toBe(false);
    });
    it('focuses Display name when it opens', async () => {
        const a = await app();
        holdClock();
        a.store.dispatch({ type: 'selectAll', ids: [guid(10), guid(11), guid(12)] });
        buttonByText(a.root, 'Choose changes...')!.click();
        byLabel(a.root, 'Replace Ref 1').click();
        buttonByText(a.root, 'New reference')!.click();
        expect(byLabel(a.root, 'Display name').dataset['autofocus']).toBe('true');
    });
    it('Cancel, the close button, the scrim and Escape close the panel (not the studio) after the motion, writing nothing', async () => {
        for (const how of ['cancel', 'close', 'scrim', 'escape']) {
            const a = await app();
            await open(a);
            if (how === 'cancel') inPanel(a, 'Cancel')!.click();
            else if (how === 'close') byLabel(a.root, 'Close new reference').click();
            else if (how === 'scrim') q(a.root, '.newref-scrim')!.click();
            else q(a.root, '.modal')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            expect(q(a.root, '.newref-layer')!.classList.contains('is-leaving'), how).toBe(true);
            await closed();
            expect(a.store.get().newReference, how).toBeNull();
            expect(a.store.get().studio, how).toBe(true);
            expect(a.calls.created, how).toEqual([]);
        }
    });
    it('Review is locked until the form is valid; the review step shows the exact record and what happens, without writing', async () => {
        const a = await app();
        await open(a);
        type(a, 'Display name', 'Brand New');
        expect(byLabel(a.root, 'Name').value).toBe('BrandNew');
        expect(q(a.root, '.newref-prefix')!.textContent).toBe('sample_');
        inPanel(a, 'Review')!.click();
        expect(q(a.root, '.newref-step.is-current')!.textContent).toBe('Review');
        const text = q(a.root, '.newref-summary')!.textContent!;
        expect(text).toContain('sample_BrandNew');
        expect(text).toContain('Test (Dev)');
        expect(qa(a.root, '.newref-flow-item')).toHaveLength(3);
        expect(a.calls.created).toEqual([]);
        inPanel(a, 'Back')!.click();
        expect(byLabel(a.root, 'Display name').value).toBe('Brand New');
    });
    it('shows a name that already exists as an error and keeps Review locked', async () => {
        const a = await app();
        await open(a);
        type(a, 'Display name', 'ref1');
        expect(q(a.root, '.newref-error')!.textContent).toContain('already exists');
        expect(inPanel(a, 'Review')!.disabled).toBe(true);
    });
    it('keeps the footer buttons outside the scrolling body (they never scroll away)', async () => {
        const a = await app();
        await open(a);
        expect(q(a.root, '.newref-panel > .newref-foot')).not.toBeNull();
        expect(q(a.root, '.newref-body footer')).toBeNull();
    });
    it('Review changes stays closed while the panel is open', async () => {
        const a = await app();
        await open(a);
        expect(buttonByText(a.root, 'Review changes')!.disabled).toBe(true);
    });
});

describe('the header', () => {
    it('shows the solution (yellow folder) and the connector as two rows, each with its logo and caption', async () => {
        const a = await app();
        await open(a);
        const rows = qa(a.root, '.newref-meta-row');
        expect(rows).toHaveLength(2);
        expect(rows[0]!.querySelector('.icon-folder.icon--folder')).not.toBeNull();
        expect(rows[0]!.querySelector('.newref-caption')!.textContent).toBe('Solution');
        expect(rows[0]!.querySelector('.newref-meta-name')!.textContent).toBe('Sample');
        expect(rows[1]!.querySelector('.newref-caption')!.textContent).toBe('Connector');
        expect(rows[1]!.querySelector('.newref-meta-name')!.textContent).not.toBe('');
    });
});

describe('the connections come from the environment', () => {
    it('reads them when the panel opens (environment id, then the list) and offers one card each, plus "No connection yet"', async () => {
        const a = await app();
        await open(a);
        expect(a.calls.connectionReads).toBe(1);
        expect(qa(a.root, '.newref-connections .conn-item').map(c => c.querySelector('.conn-fact--id, .choice-name')!.textContent).sort()).toEqual(['No connection yet', 'conn-1', 'conn-2', 'conn-3', 'conn-free']);
        expect(card(a, 'conn-4')).toBeUndefined(); // another connector's connection is never offered
    });
    it('each card has one fact per line with an icon (id, name, created, usage) and no emoji', async () => {
        const a = await app();
        await open(a);
        const facts = qa(card(a, 'conn-1'), '.conn-fact');
        expect(facts.map(f => f.querySelector('.icon')!.className.match(/icon-([a-z-]+)/)![1])).toEqual(['key', 'user', 'clock', 'plug']);
        expect(facts[0]!.textContent).toBe('conn-1');
        expect(facts[1]!.textContent).toBe('one@example.test');
        expect(facts[2]!.textContent).toBe('Created 2026-01-01');
        expect(facts[3]!.textContent).toBe('1 reference and 3 flows of this solution use it');
        expect(card(a, 'conn-free').textContent).toContain('Not used by any reference yet');
        expect(card(a, 'conn-1').textContent).not.toMatch(/\p{Extended_Pictographic}/u);
    });
    it('Used by is a separate button (not inside the radio), closed at first; it lists the references with their owner and the flows', async () => {
        const a = await app();
        await open(a);
        const toggle = card(a, 'conn-1').querySelector<HTMLButtonElement>('.conn-expander')!;
        expect(toggle.closest('[role="radio"]')).toBeNull();
        expect(toggle.getAttribute('aria-expanded')).toBe('false');
        expect(card(a, 'conn-1').querySelector('.conn-users')).toBeNull();
        expect(card(a, 'conn-free').querySelector('.conn-expander')).toBeNull(); // nobody uses it
        toggle.click();
        const c1 = card(a, 'conn-1');
        expect(c1.querySelector('.conn-expander')!.getAttribute('aria-expanded')).toBe('true');
        expect(c1.querySelector('.conn-user-name')!.textContent).toBe('Ref 1');
        expect(c1.querySelector('.conn-user-owner')!.textContent).toContain('Owner of the reference - Owner A - owner.a@example.test');
        expect(qa(c1, '.conn-flow').map(f => f.textContent)).toEqual(['Alpha flow', 'Beta flow', 'Gamma flow']);
        expect(a.store.get().newReference!.openConnections).toEqual(['conn-1']);
    });
    it('selecting a card sets the connection without opening it; Review then opens, and shows the connection as found', async () => {
        const a = await app();
        await open(a);
        byLabel(a.root, 'Use connection conn-2').click();
        expect(a.store.get().newReference!.connectionId).toBe('conn-2');
        expect(a.store.get().newReference!.openConnections).toEqual([]);
        expect(qa(panel(a)!, '.newref-note').map(n => n.textContent).join(' ')).toContain('Found: two@example.test');
        type(a, 'Display name', 'Brand New');
        inPanel(a, 'Review')!.click();
        expect(q(a.root, '.newref-summary')!.textContent).toContain('conn-2 (two@example.test), found');
    });
});

describe('pasting a connection id and checking it', () => {
    const paste = (a: App, v: string) => type(a, 'Paste a connection id', v);
    const checked = async (a: App) => {
        byLabel(a.root, 'Check connection').click();
        await a.controller.idle();
        await settle();
    };
    it('nothing is looked up while typing: no read, no verdict, no card selected, Review closed with a hint', async () => {
        const a = await app();
        await open(a);
        type(a, 'Display name', 'Brand New');
        paste(a, 'CONN-FREE'); // an id that exists
        paste(a, 'conn-free');
        expect(a.calls.connectionReads).toBe(1); // only the read made when the panel opened
        expect(card(a, 'conn-free').classList.contains('is-on')).toBe(false);
        expect(panel(a)!.textContent).toContain('Press Enter or the search icon to check this connection');
        expect(panel(a)!.textContent).not.toContain('Found');
        expect(qa(panel(a)!, '.newref-note--error')).toHaveLength(0); // a hint, not an error
        expect(inPanel(a, 'Review')!.disabled).toBe(true);
    });
    it('Enter in the field searches it, and a found one is selected', async () => {
        const a = await app();
        await open(a);
        type(a, 'Display name', 'Brand New');
        paste(a, 'conn-free');
        byLabel(a.root, 'Paste a connection id').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await a.controller.idle();
        await settle();
        expect(a.calls.connectionReads).toBe(2);
        expect(card(a, 'conn-free').classList.contains('is-on')).toBe(true);
        expect(inPanel(a, 'Review')!.disabled).toBe(false);
    });
    it('the search icon never disables itself (so it keeps the focus) and a second press while reading is ignored', async () => {
        const a = await app();
        await open(a);
        paste(a, 'conn-free');
        const icon = byLabel(a.root, 'Check connection');
        icon.click();
        expect(byLabel(a.root, 'Check connection').disabled).toBe(false); // reading, and still enabled
        expect(byLabel(a.root, 'Check connection').getAttribute('aria-busy')).toBe('true');
        byLabel(a.root, 'Check connection').click(); // ignored: a read is running
        byLabel(a.root, 'Refresh connections').click();
        await a.controller.idle();
        await settle();
        expect(a.calls.connectionReads).toBe(2); // one for opening, one for the search
    });
    it('the search keeps the scroll of the panel and never hands the focus to the first field', async () => {
        const a = await app();
        holdClock();
        await open(a);
        now += PANEL_ENTER_MS + 60;
        a.store.dispatch({ type: 'setNewReferenceField', field: 'description', value: '' }); // a redraw after the slide
        expect(byLabel(a.root, 'Display name').dataset['autofocus']).toBeUndefined(); // only the opening gives it the focus
        q(a.root, '.newref-body')!.scrollTop = 260;
        paste(a, 'conn-free');
        byLabel(a.root, 'Paste a connection id').focus();
        await checked(a);
        expect(q(a.root, '.newref-body')!.scrollTop).toBe(260);
        expect(document.activeElement === byLabel(a.root, 'Display name')).toBe(false);
    });
    it('an id that does not exist is an error and Review stays locked', async () => {
        const a = await app();
        await open(a);
        type(a, 'Display name', 'Brand New');
        paste(a, 't666666666666666666');
        await checked(a);
        expect(a.calls.connectionReads).toBe(2); // Check reads the connections again
        expect(panel(a)!.textContent).toContain('was not found among your connections');
        expect(qa(panel(a)!, '.newref-note--error')).toHaveLength(1); // now it is a result, so an error
        paste(a, 't66666666666666666'); // other text: the result no longer counts
        expect(panel(a)!.textContent).toContain('Press Enter or the search icon');
        expect(inPanel(a, 'Review')!.disabled).toBe(true);
    });
    it('an id that exists is accepted (the card is selected), even typed in other capitals or as a whole resource id', async () => {
        const a = await app();
        await open(a);
        type(a, 'Display name', 'Brand New');
        paste(a, '/providers/Microsoft.PowerApps/apis/shared_a/connections/CONN-FREE');
        await checked(a);
        expect(card(a, 'conn-free').classList.contains('is-on')).toBe(true);
        expect(panel(a)!.textContent).toContain('Found: free@example.test');
        expect(inPanel(a, 'Review')!.disabled).toBe(false);
    });
    it('a connection of another connector is refused', async () => {
        const a = await app();
        await open(a);
        type(a, 'Display name', 'Brand New');
        paste(a, 'conn-4');
        await checked(a);
        expect(panel(a)!.textContent).toContain('belongs to another connector');
        expect(inPanel(a, 'Review')!.disabled).toBe(true);
    });
    it('Enter in the field checks it too', async () => {
        const a = await app();
        await open(a);
        paste(a, 'ghost');
        byLabel(a.root, 'Paste a connection id').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await a.controller.idle();
        expect(a.calls.connectionReads).toBe(2);
    });
    it('when the connections cannot be read nothing can be verified: only "No connection yet" is left, and the panel says why', async () => {
        const a = await app({ connections: 'unavailable' });
        await open(a);
        expect(panel(a)!.textContent).toContain('could not be read');
        expect(qa(a.root, '.newref-connections .conn-item')).toHaveLength(1);
        type(a, 'Display name', 'Brand New');
        paste(a, 'conn-1');
        await checked(a);
        expect(inPanel(a, 'Review')!.disabled).toBe(true);
        expect(panel(a)!.textContent).toContain('cannot be verified');
        byLabel(a.root, 'No connection yet').click();
        expect(inPanel(a, 'Review')!.disabled).toBe(false);
    });
    it('the same when the environment id cannot be read', async () => {
        const a = await app({ noEnvironmentId: true });
        await open(a);
        expect(a.store.get().newReference!.live.status).toBe('unavailable');
        expect(a.calls.connectionReads).toBe(0);
    });
    it('Refresh reads them again and picks up a connection made in the meantime', async () => {
        const conns = [{ name: 'only', connector: 'shared_a', displayName: 'only@example.test' }];
        const a = await app({ connections: conns });
        await open(a);
        expect(qa(a.root, '.newref-connections .conn-item')).toHaveLength(2);
        conns.push({ name: 'made-later', connector: 'shared_a', displayName: 'later@example.test' });
        byLabel(a.root, 'Refresh connections').click();
        await a.controller.idle();
        await settle();
        expect(qa(a.root, '.newref-connections .conn-item')).toHaveLength(3);
    });
    it('says so when the user has no connection for the connector', async () => {
        const a = await app({ connections: [{ name: 'b', connector: 'shared_b', displayName: 'x' }] });
        await open(a);
        expect(panel(a)!.textContent).toContain('You have no');
    });
});

describe('suggestions', () => {
    it('are offered at the top, each with its style, display name, logical name and description', async () => {
        const a = await app();
        await open(a);
        const cards = qa(a.root, '.sugg');
        expect(cards.map(c => c.querySelector('.sugg-label')!.textContent)).toEqual(['Maker style', 'Readable']);
        expect(cards[0]!.querySelector('.sugg-logical')!.textContent).toMatch(/^sample_shareda_[0-9a-f]{5}$/);
        expect(cards[1]!.querySelector('.sugg-display')!.textContent).toContain(' - Sample');
        expect(cards[1]!.querySelector('.sugg-desc')!.textContent).toContain('Sample');
    });
    it('one click fills the display name, the name and the description, and Review opens', async () => {
        const a = await app();
        await open(a);
        byLabel(a.root, 'Use suggestion Readable').click();
        expect(byLabel(a.root, 'Display name').value).toContain(' - Sample');
        expect(byLabel(a.root, 'Name').value).toMatch(/Sample$/);
        expect(byLabel(a.root, 'Description').value).toContain('Sample');
        expect(inPanel(a, 'Review')!.disabled).toBe(false);
    });
    it('Auto-fill applies the first one', async () => {
        const a = await app();
        await open(a);
        inPanel(a, 'Auto-fill')!.click();
        expect(byLabel(a.root, 'Name').value).toMatch(/^shareda_[0-9a-f]{5}$/);
    });
    it('a third one by account appears once a connection is chosen', async () => {
        const a = await app();
        await open(a);
        byLabel(a.root, 'Use connection conn-2').click();
        expect(qa(a.root, '.sugg .sugg-label').map(x => x.textContent)).toEqual(['Maker style', 'Readable', 'By account']);
        byLabel(a.root, 'Use suggestion By account').click();
        expect(byLabel(a.root, 'Display name').value).toContain('two@example.test');
    });
    it('are not shown in the review step', async () => {
        const a = await app();
        await open(a);
        type(a, 'Display name', 'x');
        inPanel(a, 'Review')!.click();
        expect(qa(a.root, '.sugg')).toHaveLength(0);
    });
});

describe('creating from the panel', () => {
    it('creates the reference, adds it to the solution, closes the panel and selects it as the one to use instead', async () => {
        const a = await app();
        await create(a);
        expect(a.calls.created).toHaveLength(1);
        expect(a.calls.created[0]).toMatchObject({ connectionreferencelogicalname: 'sample_BrandNew', connectorid: '/providers/Microsoft.PowerApps/apis/shared_a' });
        expect(a.calls.added).toEqual([{ solution: 'sample', id: expect.any(String), type: 10001 }]);
        expect(a.store.get().newReference).toBeNull();
        expect(q(a.root, '.newref-panel')).toBeNull();
        expect(targetOf(a.store.get())).toBe('sample_BrandNew');
        const choice = qa(a.root, '.studio-pane--to .choice').find(c => c.getAttribute('aria-label') === 'Use Brand New')!;
        expect(choice.getAttribute('aria-checked')).toBe('true');
        expect(a.calls.updates).toEqual([]); // creating a reference changes no flow
    });
    it('the new reference can be removed and deleted at once, without a refresh (its component type is kept)', async () => {
        const a = await app();
        await create(a);
        const snap = a.store.get().snapshot!;
        const made = snap.allReferences.find(r => r.logicalName === 'sample_BrandNew')!;
        expect(snap.componentTypes[made.id.toLowerCase()]).toBe(10001); // the type the environment stored for the members
        for (const kind of ['remove', 'delete'] as const) {
            const row = planRemoval(snap, [made.id], kind, kind === 'delete' ? { [made.id]: [] } : undefined).rows[0]!;
            expect(row.blocked, kind).toBeUndefined();
            expect(row.componentType, kind).toBe(10001);
        }
    });
    it('writes the verified connection into the record', async () => {
        const a = await app();
        await open(a);
        byLabel(a.root, 'Use connection conn-free').click();
        type(a, 'Display name', 'Brand New');
        inPanel(a, 'Review')!.click();
        inPanel(a, 'Create in Sample')!.click();
        await a.controller.idle();
        await settle();
        expect(a.calls.created[0]).toMatchObject({ connectionid: 'conn-free' });
        expect(a.calls.connectionReads).toBe(2); // when the panel opened, and again just before the write
    });
    it('refuses to write when the connection has disappeared since it was chosen (checked again just before)', async () => {
        const conns = [{ name: 'gone-soon', connector: 'shared_a', displayName: 'g@example.test' }];
        const a = await app({ connections: conns });
        await open(a);
        byLabel(a.root, 'Use connection gone-soon').click();
        type(a, 'Display name', 'Brand New');
        inPanel(a, 'Review')!.click();
        conns.length = 0; // deleted in the meantime
        inPanel(a, 'Create in Sample')!.click();
        await a.controller.idle();
        await settle();
        expect(a.calls.created).toEqual([]);
        expect(a.store.get().newReference!.error).toContain('not found among your connections; nothing was created');
    });
    it('keeps the panel and what was typed, and says why, when the creation fails', async () => {
        const a = await app({ failCreate: 'The environment said no.' });
        await create(a);
        expect(a.store.get().newReference).toMatchObject({ displayName: 'Brand New', saving: false, reviewing: false });
        expect(panel(a)!.textContent).toContain('The environment said no.');
    });
    it('rolls the row back when it cannot be added to the solution', async () => {
        const a = await app({ failAdd: 'refused' });
        await create(a);
        expect(a.refs.some(r => r.logicalName === 'sample_BrandNew')).toBe(false);
        expect(a.store.get().newReference!.error).toContain('deleted again');
    });
    it('cannot be closed while the row is being written', async () => {
        const a = await app();
        await open(a);
        type(a, 'Display name', 'Brand New');
        inPanel(a, 'Review')!.click();
        a.store.dispatch({ type: 'newReferenceSaving' });
        expect(byLabel(a.root, 'Close new reference').disabled).toBe(true);
        q(a.root, '.modal')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        q(a.root, '.newref-scrim')!.click();
        await closed();
        expect(a.store.get().newReference).not.toBeNull();
        expect(a.store.get().studio).toBe(true);
    });
    it('changing category closes the panel', async () => {
        const a = await app();
        await open(a);
        a.store.dispatch({ type: 'studioGo', step: 1 });
        expect(a.store.get().newReference).toBeNull();
        expect(a.calls.created).toEqual([]);
    });
    it('a list that arrives after the panel was closed is ignored', async () => {
        const a = await app();
        a.store.dispatch({ type: 'selectAll', ids: [guid(10), guid(11), guid(12)] });
        buttonByText(a.root, 'Choose changes...')!.click();
        byLabel(a.root, 'Replace Ref 1').click();
        buttonByText(a.root, 'New reference')!.click();
        a.store.dispatch({ type: 'closeNewReference' }); // closed before the answer came
        await a.controller.idle();
        await settle();
        expect(a.store.get().newReference).toBeNull();
    });
});

describe('room, scroll and feedback (hand test 3)', () => {
    const body = (a: App) => q(a.root, '.newref-body')!;
    it('keeps the scroll of the panel body on a click, on typing and when the list arrives', async () => {
        const a = await app();
        await open(a);
        body(a).scrollTop = 240;
        byLabel(a.root, 'Use connection conn-2').click(); // a redraw
        expect(body(a).scrollTop).toBe(240);
        qa(a.root, '.conn-expander').find(b => b.getAttribute('aria-label') === 'Used by, connection conn-1')!.click();
        expect(body(a).scrollTop).toBe(240);
        type(a, 'Description', 'x');
        expect(body(a).scrollTop).toBe(240);
    });
    it('opens the other step at the top (Details to Review, and back)', async () => {
        const a = await app();
        await open(a);
        type(a, 'Display name', 'Brand New');
        body(a).scrollTop = 300;
        inPanel(a, 'Review')!.click();
        expect(body(a).scrollTop).toBe(0);
        body(a).scrollTop = 120;
        inPanel(a, 'Back')!.click();
        expect(body(a).scrollTop).toBe(0);
    });
    it('a suggestion is marked Applied, the list folds into one line, and the fields it filled stay in view', async () => {
        const a = await app();
        await open(a);
        expect(qa(a.root, '.sugg')).toHaveLength(2);
        byLabel(a.root, 'Use suggestion Readable').click();
        expect(qa(a.root, '.sugg')).toHaveLength(0); // folded
        expect(q(a.root, '.newref-applied')!.textContent).toBe('Suggestion applied: Readable');
        expect(byLabel(a.root, 'Display name').value).toContain(' - Sample');
        byLabel(a.root, 'Show suggestions').click(); // opened again on request: the applied one is marked
        const applied = qa(a.root, '.sugg.is-applied');
        expect(applied).toHaveLength(1);
        expect(applied[0]!.querySelector('.sugg-badge')!.textContent).toBe('Applied');
        expect(applied[0]!.getAttribute('aria-pressed')).toBe('true');
        expect(applied[0]!.querySelector('.sugg-label')!.textContent).toBe('Readable');
    });
    it('editing a field removes the mark: the bar goes back to "Suggestions"', async () => {
        const a = await app();
        await open(a);
        inPanel(a, 'Auto-fill')!.click();
        expect(q(a.root, '.newref-applied')!.textContent).toBe('Suggestion applied: Maker style');
        type(a, 'Description', 'my own words');
        expect(q(a.root, '.newref-applied')).toBeNull();
        expect(q(a.root, '.newref-suggest .newref-section')!.textContent).toBe('Suggestions');
    });
    it('Hide and Show fold and open the list without changing the fields', async () => {
        const a = await app();
        await open(a);
        byLabel(a.root, 'Hide suggestions').click();
        expect(qa(a.root, '.sugg')).toHaveLength(0);
        expect(byLabel(a.root, 'Display name').value).toBe('');
        byLabel(a.root, 'Show suggestions').click();
        expect(qa(a.root, '.sugg')).toHaveLength(2);
    });
    it('the header is one row (title, steps, close) and the solution and the connector sit side by side', async () => {
        const a = await app();
        await open(a);
        expect(q(a.root, '.newref-head .newref-steps')).not.toBeNull();
        expect(q(a.root, '.newref-panel > .newref-steps')).toBeNull();
        expect(q(a.root, '.newref-meta')!.children).toHaveLength(2);
    });
});

describe('a visible wait (hand test 5)', () => {
    const states = (a: App) => qa(a.root, '.newref-flow-item').map(li => li.dataset['state']);
    /** A gate: the write stops where the test wants to look at the screen. */
    const gate = () => {
        let release!: () => void;
        const wait = new Promise<void>(r => { release = r; });
        return { wait: () => wait, release };
    };
    const toReview = async (a: App) => {
        await open(a);
        type(a, 'Display name', 'Brand New');
        inPanel(a, 'Review')!.click();
    };
    it('before Create the three lines are plain (idle), with no spinner and no bar', async () => {
        const a = await app();
        await toReview(a);
        expect(states(a)).toEqual(['idle', 'idle', 'idle']);
        expect(q(a.root, '.newref-progress')).toBeNull();
        expect(qa(panel(a)!, '.spinner')).toHaveLength(0);
    });
    it('while the row is created: the first line is done, the second is active with a spinner, the third pending', async () => {
        const g = gate();
        const a = await app({ beforeCreate: g.wait });
        await toReview(a);
        inPanel(a, 'Create in Sample')!.click();
        await settle();
        expect(states(a)).toEqual(['done', 'active', 'pending']);
        expect(qa(a.root, '.newref-flow-item.is-active .spinner')).toHaveLength(1);
        g.release();
        await a.controller.idle();
    });
    it('while it is added to the solution the third line becomes active, the second is done', async () => {
        const g = gate();
        const a = await app({ beforeAdd: g.wait });
        await toReview(a);
        inPanel(a, 'Create in Sample')!.click();
        await settle();
        // the write has created the row and is now adding it; the read back is announced only when it is reached
        expect(['active', 'done']).toContain(states(a)[1]);
        g.release();
        await a.controller.idle();
        await settle();
    });
    it('the button has a spinner and says Creating..., a progress bar runs over the footer, and nothing can be closed', async () => {
        const g = gate();
        const a = await app({ beforeCreate: g.wait });
        await toReview(a);
        inPanel(a, 'Create in Sample')!.click();
        await settle();
        const create = inPanel(a, 'Creating...')!;
        expect(create.disabled).toBe(true);
        expect(create.getAttribute('aria-busy')).toBe('true');
        expect(create.querySelector('.spinner')).not.toBeNull();
        const bar = q(a.root, '.newref-progress')!;
        expect(bar.getAttribute('role')).toBe('progressbar');
        expect(bar.nextElementSibling!.classList.contains('newref-foot')).toBe(true); // right above the footer
        expect(inPanel(a, 'Back')!.disabled).toBe(true);
        expect(byLabel(a.root, 'Close new reference').disabled).toBe(true);
        g.release();
        await a.controller.idle();
    });
    it('the timeline is a polite live region', async () => {
        const a = await app();
        await toReview(a);
        expect(q(a.root, '.newref-flow')!.getAttribute('aria-live')).toBe('polite');
    });
    it('on success all three lines are done and the button says Created for a moment, then the panel closes', async () => {
        const a = await app({ celebrateMs: 120 });
        await toReview(a);
        inPanel(a, 'Create in Sample')!.click();
        await settle(60); // written, now shown as finished
        expect(states(a)).toEqual(['done', 'done', 'done']);
        const finished = inPanel(a, 'Created')!;
        expect(finished.classList.contains('is-finished')).toBe(true);
        expect(finished.querySelector('.icon-check')).not.toBeNull();
        expect(q(a.root, '.newref-progress')).toBeNull(); // the bar stops with the write
        expect(a.store.get().newReference).not.toBeNull(); // still open: the result is seen
        await a.controller.idle();
        await settle();
        expect(a.store.get().newReference).toBeNull();
        expect(targetOf(a.store.get())).toBe('sample_BrandNew');
    });
    it('on a failure the lines go back to plain, the bar and the spinner stop, and the error is shown', async () => {
        const a = await app({ failCreate: 'The environment said no.' });
        await toReview(a);
        inPanel(a, 'Create in Sample')!.click();
        await a.controller.idle();
        await settle();
        expect(q(a.root, '.newref-progress')).toBeNull();
        expect(qa(panel(a)!, '.spinner')).toHaveLength(0);
        expect(panel(a)!.textContent).toContain('The environment said no.');
        expect(a.store.get().newReference).toMatchObject({ saving: false, step: '' });
    });
});
