import type { State } from '../state/reducer';
import type { Store } from '../state/store';
import type { ConnectionReferenceRow, Snapshot } from '../types';
import { connectorInfo } from '../model/connectors';
import { connectionImpact, groupsImpact, usageShare } from '../model/impact';
import { planRepointGroups, writableRows } from '../model/plans';
import { categoriesOf, repointTargets, stepStatus, type RepointSource, type StepStatus } from '../model/repoint';
import { button, check, chip, el, figures, icon, modal } from '../ui/components';
import { connectorTile } from './connections';
import { makeExpandable } from './expand';
import { newReferencePanel, resetPanelMotion } from './newReference';
import type { Handlers } from './main';

/**
 * The studio (feature 010): the dialog where a change is chosen. It never writes; Review changes closes it and opens the
 * guided path. It can fill the window; the choices live in the state, so closing and reopening keeps them.
 */

/** Connection ids already used by references of the given connectors, each named by the references that use it. */
function knownConnections(snap: Snapshot, connectors: ReadonlySet<string>): { id: string; names: string[] }[] {
    const byId = new Map<string, string[]>();
    for (const r of snap.allReferences) {
        if (r.connectionId === '' || !connectors.has(r.connectorId)) continue;
        byId.set(r.connectionId, [...(byId.get(r.connectionId) ?? []), r.displayName || r.logicalName]);
    }
    return [...byId.entries()].map(([id, names]) => ({ id, names }));
}

function pane(kind: 'from' | 'to', title: string, subtitle: string): { root: HTMLElement; body: HTMLElement; head: HTMLElement } {
    const root = el('section', `studio-pane studio-pane--${kind}`);
    const head = el('div', 'studio-pane-head');
    const titles = el('div', 'studio-pane-titles');
    titles.append(el('h3', 'studio-pane-title', title), el('p', 'studio-pane-sub', subtitle));
    head.append(titles);
    const body = el('div', 'studio-pane-body');
    root.append(head, body);
    return { root, body, head };
}

function note(text: string, warn = false): HTMLElement {
    const n = el('p', warn ? 'studio-note studio-note--warn' : 'studio-note');
    n.append(icon(warn ? 'alert-triangle' : 'info', 'icon--sm'), text);
    return n;
}

/** A thin bar that fills to a share of the selected flows; the colour comes from the tone of its category. */
function meter(percent: number, label: string): HTMLElement {
    const bar = el('span', 'meter');
    bar.setAttribute('role', 'img');
    bar.setAttribute('aria-label', label);
    const fill = el('span', 'meter-fill');
    fill.style.width = `${percent}%`;
    bar.append(fill);
    return bar;
}

/** One reference to replace: a check, its name, its logical name, and how many of the selected flows use it (bar and percentage). */
function sourceRow(x: RepointSource, on: boolean, toggle: () => void): HTMLElement {
    const name = x.displayName || x.logicalName;
    const share = usageShare(x.used, x.selected);
    const row = el('div', on ? 'source-row is-on' : 'source-row');
    const box = check(on, `Replace ${name}`, toggle);
    const text = el('span', 'source-text');
    text.append(el('span', 'source-name', name), el('span', 'source-logical', x.logicalName));
    const use = el('span', 'source-usage');
    use.append(meter(share, `${share}% of the selected flows`), el('span', 'source-use', `${x.used} of ${x.selected} flow${x.selected === 1 ? '' : 's'}`), el('span', 'source-pct', `${share}%`));
    row.append(box, text, use);
    return row;
}

function choice(label: string, selected: boolean, disabled: boolean, onPick: () => void, lines: readonly (string | Node)[]): HTMLButtonElement {
    const node = el('button', selected ? 'choice is-on' : 'choice');
    node.type = 'button';
    node.setAttribute('role', 'radio');
    node.setAttribute('aria-checked', String(selected));
    node.setAttribute('aria-label', label);
    node.disabled = disabled;
    const mark = el('span', 'choice-mark');
    const text = el('span', 'choice-text');
    text.append(...lines.map(l => (typeof l === 'string' ? el('span', 'choice-line', l) : l)));
    node.append(mark, text);
    node.addEventListener('click', onPick);
    return node;
}

const ownerOf = (r: ConnectionReferenceRow) => (r.ownerName === '' ? 'Owner unknown' : r.ownerName);

/** The step last drawn: the motion plays only when it changes (a redraw caused by a choice must not replay it). */
let lastStep = -1;
export function resetStudioMotion(): void {
    lastStep = -1;
}

interface Parts { main: HTMLElement[]; foot?: HTMLElement; impact: HTMLElement; ready: boolean; missing: string[]; notice: string }

const STATE_WORD: Record<StepStatus, string> = { done: 'Done', incomplete: 'Incomplete', empty: 'Not changed' };

function repointParts(s: State, store: Store, snap: Snapshot, h: Handlers): Parts {
    const cats = categoriesOf(snap, s.selected);
    const last = cats.length; // the summary
    const step = Math.min(Math.max(s.studioStep, 0), last);
    const groupsState = s.repointGroups;
    const stateOf = (id: string) => groupsState.find(g => g.connectorId === id);
    const go = (n: number) => store.dispatch({ type: 'studioGo', step: n });
    const setGroup = (connectorId: string, from: readonly string[]) => store.dispatch({ type: 'setGroup', group: { connectorId, from, target: stateOf(connectorId)?.target ?? '' } });
    const missing = groupsState.filter(g => g.target === '').map(g => connectorInfo(g.connectorId).name);

    // the pipeline: one step per connector, then the summary
    const top = el('div', 'studio-top');
    const pipe = el('ol', 'studio-pipe');
    pipe.setAttribute('aria-label', 'Categories');
    const entry = (i: number, label: string, status: StepStatus | 'pending', glyph: string, tile?: HTMLElement) => {
        const li = el('li', 'studio-pipe-li');
        const b = el('button', `studio-pipe-item is-${status === 'pending' ? 'pending' : status === 'incomplete' ? 'warn' : status}${i === step ? ' is-current' : ''}`);
        b.type = 'button';
        if (i === step) b.setAttribute('aria-current', 'step');
        const mark = el('span', 'studio-pipe-mark');
        mark.append(status === 'done' ? icon('check') : status === 'incomplete' ? icon('alert-triangle') : status === 'empty' ? icon('minus') : icon(glyph));
        b.append(...(tile ? [tile] : []), mark, el('span', 'studio-pipe-name', label));
        b.addEventListener('click', () => go(i));
        li.append(b);
        return li;
    };
    cats.forEach((c, i) => {
        const st = stepStatus(stateOf(c.connectorId));
        // a category passed without a choice is "not changed"; one not reached yet has no state
        pipe.append(entry(i, connectorInfo(c.connectorId).name, st === 'empty' && i >= step ? 'pending' : st, connectorInfo(c.connectorId).glyph, connectorTile(c.connectorId, false, true)));
    });
    pipe.append(entry(last, 'Summary', 'pending', 'clipboard-check'));
    top.append(pipe);

    // the current step
    const panel = el('section', 'studio-panel');
    if (lastStep !== -1 && lastStep !== step) panel.classList.add(step > lastStep ? 'slide--next' : 'slide--prev');
    lastStep = step;

    let incompleteHere = false;
    if (step < last) {
        const cat = cats[step]!;
        const info = connectorInfo(cat.connectorId);
        const g = stateOf(cat.connectorId);
        const chosen = g?.from ?? [];
        const status = stepStatus(g);
        incompleteHere = status === 'incomplete';
        panel.classList.add(`studio-group--${info.tone}`);
        const left = pane('from', 'References to replace', 'Tick one, some or all.');
        const all = button('Select all', 'secondary', () => setGroup(cat.connectorId, cat.sources.map(x => x.logicalName)), true);
        all.disabled = chosen.length === cat.sources.length;
        const clear = button('Clear', 'secondary', () => setGroup(cat.connectorId, []), true);
        clear.disabled = chosen.length === 0;
        const toolsHere = el('div', 'studio-pane-tools');
        toolsHere.append(all, clear);
        left.head.append(toolsHere);
        for (const x of cat.sources) {
            const on = chosen.includes(x.logicalName);
            left.body.append(sourceRow(x, on, () => setGroup(cat.connectorId, on ? chosen.filter(n => n !== x.logicalName) : [...chosen, x.logicalName])));
        }

        const right = pane('to', 'Reference to use instead', 'Only references of this connector in this solution.');
        const add = button('New reference', 'secondary', () => void h.openNewReference(cat.connectorId), true);
        add.prepend(icon('plus', 'icon--sm'));
        right.head.append(add);
        if (chosen.length === 0) right.body.append(note('Tick the references to replace first, or go to another category to leave this one as it is.'));
        else {
            const targets = repointTargets(snap, chosen);
            if (targets.length === 0) right.body.append(note('There is no other reference of this connector in this solution, so there is nothing to re-point to.', true));
            for (const r of targets) {
                const name = r.displayName || r.logicalName;
                right.body.append(choice(`Use ${name}`, g !== undefined && r.logicalName === g.target, false, () => store.dispatch({ type: 'setGroup', group: { connectorId: cat.connectorId, from: chosen, target: r.logicalName } }), [
                    el('span', 'choice-name', name),
                    r.logicalName,
                    r.connectionId === '' ? 'No connection set' : `Connection ${r.connectionId}`,
                    `Owner: ${ownerOf(r)}`,
                ]));
            }
        }
        const grid = el('div', 'studio');
        grid.append(left.root, right.root);
        panel.append(grid);
    } else {
        const head = el('div', 'studio-panel-head');
        const titles = el('div', 'studio-panel-titles');
        titles.append(el('h3', 'studio-panel-title', 'Summary'), el('span', 'studio-panel-sub', 'Review changes opens the preview of every change. Nothing is written yet.'));
        head.append(titles);
        const list = el('div', 'summary-list');
        cats.forEach((c, i) => {
            const st = stepStatus(stateOf(c.connectorId));
            const line = el('div', `summary-line summary-line--${st}`);
            const edit = button('Edit', 'secondary', () => go(i), true);
            edit.classList.add('summary-edit');
            const state = chip(STATE_WORD[st], st === 'done' ? 'success' : st === 'incomplete' ? 'warning' : 'neutral', st === 'done' ? 'check' : st === 'incomplete' ? 'alert-triangle' : 'minus');
            state.classList.add('summary-state');
            line.append(connectorTile(c.connectorId, false, true), el('span', 'summary-name', connectorInfo(c.connectorId).name), state, edit);
            list.append(line);
        });
        panel.append(head, list);
    }

    // where you are and what is left to do; moving between categories is done with the pipeline above, so there are no
    // Back and Next buttons repeating it (the note is always there, so nothing moves)
    const nav = el('div', 'studio-nav');
    const mid = el('div', 'studio-nav-mid');
    mid.append(el('span', 'studio-where', step < last ? `Category ${step + 1} of ${last}` : 'Summary'));
    const reason = el('span', incompleteHere ? 'studio-nav-note' : 'studio-nav-note is-idle', incompleteHere ? 'Choose the reference to use instead, or untick the references to leave this category as it is.' : ' ');
    mid.append(reason);
    nav.append(mid);

    const i = groupsImpact(snap, s.selected, groupsState);
    const impact = figures([
        { label: 'Categories', value: String(i.categories), icon: 'layers', tone: 'primary' },
        { label: 'Flows affected', value: String(i.affected), icon: 'workflow', tone: 'info' },
        { label: 'Turned on', value: String(i.turnedOn), icon: 'power', tone: i.turnedOn > 0 ? 'warning' : 'info' },
        { label: 'Without these references', value: String(i.unrelated), icon: 'minus', tone: 'info' },
    ]);
    // Offer only what the planner accepts: with every choice made, something must be writable.
    const complete = groupsState.length > 0 && missing.length === 0;
    const plan = complete ? planRepointGroups(snap, s.selected, groupsState, '', true) : null;
    const nothing = plan !== null && writableRows(plan).length === 0;
    // a flow that is on is not a reason to keep Review changes closed: the permission to turn it off is asked in the confirmation
    const notice = !nothing ? '' : 'No selected flow can be written with these choices.';
    return { main: [top, panel], foot: nav, impact, ready: complete && !nothing && s.newReference === null, missing, notice };
}

function connectionParts(s: State, store: Store, snap: Snapshot): Parts {
    const chosen = snap.references.filter(r => s.selected.includes(r.reference.id));
    const connectors = new Set(chosen.map(r => r.reference.connectorId));
    const mixed = connectors.size > 1;
    const left = pane('from', 'Selected references', 'Every flow that uses them follows the new connection.');
    for (const r of chosen) {
        const row = el('div', 'source-row');
        const text = el('span', 'source-text');
        text.append(el('span', 'source-name', r.reference.displayName || r.reference.logicalName), el('span', 'source-logical', r.reference.logicalName));
        row.append(connectorTile(r.reference.connectorId, false, true), text, el('span', 'source-use', r.reference.connectionId === '' ? 'No connection' : r.reference.connectionId));
        left.body.append(row);
    }
    const right = pane('to', 'Connection to use', 'Connections already used by references of this connector, or paste another id.');
    const known = mixed ? [] : knownConnections(snap, connectors);
    if (mixed) right.body.append(note('The selected references use different connectors: a connection belongs to one connector. Select references of one connector.', true));
    for (const k of known) {
        right.body.append(choice(`Use ${k.id}`, s.newConnectionId === k.id, false, () => store.dispatch({ type: 'setNewConnectionId', value: k.id }), [
            el('span', 'choice-name', k.id),
            `Used by ${k.names.join(', ')}`,
        ]));
    }
    const typed = el('input', 'text-input');
    typed.type = 'text';
    typed.placeholder = 'Paste a connection id';
    typed.value = known.some(k => k.id === s.newConnectionId) ? '' : s.newConnectionId;
    typed.disabled = mixed;
    typed.setAttribute('aria-label', 'Or paste a connection id');
    typed.addEventListener('input', () => store.dispatch({ type: 'setNewConnectionId', value: typed.value.trim() }));
    right.body.append(typed);

    const i = connectionImpact(snap, s.selected);
    const impact = figures([
        { label: 'References', value: String(i.references), icon: 'plug', tone: 'primary' },
        { label: 'Flows affected', value: String(i.flows), icon: 'workflow', tone: 'info' },
        { label: 'Turned on', value: String(i.turnedOn), icon: 'power', tone: i.turnedOn > 0 ? 'warning' : 'info' },
    ]);
    const grid = el('div', 'studio');
    grid.append(left.root, right.root);
    return { main: [grid], impact, ready: !mixed && chosen.length > 0 && s.newConnectionId !== '', missing: [], notice: '' };
}

export function studioDialog(s: State, store: Store, h: Handlers, environment: string): HTMLElement {
    const snap = s.snapshot!;
    const repoint = s.view === 'flows';
    const parts = repoint ? repointParts(s, store, snap, h) : connectionParts(s, store, snap);
    const close = () => store.dispatch({ type: 'closeStudio' });

    const impact = el('div', 'studio-impact');
    const line = parts.missing.length > 0 ? `Still to choose: ${parts.missing.join(', ')}.` : parts.notice;
    const missingLine = el('p', line !== '' ? 'studio-note studio-note--warn' : 'studio-note is-idle');
    missingLine.append(icon('alert-triangle', 'icon--sm'), line !== '' ? line : ' ');
    impact.append(parts.impact, missingLine);

    const bottom = el('div', 'studio-bottom');
    bottom.append(impact);

    const subtitle = el('span', '');
    subtitle.append(chip(environment === '' ? 'Environment' : environment, 'info', 'database'), ` ${s.selected.length} selected in ${snap.solution.name}`);
    const overlay = modal({
        tone: 'primary',
        icon: repoint ? 'git-branch' : 'link',
        title: repoint ? 'Re-point flows' : 'Change connection',
        subtitle,
        body: [...parts.main, bottom],
        ...(parts.foot ? { footNote: parts.foot } : {}),
        confirm: { label: 'Review changes', icon: 'eye', disabled: !parts.ready || s.busy, onConfirm: repoint ? h.previewRepoint : h.previewConnection },
        // Escape goes to the side panel first while it is open (and is ignored while it writes)
        onCancel: () => {
            if (s.newReference === null) return close();
            overlay.querySelector<HTMLButtonElement>('.newref-close')?.click(); // the same animated way out; disabled while writing
        },
    });

    const box = overlay.querySelector<HTMLElement>('.modal')!;
    box.classList.add('studio-dialog');
    overlay.classList.add('studio-overlay');
    makeExpandable(overlay, s.dialogExpanded, on => store.dispatch({ type: 'setDialogExpanded', on }));

    // the side panel of a new reference slides in over the dialog (feature 021)
    const form = repoint && s.newReference !== null ? s.newReference : null;
    if (form) box.append(newReferencePanel(snap, store, h, form, environment, s.dependencies));
    else resetPanelMotion();

    // focus starts on the first control, not on Cancel
    const cancel = box.querySelector<HTMLElement>('[data-autofocus]');
    if (cancel) delete cancel.dataset['autofocus'];
    const first = box.querySelector<HTMLElement>('.studio .check:not(:disabled), .studio .choice:not(:disabled), .studio input:not(:disabled)');
    if (!form) (first ?? cancel)?.setAttribute('data-autofocus', 'true');
    return overlay;
}
