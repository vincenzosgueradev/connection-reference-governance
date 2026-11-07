import { cleanupFigures, duplicateGroups, keeperOf, mergeInput, unreadableFlows, unusedReferences, type DuplicateGroup, type UnusedReference } from '../model/cleanup';
import { connectorInfo } from '../model/connectors';
import type { State } from '../state/reducer';
import type { Store } from '../state/store';
import type { Snapshot } from '../types';
import { summarize } from '../model/dependencies';
import { button, callout, check, chip, el, emptyState, figures, icon, modal, segmented } from '../ui/components';
import { connectorTile } from './connections';
import { dependenciesBlock, dependencyChip } from './dependencies';
import { makeExpandable } from './expand';
import type { Handlers } from './main';

/**
 * The clean up dialog (feature 022). It writes nothing: Remove and Delete hand the ticked references to their own
 * dialogs, and a merge hands the flows to the re-point. DOM only; every rule is in model/cleanup.ts.
 */

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
const nameOf = (r: { displayName: string; logicalName: string }): string => r.displayName || r.logicalName;

function note(text: string): HTMLElement {
    const n = el('p', 'cleanup-note');
    n.append(icon('info', 'icon--sm'), el('span', '', text));
    return n;
}

/** One unused reference: a check, its connector, its name and connection, and what is worth knowing about it. */
function unusedRow(s: State, store: Store, h: Handlers, u: UnusedReference, on: boolean, toggle: () => void): HTMLElement {
    const r = u.reference;
    const row = el('div', `cleanup-row${on ? ' is-on' : ''}${u.blocked ? ' is-blocked' : ''}`);
    const box = check(on, `Tick ${nameOf(r)}`, toggle);
    if (u.blocked) {
        box.disabled = true;
        box.title = u.blocked;
    }
    const text = el('span', 'cleanup-text');
    text.append(el('span', 'source-name', nameOf(r)), el('span', 'source-logical', r.logicalName));
    const conn = el('span', 'cleanup-conn');
    conn.append(icon('key', 'icon--sm icon--muted'), el('span', '', r.connectionId === '' ? 'No connection' : r.connectionId));
    text.append(conn);
    const tags = el('span', 'cleanup-tags');
    if (u.neverConnected) tags.append(chip('Never connected', 'info', 'plug'));
    if (u.duplicateOf !== undefined) tags.append(chip(`Duplicate of ${u.duplicateOf}`, 'warning', 'layers'));
    if (u.blocked) tags.append(chip('Managed', 'neutral', 'lock'));
    if (r.ownerName !== '') tags.append(el('span', 'cleanup-owner', r.ownerName));
    // what depends on it in the whole environment, once it has been checked (feature 023); the chip opens the list
    const state = s.dependencies[r.id];
    const verdict = dependencyChip(state);
    const open = s.cleanup!.open.includes(r.id);
    if (verdict) {
        if (state?.status === 'ready' && summarize(state.report).total > 0) {
            const b = el('button', 'dep-chip-button');
            b.type = 'button';
            b.setAttribute('aria-expanded', String(open));
            b.setAttribute('aria-label', `${open ? 'Hide' : 'Show'} what depends on ${nameOf(r)}`);
            b.append(verdict);
            b.addEventListener('click', () => store.dispatch({ type: 'toggleCleanupDeps', id: r.id }));
            tags.append(b);
        } else tags.append(verdict);
    }
    row.append(box, connectorTile(r.connectorId, false, true), text, tags);
    const item = el('div', 'cleanup-item');
    item.append(row);
    if (open && state?.status === 'ready') {
        const wrap = el('div', 'cleanup-deps');
        wrap.append(dependenciesBlock({ state, subject: 'this reference', onCheck: () => void h.checkDependencies([r.id]), name: nameOf(r) }));
        item.append(wrap);
    }
    return item;
}

function unusedTab(s: State, store: Store, h: Handlers, snap: Snapshot): HTMLElement[] {
    const unused = unusedReferences(snap);
    const picked = s.cleanup!.picked;
    const out: HTMLElement[] = [];
    if (unused.length === 0) return [emptyState(`No unused connection reference in ${snap.solution.name}: every one is used by a flow.`, 'check-circle')];
    const lost = unreadableFlows(snap);
    if (lost > 0) out.push(callout('warning', `${plural(lost, 'flow', 'flows')} could not be read`, [`${lost === 1 ? 'It' : 'They'} might use a reference listed here. Check before you delete.`], 'alert-triangle'));
    out.push(note('No flow of this solution uses these. Something outside it may: Check dependencies reads the whole environment. Remove keeps the row; Delete asks the environment first.'));
    const tickable = unused.filter(u => u.blocked === undefined);
    // Check dependencies: the whole environment, not only this solution (feature 023). It acts on what is ticked, else on all.
    const states = unused.map(u => s.dependencies[u.reference.id]);
    const loading = states.filter(x => x?.status === 'loading').length;
    const readyCount = states.filter(x => x?.status === 'ready').length;
    const target = picked.length > 0 ? [...picked] : unused.map(u => u.reference.id);
    const targetDone = target.every(id => s.dependencies[id]?.status === 'ready');
    const scope = picked.length > 0 ? `${picked.length} ticked` : `all ${unused.length}`;
    const checkLabel = loading > 0 ? `Checking... ${readyCount} of ${readyCount + loading}` : targetDone ? `Check again (${picked.length > 0 ? picked.length : 'all'})` : `Check dependencies (${scope})`;
    const nobody = tickable.filter(u => { const d = s.dependencies[u.reference.id]; return d?.status === 'ready' && summarize(d.report).total === 0; });

    // one toolbar, one line: what to do on the left, what is ticked on the right
    const bar = el('div', 'cleanup-bar');
    const checkBtn = button(checkLabel, 'secondary', () => void h.checkDependencies(target), true);
    if (loading > 0) {
        const spin = el('span', 'spinner');
        spin.setAttribute('aria-hidden', 'true');
        checkBtn.prepend(spin);
    } else checkBtn.prepend(icon(targetDone ? 'refresh' : 'search', 'icon--sm'));
    checkBtn.setAttribute('aria-busy', String(loading > 0)); // never disabled while reading: a disabled button loses the focus
    checkBtn.title = picked.length > 0 ? 'Reads what depends on the ticked references, in every solution of the environment' : 'Reads what depends on each unused reference, in every solution of the environment. Tick some to check only those';
    const nobodyBtn = button('Select the ones nobody uses', 'secondary', () => store.dispatch({ type: 'setCleanupUnused', ids: nobody.map(u => u.reference.id) }), true);
    nobodyBtn.disabled = nobody.length === 0;
    nobodyBtn.title = nobody.length === 0 ? 'Check the dependencies first: only references with nothing depending on them, anywhere, are selected' : 'Ticks only the references with no dependent anywhere in the environment';
    const count = el('span', 'cleanup-count', `${picked.length} of ${tickable.length} ticked`);
    count.setAttribute('aria-live', 'polite');
    const all = button('Select all', 'secondary', () => store.dispatch({ type: 'setCleanupUnused', ids: tickable.map(u => u.reference.id) }), true);
    all.disabled = tickable.length === 0 || picked.length === tickable.length;
    const none = button('Clear', 'secondary', () => store.dispatch({ type: 'setCleanupUnused', ids: [] }), true);
    none.disabled = picked.length === 0;
    bar.append(checkBtn, nobodyBtn, el('span', 'cleanup-spacer'), count, all, none);
    out.push(bar);

    // what the check found, in one line over what was checked; it can be closed and comes back after a new check
    const checked = unused.filter(u => s.dependencies[u.reference.id]?.status === 'ready');
    if (loading === 0 && checked.length > 0 && !s.cleanup!.summaryHidden) {
        const free = checked.filter(u => { const d = s.dependencies[u.reference.id]; return d?.status === 'ready' && summarize(d.report).total === 0; }).length;
        const used = checked.length - free;
        const text = used === 0
            ? `Checked ${checked.length}: nothing depends on ${checked.length === 1 ? 'it' : 'them'} in any solution, agent or app. Safe to remove or delete.`
            : `Checked ${checked.length}: ${used} still ${used === 1 ? 'has' : 'have'} dependents. Remove keeps the row; Delete refuses ${used === 1 ? 'it' : 'them'} and names what blocks it.`;
        const line = el('div', `cleanup-summary${used === 0 ? ' is-ok' : ' is-warn'}`);
        line.setAttribute('role', 'status');
        const close = el('button', 'icon-btn cleanup-summary-close');
        close.type = 'button';
        close.setAttribute('aria-label', 'Dismiss the summary');
        close.append(icon('close', 'icon--sm'));
        close.addEventListener('click', () => store.dispatch({ type: 'dismissCleanupSummary' }));
        line.append(icon(used === 0 ? 'check-circle' : 'alert-triangle', 'icon--sm'), el('span', 'cleanup-summary-text', text), close);
        out.push(line);
    }
    const list = el('div', 'cleanup-list');
    for (const u of unused) list.append(unusedRow(s, store, h, u, picked.includes(u.reference.id), () => store.dispatch({ type: 'toggleCleanupUnused', id: u.reference.id })));
    out.push(list);
    return out;
}

/** One group of duplicates: who holds the connection, a radio to keep one, and what a merge does. */
function groupCard(s: State, store: Store, h: Handlers, snap: Snapshot, g: DuplicateGroup): HTMLElement {
    const keeperId = keeperOf(g, s.cleanup);
    const merge = mergeInput(snap, g, keeperId)!;
    const card = el('section', 'dup-card');
    const head = el('header', 'dup-head');
    const title = el('span', 'cleanup-text');
    title.append(el('span', 'source-name', connectorInfo(g.connectorId).name));
    const conn = el('span', 'cleanup-conn');
    conn.append(icon('key', 'icon--sm icon--muted'), el('span', '', g.connectionId));
    title.append(conn);
    head.append(connectorTile(g.connectorId, false, true), title, chip(`${g.members.length} references share it`, 'warning', 'layers'));
    // what else uses each one, anywhere (feature 023): so the keeper is chosen knowing it
    const checked = g.members.every(m => s.dependencies[m.reference.id]?.status === 'ready');
    const scan = button(checked ? 'Check again' : 'Check dependencies', 'secondary', () => void h.checkDependencies(g.members.map(m => m.reference.id)), true);
    scan.prepend(icon(checked ? 'refresh' : 'search', 'icon--sm'));
    scan.setAttribute('aria-label', `Check the dependencies of the references that share ${g.connectionId}`);
    scan.setAttribute('aria-busy', String(g.members.some(m => s.dependencies[m.reference.id]?.status === 'loading')));
    head.append(scan);
    card.append(head);

    const members = el('div', 'dup-members');
    members.setAttribute('role', 'radiogroup');
    members.setAttribute('aria-label', `Reference to keep for ${g.connectionId}`);
    for (const m of g.members) {
        const keep = m.reference.id === keeperId;
        const b = el('button', keep ? 'choice choice--compact is-on' : 'choice choice--compact');
        b.type = 'button';
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', String(keep));
        b.setAttribute('aria-label', `Keep ${nameOf(m.reference)}`);
        const text = el('span', 'choice-text');
        text.append(el('span', 'choice-name', nameOf(m.reference)), el('span', 'choice-line', m.reference.logicalName), el('span', 'choice-line', m.flowIds.length === 0 ? 'No flow of this solution uses it' : `Used by ${plural(m.flowIds.length, 'flow', 'flows')}: ${m.flows.slice(0, 3).join(', ')}${m.flows.length > 3 ? ` and ${m.flows.length - 3} more` : ''}`));
        const tags = el('span', 'cleanup-tags');
        if (m.reference.id === g.suggestedKeeper) tags.append(chip('Suggested', 'info', 'check'));
        tags.append(keep ? chip('Keep', 'success', 'check-circle') : chip('Merged into it', 'neutral', 'arrow-right'));
        const verdict = dependencyChip(s.dependencies[m.reference.id]);
        if (verdict) tags.append(verdict);
        if (m.reference.managed) tags.append(chip('Managed', 'neutral', 'lock'));
        b.append(el('span', 'choice-mark'), text, tags);
        b.addEventListener('click', () => store.dispatch({ type: 'setKeeper', group: g.key, id: m.reference.id }));
        members.append(b);
    }
    card.append(members);

    const flows = merge.flowIds.length;
    const managed = merge.duplicates.filter(d => d.managed).length;
    const effect = el('p', 'dup-effect');
    effect.append(icon(flows > 0 ? 'git-branch' : 'check-circle', 'icon--sm icon--primary'), el('span', '', flows > 0
        ? `${plural(flows, 'flow', 'flows')} will be re-pointed to ${nameOf(merge.keeper)}. Then ${plural(merge.duplicates.length, 'duplicate becomes', 'duplicates become')} unused and can be removed or deleted, with its own preview and confirmation.`
        : `No flow uses the other ${plural(merge.duplicates.length, 'reference', 'references')}: ${merge.duplicates.length === 1 ? 'it is' : 'they are'} already unused and can be removed or deleted.`));
    card.append(effect);
    if (managed > 0) card.append(note(`${plural(managed, 'managed reference', 'managed references')} cannot be removed; the flows are re-pointed away from ${managed === 1 ? 'it' : 'them'} all the same.`));
    const foot = el('footer', 'dup-foot');
    const go = button(flows > 0 ? `Merge into ${nameOf(merge.keeper)}...` : 'Review as unused...', 'primary', () => h.startMerge(g.key));
    go.prepend(icon(flows > 0 ? 'git-branch' : 'minus'));
    go.setAttribute('aria-label', flows > 0 ? `Merge into ${nameOf(merge.keeper)}` : `Review the duplicates of ${g.connectionId} as unused`);
    foot.append(go);
    card.append(foot);
    return card;
}

function duplicatesTab(s: State, store: Store, h: Handlers, snap: Snapshot): HTMLElement[] {
    const groups = duplicateGroups(snap);
    if (groups.length === 0) return [emptyState('No duplicates: no two references of this solution hold the same connection of the same connector.', 'check-circle')];
    const out: HTMLElement[] = [note('Duplicates hold the same connection of the same connector, so one of them is enough. Choose the one to keep: the flows of the others are re-pointed to it (a Preview first), and then the others can be taken away.')];
    for (const g of groups) out.push(groupCard(s, store, h, snap, g));
    return out;
}

export function cleanupDialog(s: State, store: Store, h: Handlers, environment: string): HTMLElement {
    const snap = s.snapshot!;
    const cleanup = s.cleanup!;
    const fig = cleanupFigures(snap);
    const close = () => store.dispatch({ type: 'closeCleanup' });

    const figs = figures([
        { label: 'Unused', value: String(fig.unused), icon: 'minus', tone: fig.unused > 0 ? 'warning' : 'success' },
        { label: 'Duplicate groups', value: String(fig.groups), icon: 'layers', tone: fig.groups > 0 ? 'warning' : 'success' },
        { label: 'Flows to re-point', value: String(fig.flows), icon: 'workflow', tone: 'info' },
    ]);
    const tabs = segmented([
        { key: 'unused', label: 'Unused', count: fig.unused, icon: 'minus' },
        { key: 'duplicates', label: 'Duplicates', count: fig.groups, icon: 'layers' },
    ], cleanup.tab, key => store.dispatch({ type: 'setCleanupTab', tab: key as 'unused' | 'duplicates' }));
    const content = el('div', 'cleanup-content');
    content.dataset['tab'] = cleanup.tab;
    content.append(...(cleanup.tab === 'unused' ? unusedTab(s, store, h, snap) : duplicatesTab(s, store, h, snap)));

    const subtitle = el('span', '');
    subtitle.append(chip(environment === '' ? 'Environment' : environment, 'info', 'database'), ` in ${snap.solution.name}`);
    const overlay = modal({
        tone: 'primary',
        icon: 'layers',
        title: 'Clean up connection references',
        subtitle,
        body: [figs, tabs, content],
        confirm: { label: 'Remove from solution...', onConfirm: () => undefined },
        cancelLabel: 'Close',
        onCancel: close,
    });
    const box = overlay.querySelector<HTMLElement>('.modal')!;
    box.classList.add('studio-dialog', 'cleanup-dialog');
    overlay.classList.add('studio-overlay');
    makeExpandable(overlay, s.dialogExpanded, on => store.dispatch({ type: 'setDialogExpanded', on }));

    // the footer: Remove and Delete for the ticked unused references; a merge has its own button on every card
    const actions = box.querySelector<HTMLElement>('.modal-actions')!;
    const closeBtn = button('Close', 'secondary', close);
    actions.replaceChildren(closeBtn);
    if (cleanup.tab === 'unused') {
        const none = cleanup.picked.length === 0 || s.busy;
        const remove = button('Remove from solution...', 'secondary', () => void h.cleanupRemove());
        remove.prepend(icon('minus'));
        remove.disabled = none;
        remove.title = 'Takes the ticked rows out of this solution; they stay in the environment';
        const del = button('Delete...', 'danger', () => void h.cleanupDelete());
        del.prepend(icon('trash'));
        del.disabled = none;
        del.title = 'Deletes the ticked rows from the environment, after checking what depends on them';
        actions.append(remove, del);
    }
    const first = box.querySelector<HTMLElement>('.cleanup-row .check:not(:disabled), .dup-card .choice, .segment');
    (first ?? closeBtn).dataset['autofocus'] = 'true';
    return overlay;
}
