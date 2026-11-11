import { checkForm, connectionChoices, isApplied, logicalNameOf, prefixFor, suggestions, type ConnectionChoice, type NewReferenceForm, type Suggestion } from '../model/newReference';
import { normalizeConnectionName } from '../model/liveConnections';
import { connectorInfo } from '../model/connectors';
import type { Store } from '../state/store';
import type { Snapshot } from '../types';
import { button, el, icon } from '../ui/components';
import type { DependencyState } from '../model/dependencies';
import { connectorTile } from './connections';
import { dependenciesBlock, readingLine } from './dependencies';
import type { Handlers } from './main';

/**
 * The side panel of a new connection reference (feature 021). It slides in from the right over the studio. It never
 * writes by itself: Review shows the exact record, and only the Create button after it asks the controller to write.
 */

type Field = 'displayName' | 'name' | 'description' | 'connectionId';

/** Length of the slide, in ms; closing waits this long so the motion can be seen. */
export const PANEL_MS = 170;

/** Length of the slide in, in ms. */
export const PANEL_ENTER_MS = 220;

/**
 * When the panel opened (0 when closed). A redraw during the slide (the list of connections arriving) must not restart it
 * nor snap it to the end: the new element continues the same motion from where it was (a negative animation delay).
 */
let openedAt = 0;
export function resetPanelMotion(): void {
    openedAt = 0;
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;
const day = (iso: string): string => (iso.length >= 10 ? iso.slice(0, 10) : iso);

function note(text: string, tone: 'info' | 'warn' | 'error' | 'ok' = 'info'): HTMLElement {
    const n = el('p', `newref-note${tone === 'warn' ? ' newref-note--warn' : tone === 'error' ? ' newref-note--error' : tone === 'ok' ? ' newref-note--ok' : ''}`);
    n.append(icon(tone === 'warn' ? 'alert-triangle' : tone === 'error' ? 'x-circle' : tone === 'ok' ? 'check-circle' : 'info', 'icon--sm'), el('span', '', text));
    return n;
}

function labelled(label: string, control: HTMLElement, opts: { required?: boolean; error?: string; hint?: string } = {}): HTMLElement {
    const box = el('div', 'newref-field');
    const head = el('span', 'newref-label', label);
    if (opts.required) head.append(el('span', 'newref-req', ' *'));
    box.append(head, control);
    if (opts.hint) box.append(el('span', 'newref-hint', opts.hint));
    if (opts.error) box.append(el('span', 'newref-error', opts.error));
    return box;
}

function input(store: Store, field: Field, label: string, value: string, placeholder = ''): HTMLInputElement {
    const node = el('input', 'text-input newref-input');
    node.type = 'text';
    node.value = value;
    node.placeholder = placeholder;
    node.autocomplete = 'off';
    node.spellcheck = false;
    node.setAttribute('aria-label', label);
    node.addEventListener('input', () => store.dispatch({ type: 'setNewReferenceField', field, value: node.value }));
    return node;
}


/** The kit's spinner; `onPrimary` makes it readable on a solid primary button. */
function spinner(onPrimary = false): HTMLElement {
    const s = el('span', onPrimary ? 'spinner newref-spinner--on-primary' : 'spinner');
    s.setAttribute('aria-hidden', 'true');
    return s;
}

function fact(glyph: string, text: string, extra = ''): HTMLElement {
    const f = el('div', `conn-fact${extra ? ` ${extra}` : ''}`);
    f.append(icon(glyph, 'icon--sm'), el('span', '', text));
    return f;
}

/**
 * One connection of the user: a card with one fact per line (id, name, created, usage) that selects it, and an expander
 * that lists every reference holding it (with the owner of the reference and their email) and the flows of this solution
 * that use each. The expander is a sibling of the radio, never inside it (a button cannot hold a button).
 */
interface DependencyContext {
    readonly h: Handlers;
    readonly deps: Readonly<Record<string, DependencyState>>;
}

/** The total over every reference that holds a connection: one line, once all of them have been read. */
function connectionDependencies(c: ConnectionChoice, ctx: DependencyContext): HTMLElement {
    const box = el('div', 'dep-connection');
    const states = c.users.map(u => ctx.deps[u.id]);
    const go = button('Check every dependency of this connection', 'secondary', () => void ctx.h.checkDependencies(c.users.map(u => u.id)), true);
    go.prepend(icon('search', 'icon--sm'));
    go.setAttribute('aria-label', `Check every dependency of connection ${c.id}`);
    if (states.some(s => s?.status === 'loading')) {
        box.append(readingLine(`Reading what depends on the ${c.users.length === 1 ? 'reference' : 'references'} that hold this connection...`));
        return box;
    }
    if (states.every(s => s?.status === 'ready')) {
        // distinct components over all the references (one may depend on two of them): 1 in the open solution, 0 outside
        const all = new Map<string, number>();
        for (const s of states) if (s?.status === 'ready') for (const d of s.report.items) all.set(d.id, d.inOpenSolution ? 1 : 0);
        const total = all.size;
        const outside = [...all.values()].filter(x => x === 0).length;
        const line = el('p', 'dep-note');
        line.append(icon(total === 0 ? 'check-circle' : outside > 0 ? 'alert-triangle' : 'info', `icon--sm ${total === 0 ? 'icon--success' : outside > 0 ? 'icon--warning' : 'icon--primary'}`), el('span', '', total === 0
            ? 'Nothing depends on the references that hold this connection, anywhere in the environment.'
            : `${total} ${total === 1 ? 'component depends' : 'components depend'} on the references that hold this connection: ${total - outside} in this solution, ${outside} outside.`));
        box.append(line, go);
        go.textContent = 'Check again';
        go.prepend(icon('refresh', 'icon--sm'));
        return box;
    }
    box.append(go);
    return box;
}

function connectionCard(store: Store, c: ConnectionChoice, selected: boolean, open: boolean, ctx: DependencyContext): HTMLElement {
    const card = el('div', selected ? 'conn-item is-on' : 'conn-item');
    const facts = el('span', 'conn-facts');
    facts.append(fact('key', c.id, 'conn-fact--id'));
    if (c.displayName !== '') facts.append(fact('user', c.displayName));
    if (c.createdTime !== '') facts.append(fact('clock', `Created ${day(c.createdTime)}`));
    facts.append(fact('plug', c.users.length === 0 ? 'Not used by any reference yet' : `${plural(c.users.length, 'reference')} and ${plural(c.flowCount, 'flow')} of this solution use it`));
    const pick = el('button', 'choice choice--compact' + (selected ? ' is-on' : ''));
    pick.type = 'button';
    pick.setAttribute('role', 'radio');
    pick.setAttribute('aria-checked', String(selected));
    pick.setAttribute('aria-label', `Use connection ${c.id}`);
    pick.append(el('span', 'choice-mark'), facts);
    pick.addEventListener('click', () => store.dispatch({ type: 'pickConnection', id: c.id }));
    card.append(pick);
    if (c.users.length === 0) return card;

    const toggle = el('button', 'conn-expander');
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', `Used by, connection ${c.id}`);
    toggle.append(icon('users', 'icon--sm'), el('span', '', open ? 'Hide who uses it' : 'Used by'), icon('chevron-down', 'icon--sm'));
    toggle.addEventListener('click', () => store.dispatch({ type: 'toggleNewReferenceConnection', id: c.id }));
    card.append(toggle);

    if (open) {
        const list = el('ul', 'conn-users');
        const total = el('li', 'conn-user conn-user--total');
        total.append(connectionDependencies(c, ctx));
        list.append(total);
        for (const u of c.users) {
            const li = el('li', 'conn-user');
            const name = el('div', 'conn-user-name');
            name.append(icon('plug', 'icon--sm icon--primary'), el('span', '', u.displayName));
            li.append(name, el('div', 'conn-user-logical', u.logicalName));
            if (u.ownerName !== '' || u.ownerEmail !== '') li.append(el('div', 'conn-user-owner', ['Owner of the reference', u.ownerName, u.ownerEmail].filter(x => x !== '').join(' - ')));
            if (u.flows.length === 0) li.append(el('div', 'conn-none', 'No flow of this solution uses it.'));
            else {
                const flows = el('ul', 'conn-flows');
                for (const f of u.flows) {
                    const row = el('li', 'conn-flow');
                    row.append(icon('workflow', 'icon--sm icon--muted'), el('span', '', f));
                    flows.append(row);
                }
                li.append(flows);
            }
            // everything that depends on this reference, in any solution (feature 023), on request
            li.append(dependenciesBlock({ state: ctx.deps[u.id], subject: 'this reference', onCheck: () => void ctx.h.checkDependencies([u.id]), name: u.displayName }));
            list.append(li);
        }
        card.append(list);
    }
    return card;
}

/** A ready-made name and description (feature 021, suggestions): one click fills the display name, the name and the description. */
function suggestionCard(store: Store, prefix: string, s: Suggestion, applied: boolean): HTMLElement {
    const node = el('button', applied ? 'sugg is-applied' : 'sugg');
    node.type = 'button';
    node.setAttribute('aria-label', `Use suggestion ${s.label}`);
    const text = el('span', 'sugg-text');
    text.append(el('span', 'sugg-label', s.label), el('span', 'sugg-display', s.displayName), el('span', 'sugg-logical', logicalNameOf(prefix, s.name)), el('span', 'sugg-desc', s.description));
    node.append(icon(applied ? 'check-circle' : 'zap', 'icon--sm icon--primary'), text);
    if (applied) node.append(el('span', 'sugg-badge', 'Applied'));
    node.setAttribute('aria-pressed', String(applied));
    node.addEventListener('click', () => store.dispatch({ type: 'applySuggestion', suggestion: s }));
    return node;
}

function line(label: string, value: string): HTMLElement {
    const r = el('div', 'newref-row');
    r.append(el('dt', 'newref-key', label), el('dd', 'newref-value', value));
    return r;
}

function steps(reviewing: boolean): HTMLElement {
    const list = el('ol', 'newref-steps');
    list.setAttribute('aria-label', 'Steps');
    [['Details', 'edit'], ['Review', 'eye']].forEach(([name, glyph], i) => {
        const done = reviewing && i === 0;
        const current = i === (reviewing ? 1 : 0);
        const li = el('li', `newref-step${current ? ' is-current' : ''}${done ? ' is-done' : ''}`);
        if (current) li.setAttribute('aria-current', 'step');
        li.append(done ? icon('check', 'icon--sm') : icon(glyph!, 'icon--sm'), el('span', '', name));
        list.append(li);
    });
    return list;
}

/** Plays the closing motion, then runs `then`. */
function leave(layer: HTMLElement, then: () => void): void {
    if (layer.classList.contains('is-leaving')) return;
    layer.classList.add('is-leaving');
    setTimeout(then, PANEL_MS);
}

/** The layer to put over the studio dialog: a scrim and the panel. */
export function newReferencePanel(snap: Snapshot, store: Store, h: Handlers, form: NewReferenceForm, environment: string, deps: Readonly<Record<string, DependencyState>> = {}): HTMLElement {
    const info = connectorInfo(form.connectorId);
    const prefix = prefixFor(snap);
    const check = checkForm(snap, form);
    if (openedAt === 0) openedAt = Date.now();
    const elapsed = Date.now() - openedAt;
    const entering = elapsed < PANEL_ENTER_MS;

    const layer = el('div', entering ? 'newref-layer is-entering' : 'newref-layer');
    if (entering) layer.style.setProperty('--newref-elapsed', `-${elapsed}ms`);
    const close = () => {
        if (form.saving) return;
        leave(layer, () => store.dispatch({ type: 'closeNewReference' }));
    };
    const scrim = el('div', 'newref-scrim');
    scrim.addEventListener('click', close);

    const panel = el('aside', 'newref-panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'New connection reference');

    // header: what this is
    const head = el('header', 'newref-head');
    const tile = el('span', 'newref-hero');
    tile.append(icon('plus'));
    const titles = el('div', 'newref-titles');
    titles.append(el('h3', 'newref-title', 'New connection reference'));
    const x = el('button', 'icon-btn newref-close');
    x.type = 'button';
    x.setAttribute('aria-label', 'Close new reference');
    x.append(icon('close'));
    x.disabled = form.saving;
    x.addEventListener('click', close);
    head.append(tile, titles, steps(form.reviewing), x);

    // what it is created for: the solution (a yellow folder) and the connector, each with its own logo and caption
    const metaRow = (logo: HTMLElement, caption: string, name: string): HTMLElement => {
        const r = el('div', 'newref-meta-row');
        const text = el('span', 'newref-meta-text');
        text.append(el('span', 'newref-caption', caption), el('span', 'newref-meta-name', name));
        r.append(logo, text);
        return r;
    };
    const folder = el('span', 'newref-logo');
    folder.append(icon('folder', 'icon--folder'));
    const meta = el('div', 'newref-meta');
    meta.append(metaRow(folder, 'Solution', snap.solution.name), metaRow(connectorTile(form.connectorId, false, true), 'Connector', info.name));

    const body = el('div', 'newref-body');
    const foot = el('footer', 'newref-foot');
    if (form.error !== '') body.append(note(form.error, 'warn'));

    if (form.reviewing) {
        const connection = normalizeConnectionName(form.connectionId);
        const live = form.live.items.find(c => c.name.toLowerCase() === connection.toLowerCase());
        const card = el('dl', 'newref-summary');
        card.append(
            line('Table', 'Connection reference'),
            line('Logical name', logicalNameOf(prefix, form.name)),
            line('Display name', form.displayName.trim()),
            line('Connector', `${info.name} (fixed)`),
            line('Connection', connection === '' ? 'None yet' : `${connection}${live && live.displayName !== '' ? ` (${live.displayName})` : ''}, found`),
            line('Description', form.description.trim() === '' ? 'None' : form.description.trim()),
            line('Solution', snap.solution.name),
            line('Environment', environment === '' ? 'The connected environment' : environment),
        );
        // what happens: a live timeline while the row is written (pending, active, done), driven by the steps the service reaches
        const flow = el('ol', 'newref-flow');
        flow.setAttribute('aria-live', 'polite');
        const order = ['check', 'write', 'readback'] as const;
        const happens: (readonly [typeof order[number], string, string])[] = [
            ['check', 'search', 'The name' + (connection === '' ? ' is' : ' and the connection are') + ' checked again against the environment.'],
            ['write', 'plus', `One row is created and added to ${snap.solution.name}.`],
            ['readback', 'check-circle', 'The row and its place in the solution are read back.'],
        ];
        const reached = form.step === 'done' ? order.length : form.step === '' ? -1 : order.indexOf(form.step);
        for (const [id, glyph, text] of happens) {
            const at = order.indexOf(id);
            const state = form.step === '' ? 'idle' : at < reached ? 'done' : at === reached ? 'active' : 'pending';
            const li = el('li', `newref-flow-item is-${state}`);
            li.dataset['state'] = state;
            li.append(state === 'active' ? spinner() : state === 'done' ? icon('check-circle', 'icon--sm icon--success') : icon(state === 'pending' ? 'clock' : glyph, state === 'pending' ? 'icon--sm icon--muted' : 'icon--sm icon--primary'), el('span', '', text));
            flow.append(li);
        }
        body.append(el('h4', 'newref-section', 'What will be written'), card, el('h4', 'newref-section', 'What happens'), flow, note('Nothing is written until you press Create. No flow and no other reference is changed.'));
        for (const w of check.warnings) body.append(note(w, 'warn'));
        const back = button('Back', 'secondary', () => store.dispatch({ type: 'reviewNewReference', on: false }));
        back.disabled = form.saving;
        const finished = form.step === 'done';
        const create = button(finished ? 'Created' : form.saving ? 'Creating...' : `Create in ${snap.solution.name}`, 'primary', () => void h.createReference());
        create.disabled = form.saving || !check.ok;
        if (form.saving) create.setAttribute('aria-busy', String(!finished));
        if (finished) create.prepend(icon('check', 'icon--sm'));
        else if (form.saving) create.prepend(spinner(true));
        if (finished) create.classList.add('is-finished');
        foot.append(back, create);
        if (form.saving && !finished) {
            // an indeterminate bar over the footer for the whole write
            const bar = el('div', 'newref-progress');
            bar.setAttribute('role', 'progressbar');
            bar.setAttribute('aria-label', 'Creating the reference');
            bar.append(el('span', 'newref-progress-fill'));
            panel.append(bar);
        }
    } else {
        // ready-made names: the Maker style, a readable one, and one by account when a connection is chosen. Applying one is
        // acknowledged (the card says Applied) and the list folds into one line so the fields it filled keep the room.
        const ideas = suggestions(snap, form);
        if (ideas.length > 0) {
            const appliedOne = ideas.find(s => isApplied(form, s));
            const box = el('section', 'newref-suggest');
            const top = el('div', 'newref-suggest-head');
            const title = el('div', 'newref-suggest-title');
            if (form.suggestOpen || !appliedOne) title.append(el('h4', 'newref-section', 'Suggestions'));
            else {
                title.append(icon('check-circle', 'icon--sm icon--success'), el('span', 'newref-applied', `Suggestion applied: ${appliedOne.label}`));
            }
            const tools = el('div', 'newref-suggest-tools');
            const auto = button('Auto-fill', 'secondary', () => store.dispatch({ type: 'applySuggestion', suggestion: ideas[0]! }), true);
            auto.prepend(icon('zap', 'icon--sm'));
            const toggle = button(form.suggestOpen ? 'Hide' : 'Show', 'secondary', () => store.dispatch({ type: 'toggleSuggestions' }), true);
            toggle.setAttribute('aria-expanded', String(form.suggestOpen));
            toggle.setAttribute('aria-label', form.suggestOpen ? 'Hide suggestions' : 'Show suggestions');
            tools.append(auto, toggle);
            top.append(title, tools);
            box.append(top);
            if (form.suggestOpen) for (const s of ideas) box.append(suggestionCard(store, prefix, s, isApplied(form, s)));
            body.append(box);
        }

        const displayName = input(store, 'displayName', 'Display name', form.displayName);
        if (entering) displayName.dataset['autofocus'] = 'true'; // only when it opens: a later redraw must never move the focus to the top
        body.append(labelled('Display name', displayName, { required: true, ...(form.displayName !== '' && check.errors.displayName ? { error: check.errors.displayName } : {}) }));

        const name = el('div', 'newref-name');
        name.append(el('span', 'newref-prefix', `${prefix === '' ? '?' : prefix}_`), input(store, 'name', 'Name', form.name));
        const nameError = check.errors.prefix ?? (form.name !== '' ? check.errors.name : undefined);
        body.append(labelled('Name', name, { required: true, ...(nameError ? { error: nameError } : {}), hint: `Logical name ${prefix === '' ? '(prefix unknown)' : logicalNameOf(prefix, form.name || '...')}, unique in the environment. It follows the display name until you edit it.` }));
        body.append(labelled('Description', input(store, 'description', 'Description', form.description, 'Optional'), { ...(check.errors.description ? { error: check.errors.description } : {}) }));

        // the connection: only one found among the connections of the environment is accepted
        const section = el('section', 'newref-conns');
        const top = el('div', 'newref-conns-head');
        top.append(el('span', 'newref-label', 'Connection'));
        const refresh = button('Refresh', 'secondary', () => void h.refreshConnections(), true);
        refresh.prepend(icon('refresh', 'icon--sm'));
        refresh.setAttribute('aria-label', 'Refresh connections');
        refresh.setAttribute('aria-busy', String(form.live.status === 'loading')); // never disabled: a disabled button loses the focus
        top.append(refresh);
        section.append(top);

        const cards = connectionChoices(snap, form);
        const picked = form.connectionSource === 'card' ? normalizeConnectionName(form.connectionId).toLowerCase() : '';
        const group = el('div', 'newref-connections');
        group.setAttribute('role', 'radiogroup');
        group.setAttribute('aria-label', 'Connection');
        if (form.live.status === 'loading') group.append(note('Reading your connections...'));
        for (const c of cards) group.append(connectionCard(store, c, c.id.toLowerCase() === picked, form.openConnections.includes(c.id), { h, deps }));
        section.append(group);
        if (form.live.status === 'ready' && cards.length === 0) section.append(note(`You have no ${info.name} connection yet. Create one in the Maker portal, then press Refresh.`));
        if (form.live.status === 'unavailable') section.append(note(`Your connections could not be read${form.live.error === '' ? '' : ` (${form.live.error})`}. Without them a connection cannot be verified, so the reference cannot be created. Press Refresh to try again.`, 'warn'));

        // another connection of this connector: paste its name, then Enter or the search icon looks it up among the connections
        const paste = el('div', 'newref-paste');
        paste.append(input(store, 'connectionId', 'Paste a connection id', form.connectionSource === 'typed' ? form.connectionId : '', 'Or paste a connection id'));
        const checkBtn = el('button', 'icon-btn newref-check');
        checkBtn.type = 'button';
        checkBtn.setAttribute('aria-label', 'Check connection');
        checkBtn.setAttribute('aria-busy', String(form.live.status === 'loading'));
        checkBtn.title = 'Check that this connection exists (Enter)';
        checkBtn.append(icon('search'));
        checkBtn.addEventListener('click', () => void h.checkConnection());
        paste.append(checkBtn);
        paste.addEventListener('keydown', e => {
            if ((e as KeyboardEvent).key === 'Enter') {
                e.preventDefault();
                void h.checkConnection();
            }
        });
        section.append(paste);
        if (form.connectionSource === 'typed' && normalizeConnectionName(form.connectionId) !== '') {
            if (form.live.status === 'loading') section.append(note('Checking...'));
            else if (check.errors.connectionId) section.append(note(check.errors.connectionId, form.checked === null || form.checked.id !== normalizeConnectionName(form.connectionId).toLowerCase() ? 'info' : 'error'));
        } else if (form.connectionSource === 'none') {
            section.append(note('Choose a connection. The Maker portal does not save a reference without one, and flows cannot be moved onto it.', 'info'));
        } else if (form.connectionSource === 'card') {
            const c = cards.find(x => x.id.toLowerCase() === picked);
            if (c) section.append(note(`Found: ${c.displayName === '' ? c.id : c.displayName}.`, 'ok'));
        }
        section.append(el('span', 'newref-hint', 'Optional. A connection is accepted only when it is found among your connections of this connector.'));
        body.append(section);

        for (const w of check.warnings) body.append(note(w, 'warn'));
        const review = button('Review', 'primary', () => store.dispatch({ type: 'reviewNewReference', on: true }));
        review.disabled = !check.ok;
        foot.append(button('Cancel', 'secondary', close), review);
    }

    body.dataset['step'] = form.reviewing ? 'review' : 'details';
    panel.append(head, meta, body);
    const bar = panel.querySelector('.newref-progress');
    panel.append(foot);
    if (bar) panel.insertBefore(bar, foot);
    layer.append(scrim, panel);
    return layer;
}
