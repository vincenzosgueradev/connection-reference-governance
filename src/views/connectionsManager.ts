import { features } from '../features';
import { groupOf, lookedAtNote, heldOnlyByReferences, problemSources, SOURCE_LABEL, type ConnectionDependencyReport } from '../model/connectionDeps';
import { canSelect, connectorsOf, dependencyLabel, FILTER_LABEL, figuresOf, filterRows, pipelineOf, shortId, sortRows, STATUS_LABEL, type ConnFilter, type ConnSortKey, type StageState } from '../model/connections';
import { blockReason } from '../model/connectionPlan';
import { formatElapsed } from '../model/progress';
import { fullDate, timeAgo } from '../model/time';
import type { State } from '../state/reducer';
import type { CmCheckAll } from '../state/connectionsState';
import { usageText } from '../model/connectorUsage';
import { connectorPicker } from './connectorPicker';
import type { Store } from '../state/store';
import type { ConnectionDependent, ConnectionRow } from '../types';
import { pipeline, button, chip, check, detailBlock, el, emptyState, icon, searchBox, segmented } from '../ui/components';
import { connectionDeletion } from './connectionDeletion';
import type { ConnectionsHandlers } from './connectionsHandlers';
import { connectorTile } from './connections';
import { readingLine } from './dependencies';

/**
 * The Connections area (feature 024, constitution T11): every connection of the environment that the signed-in user can
 * see, what depends on each, Check all, and the guarded deletion. DOM only. Every decision (who may be ticked, what a
 * verdict says) is in `model/`; intent goes out through `ConnectionsHandlers`. Theme variables only, no emoji.
 *
 * Layout, after the author's first live look: one row of tabs for the area, one toolbar row (filters with their counts,
 * search, connector, refresh), one row of actions, then the list, which is the only region that scrolls. A row is short:
 * its name, the connector and a short code of the id (nothing is truncated: the whole id is in the tooltip and the
 * details), the status, what depends on it and when it changed. The sort is the header of the column.
 */

/** The switch between the solutions and the connections of the environment: two tabs, shown only when the area exists. */
export function areaSwitch(s: State, onPick: (area: 'solutions' | 'connections') => void): HTMLElement {
    const box = el('div', 'area-switch');
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', 'Area');
    for (const [key, label, glyph] of [['solutions', 'Solutions', 'stack'], ['connections', 'Connections', 'plug']] as const) {
        const tab = el('button', s.area === key ? 'area-tab is-active' : 'area-tab');
        tab.type = 'button';
        if (s.area === key) tab.setAttribute('aria-current', 'page');
        tab.append(icon(glyph, 'icon--sm'), label);
        tab.addEventListener('click', () => onPick(key));
        box.append(tab);
    }
    return box;
}

const STATUS_CHIP: Readonly<Record<ConnectionRow['status'], () => HTMLElement>> = {
    connected: () => chip(STATUS_LABEL.connected, 'success', 'check-circle'),
    reconnect: () => chip(STATUS_LABEL.reconnect, 'warning', 'alert-triangle'),
    error: () => chip(STATUS_LABEL.error, 'error', 'x-circle'),
    unknown: () => chip(STATUS_LABEL.unknown, 'neutral', 'info'),
};

const kindIcon: Readonly<Record<ConnectionDependent['kind'], string>> = { app: 'layout', flow: 'workflow', reference: 'link', agent: 'bot', other: 'layers' };

const SCOPE_TEXT = 'These are the connections you can see, without the ones that belong to a flow (they are removed with their flow). Something that you cannot read may still use one of them: No dependency found never means unused.';

function spinner(): HTMLElement {
    const s = el('span', 'spinner');
    s.setAttribute('aria-hidden', 'true');
    return s;
}

function note(text: string, tone: 'info' | 'warn' | 'error' = 'info'): HTMLElement {
    const n = el('p', `dep-note${tone === 'warn' ? ' dep-note--warn' : tone === 'error' ? ' dep-note--error' : ''}`);
    n.append(icon(tone === 'warn' ? 'alert-triangle' : tone === 'error' ? 'x-circle' : 'info', 'icon--sm'), el('span', '', text));
    return n;
}

// ---- the details of one connection ------------------------------------------------------------------------------------------

function dependentRow(d: ConnectionDependent): HTMLElement {
    const li = el('li', 'dep-row');
    const head = el('div', 'dep-row-head');
    // the icon and the name are one group on the left, the state is alone on the right: nothing is left floating in the middle
    const title = el('span', 'dep-title');
    title.append(icon(kindIcon[d.kind], 'icon--sm icon--muted'), el('span', 'dep-name', d.name));
    const tags = el('span', 'dep-tags');
    if (d.state !== '') tags.append(chip(d.state, d.state === 'On' ? 'success' : d.state === 'Suspended' ? 'warning' : 'neutral', d.state === 'Suspended' ? 'pause' : 'power'));
    head.append(title, tags);
    li.append(head);
    const facts: string[] = [];
    if (d.via !== '') facts.push(`Through the reference ${d.via}`);
    if (d.ownerName !== '') facts.push(`Owner: ${d.ownerName}`);
    if (d.solutions.length > 0) facts.push(`In ${d.solutions.length === 1 ? 'solution' : 'solutions'}: ${d.solutions.join(', ')}`);
    if (facts.length > 0) li.append(el('div', 'dep-facts', facts.join('  -  ')));
    return li;
}

function reportBlock(row: ConnectionRow, report: ConnectionDependencyReport, h: ConnectionsHandlers, usage?: string): HTMLElement {
    const root = el('div', 'dep-block cm-deps');
    const top = el('div', `dep-summary cm-verdict cm-verdict--${report.verdict}`);
    const text = report.verdict === 'in-use' && heldOnlyByReferences(report) ? `Only ${report.dependents.length === 1 ? 'a connection reference holds' : 'connection references hold'} this connection: no flow, app or agent was found using ${report.dependents.length === 1 ? 'it' : 'them'}.`
        : report.verdict === 'in-use' ? `${report.dependents.length} ${report.dependents.length === 1 ? 'thing depends' : 'things depend'} on this connection.`
            : report.verdict === 'none-found' ? 'No dependency found.'
                : 'Could not be checked: a source could not be read, so nothing can be said.';
    top.append(icon(report.verdict === 'in-use' ? 'info' : report.verdict === 'none-found' ? 'check-circle' : 'alert-triangle', 'icon--sm'), el('strong', '', text));
    root.append(top);
    // what was looked at sits right under the verdict, so it is read without scrolling past a long list
    root.append(el('p', 'dep-source cm-coverage', lookedAtNote(report.sources)));
    if (report.verdict === 'none-found') root.append(note('The Maker portal can list flows that this tool cannot see (the records of the flow service). Before deleting a connection, check "Flows using this connection" in the portal.', 'warn'));
    if (usage !== undefined && (report.verdict === 'none-found' || report.verdict === 'in-use')) root.append(note(usage, 'info'));
    if (report.verdict === 'none-found') {
        // the hint above is shown first; the warning to check the portal follows
    } else if (report.verdict === 'in-use') root.append(note('This is what the tool could see. The Maker portal can list more flows (the records of the flow service, and flows of other users), so its list can be longer than this one: use Copy portal address to compare.', 'info'));
    for (const g of groupOf(report)) {
        const group = el('section', 'dep-group');
        const title = el('h5', 'dep-group-title');
        title.append(icon(kindIcon[g.kind], 'icon--sm icon--muted'), `${g.label} `, el('span', 'dep-count', String(g.items.length)));
        const list = el('ul', 'dep-list');
        for (const d of g.items) list.append(dependentRow(d));
        group.append(title, list);
        root.append(group);
    }
    // the flows of the inventory that were read and hold another connection: by name, with the reference and the connection it holds, to compare with the portal
    const away = report.elsewhere ?? [];
    if (away.length > 0) {
        const group = el('section', 'dep-group');
        const title = el('h5', 'dep-group-title');
        title.append(icon('workflow', 'icon--sm icon--muted'), 'Same connector, another connection ', el('span', 'dep-count', String(away.length)));
        const list = el('ul', 'dep-list');
        for (const f of away) {
            const li = el('li', 'dep-row');
            const head = el('div', 'dep-row-head');
            const who = el('span', 'dep-title');
            who.append(icon('workflow', 'icon--sm icon--muted'), el('span', 'dep-name', f.name));
            head.append(who);
            li.append(head, el('div', 'dep-facts', f.references.map(r => `${r.name} holds ${shortId(r.connection)}`).join('  -  ')));
            list.append(li);
        }
        group.append(title, list);
        root.append(group, note('These flows use the same connector but their connection references hold another connection, so they are not counted as using this one. If the Maker portal lists one of them here, the portal may be showing a permission granted earlier (it can also list flows that no longer exist): open the flow there and see which connection it uses now.', 'info'));
    }
    // a source that did not answer is named, and the others still show
    for (const p of problemSources(report)) {
        const st = p.state;
        if (st.status === 'ok') continue;
        root.append(note(st.status === 'failed' ? `Could not read the ${SOURCE_LABEL[p.name]}: ${st.reason}` : `Not scanned: ${SOURCE_LABEL[p.name]} (${st.reason})`, 'warn'));
    }
    const foot = el('div', 'dep-foot');
    const again = button('Check again', 'secondary', () => void h.checkAgain(row.name), true);
    again.prepend(icon('refresh', 'icon--sm'));
    again.setAttribute('aria-label', `Check the dependencies of ${row.displayName || row.name} again`);
    foot.append(again);
    root.append(foot);
    return root;
}

function detail(s: State, row: ConnectionRow, h: ConnectionsHandlers): HTMLElement {
    const c = s.connections;
    const root = el('div', 'detail cm-detail');
    const facts = el('dl', 'cm-facts');
    const fact = (k: string, v: string) => {
        if (v === '') return;
        facts.append(el('dt', '', k), el('dd', '', v));
    };
    fact('Connection id', row.name);
    fact('Connector', row.connectorName);
    fact('Created by', row.creator.name);
    fact('Created', row.createdTime === '' ? '' : fullDate(row.createdTime));
    fact('Last modified', row.modifiedTime === '' ? '' : fullDate(row.modifiedTime));
    fact('Status', row.statusDetail === '' ? STATUS_LABEL[row.status] : `${STATUS_LABEL[row.status]}: ${row.statusDetail}`);
    root.append(facts);

    const d = c.deps[row.name];
    const body = el('div', 'cm-dep-body');
    if (d === undefined || d.status === 'loading') {
        body.append(readingLine('Reading what depends on this connection: apps, connection references, flows and agents...'));
    } else if (d.status === 'failed') {
        body.append(note(`The dependencies could not be read: ${d.error}`, 'error'));
        const again = button('Try again', 'secondary', () => void h.checkAgain(row.name), true);
        again.setAttribute('aria-label', `Try again to check the dependencies of ${row.displayName || row.name}`);
        body.append(again);
    } else body.append(reportBlock(row, d.report, h, usageText(c.usage.map, row.connectorKey, row.connectorName)));
    root.append(detailBlock('What depends on it', d?.status === 'ready' ? d.report.dependents.length : undefined, body, true, 'layers'));

    // while the deletion is switched off the portal is the way: the address of this connection is copied
    if (!features.connectionDelete) {
        const portal = el('div', 'cm-portal');
        const copy = button('Copy portal address', 'secondary', () => void h.copyAddress(row.name), true);
        copy.prepend(icon('copy', 'icon--sm'));
        copy.setAttribute('aria-label', `Copy the Maker portal address of ${row.displayName || row.name}`);
        portal.append(copy, el('span', 'cm-portal-hint', 'Paste it in a browser to open this connection in the Maker portal. Deleting connections is switched off until the route is verified.'));
        root.append(portal);
    }
    return root;
}

// ---- the list ------------------------------------------------------------------------------------------------------------------

function rowView(s: State, store: Store, row: ConnectionRow, h: ConnectionsHandlers): HTMLElement {
    const c = s.connections;
    const open = c.open.includes(row.name);
    const label = row.displayName || row.name;
    const box = el('div', `cm-item${open ? ' is-open' : ''}`);
    const line = el('div', `cm-row cm-row--${row.status}`);

    const selected = c.selected.includes(row.name);
    const ck = check(selected, `Select ${label}`, () => store.dispatch({ type: 'cmToggle', name: row.name }));
    ck.classList.add('cm-check');
    if (!canSelect(row, c.deps)) {
        ck.disabled = true;
        ck.title = c.deps[row.name] === undefined ? 'Check the dependencies first: only a connection with no dependency found can be selected.' : (blockReason(row, c.deps) ?? 'It cannot be selected.');
    }

    const chevron = el('button', 'icon-btn expand-btn cm-chevron');
    chevron.type = 'button';
    chevron.setAttribute('aria-expanded', String(open));
    chevron.setAttribute('aria-label', `${open ? 'Hide' : 'Show'} details of ${label}`);
    chevron.append(icon('chevron-down'));
    chevron.addEventListener('click', e => {
        e.stopPropagation();
        void h.toggleOpen(row.name);
    });

    // two short lines: the name, then the connector and a short code of the id (the whole id is in the tooltip and the details)
    const who = el('div', 'cm-cell cm-cell--who');
    const names = el('div', 'cm-names');
    const sub = el('div', 'cm-sub');
    sub.append(el('span', 'cm-connector', row.connectorName === '' ? '' : row.connectorName), el('span', 'cm-id', `#${shortId(row.name)}`));
    sub.title = `${row.connectorName === '' ? '' : `${row.connectorName}  -  `}${row.name}`;
    names.append(el('div', 'conn-name', label), sub);
    who.append(connectorTile(`shared_${row.connectorKey}`), names);

    const status = el('div', 'cm-cell cm-cell--status');
    const chipEl = STATUS_CHIP[row.status]();
    if (row.statusDetail !== '') chipEl.title = row.statusDetail;
    status.append(chipEl);

    // what depends on it: a quiet word until it is read, then a chip
    const dep = dependencyLabel(c.deps, row.name, row);
    const depCell = el('div', 'cm-cell cm-cell--dep');
    if (dep.text === 'Not checked') {
        const quiet = el('span', 'cm-unchecked', dep.text);
        quiet.title = 'Not checked yet: open the row, or use Check all.';
        depCell.append(quiet);
    } else {
        const depChip = chip(dep.text, dep.tone === 'info' ? 'info' : dep.tone === 'success' ? 'success' : dep.tone === 'warning' ? 'warning' : 'neutral', dep.text.startsWith('In use') ? 'layers' : dep.text.startsWith('Held by') ? 'link' : dep.text === 'No dependency found' ? 'check-circle' : dep.text === 'Checking...' ? undefined : 'alert-triangle');
        if (dep.text === 'Checking...') depChip.prepend(spinner());
        if (dep.title) depChip.title = dep.title;
        depCell.append(depChip);
    }

    const when = el('div', 'cm-cell cm-cell--when');
    const modified = el('span', 'cell-time', row.modifiedTime === '' ? '-' : timeAgo(row.modifiedTime));
    if (row.modifiedTime !== '') modified.title = fullDate(row.modifiedTime);
    when.append(modified);
    if (row.creator.name !== '') when.append(el('span', 'cm-creator', row.creator.name));

    const pick = el('div', 'cm-cell cm-cell--select');
    pick.append(ck);
    // one click to copy the address of this connection in the Maker portal, so it can be checked there before anything is deleted
    const linkCell = el('div', 'cm-cell cm-cell--link');
    const link = el('button', 'icon-btn cm-link-btn');
    link.type = 'button';
    link.setAttribute('aria-label', `Copy the portal address of ${label}`);
    link.title = 'Copy the portal address of this connection, to check it in the Maker portal';
    link.append(icon('copy', 'icon--sm'));
    link.addEventListener('click', () => void h.copyAddress(row.name));
    linkCell.append(link);
    line.append(pick, chevron, who, status, depCell, when, linkCell);
    line.addEventListener('click', e => {
        if ((e.target as HTMLElement).closest('.check, .expand-btn, .cm-link-btn')) return;
        void h.toggleOpen(row.name);
    });
    box.append(line);
    if (open) box.append(detail(s, row, h));
    return box;
}

/** Check all, drawn like the run of a change: the ring, what is happening, the three phases, the counters and the connector being read. */
function pipelineView(s: State, ca: CmCheckAll): HTMLElement {
    const c = s.connections;
    const scope = ca.only ? c.list.items.filter(r => ca.only!.includes(r.name)) : c.list.items;
    const p = pipelineOf(scope, c.deps, ca.step);
    const fig = figuresOf(scope, c.deps);
    const failed = scope.filter(r => c.deps[r.name]?.status === 'failed').length;
    const card = el('section', 'cm-pipe run-panel');
    card.setAttribute('aria-label', 'Check all');
    const hero = el('div', 'run-hero');

    const percent = ca.step === 'connections' && ca.total > 0 ? Math.round((ca.done / ca.total) * 100) : 0;
    const ring = el('div', 'run-ring is-moving');
    ring.style.setProperty('--p', String(percent));
    ring.setAttribute('role', 'progressbar');
    ring.setAttribute('aria-label', 'Progress of Check all');
    ring.setAttribute('aria-valuemin', '0');
    ring.setAttribute('aria-valuemax', '100');
    ring.setAttribute('aria-valuenow', String(percent));
    ring.append(el('span', 'run-percent', `${percent}%`));

    const elapsed = Math.max(0, ca.now - ca.startedAt);
    const left = ca.done > 0 ? formatElapsed((elapsed / ca.done) * (ca.total - ca.done)) : '';
    const titles = el('div', 'run-titles');
    const head = el('div', 'run-headline-row');
    head.append(el('h3', 'run-headline', 'Checking the connections'));
    const now = ca.step === 'apps' ? 'Reading the apps of the environment...'
        : ca.step === 'references' ? 'Reading the connection references...'
            : `Checked ${ca.done} of ${ca.total}${left === '' ? '' : `  -  about ${left} left`}`;
    const current = p.connectors.find(k => k.state === 'active') ?? p.connectors.find(k => k.state === 'pending');
    titles.append(head, el('p', 'run-now', now));
    if (ca.step === 'connections' && current) {
        const who = el('div', 'cm-now-connector');
        const text = el('span', 'cm-now-text');
        text.append(el('b', '', current.name), el('span', '', `${current.done} of ${current.total}`));
        who.append(connectorTile(`shared_${current.key}`, false, true), text);
        titles.append(who);
    }
    titles.append(el('p', 'run-sub', `Time elapsed ${formatElapsed(elapsed)}. Nothing is changed: this only reads.`));

    const phases = el('div', 'run-phases');
    const state = (st: StageState) => (st === 'pending' ? 'pending' : st);
    phases.append(pipeline([
        { label: 'Apps', state: state(p.apps) },
        { label: 'Connection references', state: state(p.references) },
        { label: 'Connections', state: ca.step === 'connections' ? 'active' : 'pending' },
    ]));

    const counters = el('div', 'run-counters');
    const count = (cls: string, n: number, label: string) => {
        const box = el('span', `run-count run-count--${cls}`);
        box.append(el('b', '', String(n)), el('span', '', label));
        return box;
    };
    counters.append(count('done', fig.inUse, 'in use'), count('skipped', fig.noneFound, 'no dependency'), count('failed', failed, 'not read'));
    hero.append(ring, titles, phases, counters);
    card.append(hero);

    return card;
}

/** A column header that sorts: the arrow says which way, a second press turns it round. */
function sortHead(s: State, store: Store, label: string, key: ConnSortKey): HTMLElement {
    const c = s.connections;
    const active = c.sort.key === key;
    const b = el('button', active ? 'cm-sort is-active' : 'cm-sort');
    b.type = 'button';
    b.setAttribute('aria-label', `Sort by ${label}${active ? `, ${c.sort.dir === 'asc' ? 'ascending' : 'descending'}` : ''}`);
    b.append(label);
    if (active) b.append(icon('chevron-down', `icon--xs cm-sort-arrow${c.sort.dir === 'asc' ? ' is-asc' : ''}`));
    b.addEventListener('click', () => store.dispatch({ type: 'cmSort', key }));
    return b;
}

// ---- the whole area ------------------------------------------------------------------------------------------------------------

export function connectionsManager(s: State, store: Store, h: ConnectionsHandlers, onArea: (area: 'solutions' | 'connections') => void, environment: string): HTMLElement {
    const c = s.connections;
    const root = el('div', 'screen cm-screen');
    const rows = c.list.items;
    const fig = figuresOf(rows, c.deps);

    // the states with no list yet keep the tabs so the user can always leave
    const early = (content: HTMLElement): HTMLElement => {
        root.append(areaSwitch(s, onArea), content);
        return root;
    };
    if ((c.list.status === 'idle' || c.list.status === 'loading') && rows.length === 0) {
        const wait = el('div', 'cm-wait');
        wait.append(readingLine(c.list.read > 0 ? `Reading the connections... ${c.list.read} read so far` : 'Reading the connections of the environment...'));
        return early(wait);
    }
    if (c.list.status === 'failed' && rows.length === 0) {
        const failed = el('div', 'cm-failed');
        failed.append(note(c.list.error === '' ? 'The connections could not be read.' : c.list.error, 'error'));
        const retry = button('Try again', 'primary', () => void h.refresh());
        retry.prepend(icon('refresh', 'icon--sm'));
        failed.append(retry);
        return early(failed);
    }

    root.append(areaSwitch(s, onArea));

    // one toolbar row: the filters with their counts (the one place the numbers are shown), search, connector, refresh
    const shown = sortRows(filterRows(rows, c.deps, c.filter, c.connector, c.search), c.sort);
    const counts: Record<ConnFilter, number> = {
        all: rows.length,
        broken: filterRows(rows, c.deps, 'broken', c.connector, c.search).length,
        none: filterRows(rows, c.deps, 'none', c.connector, c.search).length,
        inuse: filterRows(rows, c.deps, 'inuse', c.connector, c.search).length,
    };
    const tools = el('div', 'toolbar cm-toolbar');
    tools.append(
        segmented((['all', 'broken', 'none', 'inuse'] as const).map(k => ({ key: k, label: FILTER_LABEL[k], count: counts[k], icon: { all: 'layers', broken: 'alert-triangle', none: 'check-circle', inuse: 'link' }[k] })), c.filter, key => store.dispatch({ type: 'cmFilter', filter: key as ConnFilter })),
        searchBox(c.search, 'Search connections...', v => store.dispatch({ type: 'cmSearch', text: v })),
    );
    const connectors = connectorsOf(rows);
    if (connectors.length > 1) {
        tools.append(connectorPicker(connectors.map(k => ({ ...k, count: rows.filter(r => r.connectorKey === k.key).length })), rows.length, c.connector, key => store.dispatch({ type: 'cmConnector', key })));
    }
    const refresh = button('Refresh', 'secondary', () => void h.refresh(), true);
    refresh.prepend(c.list.status === 'loading' ? spinner() : icon('refresh', 'icon--sm'));
    if (c.list.status === 'loading') refresh.setAttribute('aria-busy', 'true');
    tools.append(refresh);
    root.append(tools);

    if (c.list.status === 'failed') root.append(note(`${c.list.error} The list below is what was read before.`, 'warn'));
    if (c.list.status === 'loading') root.append(readingLine(`Reading the connections again... ${c.list.read} read so far`));

    // one row of actions: Check all, select, delete; on the right how many were checked and what the numbers mean
    const actions = el('div', 'cm-actions');
    const ca = c.checkAll;
    const ticked = c.selected.length;
    const checkBtn = button(ca ? 'Checking...' : ticked > 0 ? `Check selected (${ticked})` : fig.checked > 0 && fig.checked >= fig.total ? 'Check all again' : 'Check all', 'primary', () => void h.checkAll(ticked > 0 ? 'selected' : undefined));
    checkBtn.prepend(ca ? spinner() : icon('search', 'icon--sm'));
    if (ca) checkBtn.setAttribute('aria-busy', 'true');
    checkBtn.disabled = rows.length === 0;
    checkBtn.title = ticked > 0 ? 'Reads again what depends on the ticked connections only: the apps, the connection references, the flows and the agents.' : 'Reads what depends on every connection: the apps, the connection references, the flows and the agents, four connections at a time.';
    actions.append(checkBtn);
    if (ca) {
        const cancel = button(ca.cancelled ? 'Cancelling...' : 'Cancel', 'secondary', () => h.cancelCheckAll());
        cancel.dataset['allowRunning'] = 'true'; // the one control that stays usable while a run goes on
        cancel.disabled = ca.cancelled;
        actions.append(cancel);
    }
    const eligibleShown = shown.filter(r => canSelect(r, c.deps)).length;
    const pick = button('Select the ones with no dependency found', 'secondary', () => store.dispatch({ type: 'cmSelectEligible' }));
    pick.prepend(icon('check-circle', 'icon--sm'));
    pick.disabled = eligibleShown === 0;
    pick.title = eligibleShown === 0 ? 'Nothing to select yet: run Check all, then the connections with no dependency found can be selected.' : `Ticks the ${eligibleShown} connection${eligibleShown === 1 ? '' : 's'} shown with no dependency found.`;
    actions.append(pick);
    if (c.selected.length > 0) {
        const clear = button('Clear', 'secondary', () => store.dispatch({ type: 'cmClearSelection' }), true);
        actions.append(el('span', 'cm-selected', `${c.selected.length} selected`), clear);
    } else actions.append(el('span', 'cm-selected', 'None selected'));
    if (features.connectionDelete) {
        const del = button('Delete...', 'danger', () => h.openDeletion());
        del.prepend(icon('trash'));
        del.disabled = c.selected.length === 0;
        actions.append(del);
    }
    const checked = el('span', 'cm-checked');
    const tickedChecked = c.selected.filter(n => c.deps[n]?.status === 'ready' || c.deps[n]?.status === 'failed').length;
    checked.append(ticked > 0 ? `Selected ${ticked}  -  checked ${tickedChecked} of ${ticked}` : `Checked ${fig.checked} of ${fig.total}`);
    const info = el('span', 'cm-info');
    info.tabIndex = 0;
    info.title = SCOPE_TEXT;
    info.setAttribute('role', 'note');
    info.setAttribute('aria-label', SCOPE_TEXT);
    info.append(icon('info', 'icon--sm'));
    checked.append(info);
    actions.append(checked);
    root.append(actions);

    if (ca) root.append(pipelineView(s, ca));

    // the list: the one region that scrolls (the frame of the window is fixed)
    if (shown.length === 0) {
        root.append(emptyState(rows.length === 0 ? 'There are no connections that you can see in the connected environment.' : 'No connection matches the filter or the search.', rows.length === 0 ? 'plug' : 'search'));
    } else {
        const list = el('div', 'table-wrap cm-list');
        list.setAttribute('role', 'list');
        const head = el('div', 'cm-head');
        head.append(el('span'), el('span'), sortHead(s, store, 'Connection', 'name'), sortHead(s, store, 'Status', 'status'), el('span', 'cm-head-plain', 'Dependencies'), sortHead(s, store, 'Modified', 'modified'), el('span'));
        list.append(head);
        for (const row of shown.slice(0, c.shown)) {
            const item = rowView(s, store, row, h);
            item.setAttribute('role', 'listitem');
            list.append(item);
        }
        if (shown.length > c.shown) {
            const more = button(`Show more (${shown.length - c.shown} left)`, 'secondary', () => store.dispatch({ type: 'cmShowMore' }));
            more.classList.add('cm-more');
            list.append(more);
        }
        root.append(list);
    }

    if (c.deletion) root.append(connectionDeletion(s, store, h, environment));
    return root;
}
