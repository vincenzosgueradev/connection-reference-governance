import type { Store } from '../state/store';
import type { State } from '../state/reducer';
import type { FlowView, ReferenceView } from '../types';
import { connectorInfo } from '../model/connectors';
import { TYPE_LABEL } from '../model/flowinfo';
import { sortSolutions, type SolutionSortKey } from '../model/solutions';
import { fullDate, timeAgo } from '../model/time';
import { canMove, crumbsFor } from '../model/workflow';
import { breadcrumb, button, countPill, dataTable, el, emptyState, hero, icon, panel, searchBox, segmented, selectableTable, statTile, statusSlot, tableWrap } from '../ui/components';
import { connectionChip, connectionTiles, connectorName, flagChips, referenceCell } from './connections';
import { applyStep } from './apply';
import { confirmModal } from './confirm';
import { resetStudioMotion, studioDialog } from './studio';
import { previewStep } from './preview';
import { resultStep } from './result';
import { flowDetail, referenceDetail, stateChip, typeChip } from './detail';

/** DOM only, built with the shared UI kit. Decisions are in model/ and services/; user intent goes out through `Handlers`. */
export interface Handlers {
    /** An empty id means "back to the list of solutions". */
    selectSolution(id: string): void;
    refresh(): void;
    previewConnection(): void;
    previewRepoint(): void;
    confirm(): void;
    saveBackup(): void;
    saveReport(): void;
}

function matches(text: string, filter: string): boolean {
    return filter === '' || text.toLowerCase().includes(filter.toLowerCase());
}

function nameWithIcon(name: string): HTMLElement {
    const box = el('span', 'cell-strong name-with-icon');
    box.append(icon('stack', 'icon--sm icon--primary'), name);
    return box;
}

const SORT_COLUMNS: readonly SolutionSortKey[] = ['name', 'flows', 'created'];

function solutionList(s: State, store: Store, h: Handlers): HTMLElement {
    const root = el('div');
    const unmanaged = s.solutions.filter(sol => !sol.managed);
    const managed = s.solutions.length - unmanaged.length;
    root.append(hero(
        'Solutions',
        'Unmanaged solutions of the connected environment. Select one to see its flows and connection references.',
        [statTile('Solutions', String(unmanaged.length), 'stack'), statTile('Flows', s.flowTotal === null ? '-' : String(s.flowTotal), 'workflow', true)],
    ));

    const tools = el('div', 'toolbar');
    const refresh = button('Refresh', 'secondary', h.refresh, true);
    refresh.prepend(icon('refresh', 'icon--sm'));
    refresh.disabled = s.busy;
    tools.append(
        segmented(
            [
                { key: 'unmanaged', label: 'Unmanaged', count: unmanaged.length, icon: 'edit' },
                { key: 'managed', label: 'Managed', count: managed, icon: 'lock', disabled: true, title: 'Managed solutions cannot be changed, so they are not offered.' },
            ],
            'unmanaged',
            () => undefined,
        ),
        searchBox(s.solutionFilter, 'Search solutions...', v => store.dispatch({ type: 'setSolutionFilter', filter: v })),
        statusSlot('Updating...', s.busy),
        refresh,
    );
    root.append(tools);

    const shown = sortSolutions(
        unmanaged.filter(sol => matches(`${sol.name} ${sol.uniqueName} ${sol.publisher}`, s.solutionFilter)),
        s.flowCounts,
        s.solutionSort,
    );
    if (shown.length === 0) {
        root.append(emptyState(
            s.busy && s.solutions.length === 0 ? 'Loading solutions...'
                : unmanaged.length === 0 ? 'There are no unmanaged solutions in the connected environment.'
                    : `No solution matches "${s.solutionFilter}".`,
            unmanaged.length === 0 ? 'stack' : 'search',
        ));
        return root;
    }
    const activeColumn = SORT_COLUMNS.indexOf(s.solutionSort.key);
    root.append(tableWrap(dataTable(
        ['Display name', 'Name', 'Flows', 'Created', 'Version', 'Publisher'],
        shown,
        sol => {
            const created = el('span', 'cell-muted cell-time', timeAgo(sol.createdOn));
            created.title = fullDate(sol.createdOn);
            const n = s.flowCounts?.[sol.id];
            return [nameWithIcon(sol.name), el('span', 'cell-muted', sol.uniqueName), n === undefined ? el('span', 'cell-muted', '-') : countPill(n), created, sol.version, el('span', 'cell-muted', sol.publisher)];
        },
        {
            onOpen: sol => h.selectSolution(sol.id),
            // header columns 0, 2 and 3 sort: name, flows, created
            sort: { columns: [0, 2, 3], active: [0, 2, 3][activeColumn] ?? 2, desc: s.solutionSort.desc, onSort: col => store.dispatch({ type: 'sortSolutions', key: ({ 0: 'name', 2: 'flows', 3: 'created' } as Record<number, SolutionSortKey>)[col]! }) },
            numeric: [2],
        },
    )));
    return root;
}

// ---- one solution --------------------------------------------------------------------------------------------------

function selectionHandlers(s: State, store: Store) {
    return {
        selected: s.selected,
        onToggle: (id: string) => store.dispatch({ type: 'toggle', id }),
        onToggleAll: (ids: string[], allSelected: boolean) => store.dispatch(allSelected ? { type: 'clearSelection' } : { type: 'selectAll', ids }),
        expanded: s.expanded,
        onExpand: (id: string) => store.dispatch({ type: 'toggleExpand', id }),
    };
}

function flowsTable(s: State, store: Store): { table: HTMLElement; count: number } {
    const snap = s.snapshot!;
    const shown = (snap.flows as readonly FlowView[]).filter(f => matches([f.flow.name, f.flow.description, TYPE_LABEL[f.info.type], f.flow.ownerName, ...f.uses.map(u => u.logicalName)].join(' '), s.filter));
    // The attention column is shown only when some row shown has something to say (no empty column).
    const attention = shown.some(f => f.flags.length > 0);
    const t = selectableTable({
        columns: attention ? ['Flow', 'Type', 'State', 'Connections', 'Modified', 'Needs attention'] : ['Flow', 'Type', 'State', 'Connections', 'Modified'],
        rows: shown,
        id: f => f.flow.id,
        label: f => f.flow.name,
        cells: f => {
            const name = el('div', 'flow-cell');
            name.append(el('div', 'cell-strong', f.flow.name));
            if (f.flow.description !== '') {
                const desc = el('div', 'cell-sub', f.flow.description);
                desc.title = f.flow.description;
                name.append(desc);
            }
            const modified = el('span', 'cell-muted cell-time', timeAgo(f.flow.modifiedOn));
            modified.title = fullDate(f.flow.modifiedOn);
            const cells = [name, typeChip(f.info.type), stateChip(f.flow.stateCode), connectionTiles(f), modified];
            return attention ? [...cells, flagChips(f.flags)] : cells;
        },
        detail: f => flowDetail(f),
        ...selectionHandlers(s, store),
    });
    t.classList.add('flows-table');
    return { table: tableWrap(t), count: shown.length };
}

function referencesTable(s: State, store: Store): { table: HTMLElement; count: number } {
    const snap = s.snapshot!;
    const shown = (snap.references as readonly ReferenceView[]).filter(r => matches(`${r.reference.displayName} ${r.reference.logicalName} ${connectorInfo(r.reference.connectorId).name} ${r.reference.ownerName}`, s.filter));
    const attention = shown.some(r => r.flags.length > 0);
    const t = selectableTable({
        columns: attention ? ['Reference', 'Connector', 'Connection', 'Reference owner', 'Used by', 'Needs attention'] : ['Reference', 'Connector', 'Connection', 'Reference owner', 'Used by'],
        rows: shown,
        id: r => r.reference.id,
        label: r => r.reference.displayName || r.reference.logicalName,
        cells: r => {
            const ref = r.reference;
            const used = el('span', r.flowIds.length === 0 ? 'muted' : '', r.flowIds.length === 0 ? 'No flow' : r.flowIds.length === 1 ? '1 flow' : `${r.flowIds.length} flows`);
            used.title = r.flowIds.map(id => snap.flows.find(f => f.flow.id === id)?.flow.name ?? id).join(', ');
            const owner = el('span', 'cell-muted', ref.ownerName || 'Unknown');
            owner.title = 'The owner of the connection reference row, not of the connection behind it.';
            const cells = [referenceCell(ref, ref.logicalName), connectorName(ref.connectorId, ref.customConnectorId !== ''), connectionChip(ref.connectionId), owner, used];
            return attention ? [...cells, flagChips(r.flags)] : cells;
        },
        detail: r => referenceDetail(r, snap.flows),
        ...selectionHandlers(s, store),
    });
    t.classList.add('refs-table');
    t.querySelectorAll('th').forEach(th => {
        if (th.textContent === 'Reference owner') th.title = 'The owner of the connection reference row in Dataverse. It is not the owner of the connection behind it.';
    });
    return { table: tableWrap(t), count: shown.length };
}

/** The slim bar over the table: what is selected and one button that opens the studio. It never changes shape. */
function actionStrip(s: State, store: Store): HTMLElement {
    const snap = s.snapshot!;
    const editable = !snap.solution.managed;
    const refs = s.view === 'references';
    const chosen = s.selected.length;
    const flows = refs ? new Set(snap.references.filter(r => s.selected.includes(r.reference.id)).flatMap(r => r.flowIds)).size : 0;
    const root = el('section', 'action-strip');
    const head = el('div', 'action-strip-text');
    const title = el('h3', 'action-title');
    title.append(icon(refs ? 'link' : 'git-branch'), refs ? 'Change the connection of references' : 'Re-point flows to another reference');
    const hint = !editable ? 'This solution is managed: it can be read but not changed.'
        : chosen === 0 ? (refs ? 'Select connection references in the table to change their connection.' : 'Select flows in the table to re-point them to another reference.')
            : 'Choose what to change in the studio. Nothing is written until you confirm.';
    head.append(title, el('p', 'action-hint', hint));
    const count = el('span', 'action-count', refs ? `${chosen} selected, ${flows} flows affected` : `${chosen} selected`);
    count.setAttribute('aria-live', 'polite');
    const open = button('Choose changes...', 'primary', () => store.dispatch({ type: 'openStudio' }));
    open.prepend(icon('sliders'));
    open.disabled = !editable || chosen === 0 || s.busy;
    root.append(head, count, open);
    return root;
}

/** The step screens of a change: Preview, Apply, Result. */
function wizardScreen(s: State, store: Store, h: Handlers, environment: string): HTMLElement {
    const w = s.wizard!;
    const snap = s.snapshot!;
    const root = el('div');
    const back = () => store.dispatch({ type: 'closePlan' });
    if (w.step === 'preview' && s.plan) {
        root.append(previewStep({ plan: s.plan, snapshot: snap, wizard: w }, {
            back,
            apply: () => store.dispatch({ type: 'openConfirm' }),
            setLayout: layout => store.dispatch({ type: 'setLayout', layout }),
            setMode: (id, mode) => store.dispatch({ type: 'setItemMode', id, mode }),
            toggle: id => store.dispatch({ type: 'toggleItem', id }),
            more: () => store.dispatch({ type: 'showMore' }),
        }));
    } else if (w.step === 'apply') {
        root.append(applyStep(w, environment));
    } else if (w.step === 'result') {
        root.append(resultStep({ wizard: w, results: s.results ?? [], solutionName: snap.solution.name, environment }, { saveReport: h.saveReport, back: () => store.dispatch({ type: 'dismissResults' }) }));
    }
    if (w.confirmOpen && s.plan) {
        root.append(confirmModal(
            { plan: s.plan, snapshot: snap, environment, ack: s.planAck, backupSaved: s.backupSaved, expanded: s.dialogExpanded, stateAck: s.stateAck },
            { confirm: h.confirm, cancel: () => store.dispatch({ type: 'closeConfirm' }), saveBackup: h.saveBackup, setAck: on => store.dispatch({ type: 'setAck', on }), setExpanded: on => store.dispatch({ type: 'setDialogExpanded', on }), setStateAck: on => store.dispatch({ type: 'setStateAck', on }) },
        ));
    }
    return root;
}

function solutionDetail(s: State, store: Store, h: Handlers, environment: string): HTMLElement {
    if (s.wizard) return wizardScreen(s, store, h, environment);
    const snap = s.snapshot!;
    const flagged = snap.flows.filter(f => f.flags.length > 0).length + snap.references.filter(r => r.flags.length > 0).length;
    const p = panel(snap.solution.name, `${snap.flows.length} flows, ${snap.references.length} connection references${flagged > 0 ? `, ${flagged} need attention` : ''}`);
    const tools = el('div', 'toolbar');
    tools.append(
        segmented([{ key: 'flows', label: 'Flows', count: snap.flows.length, icon: 'workflow' }, { key: 'references', label: 'Connection references', count: snap.references.length, icon: 'plug' }], s.view, key => store.dispatch({ type: 'setView', view: key as State['view'] })),
        searchBox(s.filter, 'Filter...', v => store.dispatch({ type: 'setFilter', filter: v })),
    );
    const refresh = button('Refresh', 'secondary', h.refresh, true);
    refresh.prepend(icon('refresh', 'icon--sm'));
    refresh.disabled = s.busy;
    tools.append(statusSlot('Updating...', s.busy), refresh);
    p.body.append(tools);

    const hint = el('p', 'hint-line');
    hint.append(icon('info', 'icon--sm'), 'Click a row to see its details. The connection owner and state are not available from the connected environment: the owner shown is the owner of the reference.');
    p.body.append(hint, actionStrip(s, store));

    const { table: listTable, count } = s.view === 'flows' ? flowsTable(s, store) : referencesTable(s, store);
    if (count === 0) {
        p.body.append(emptyState(s.filter !== '' ? `Nothing matches the filter "${s.filter}" in ${snap.solution.name}.` : s.view === 'flows' ? `${snap.solution.name} has no flows.` : `${snap.solution.name} has no connection references.`, s.filter !== '' ? 'search' : s.view === 'flows' ? 'workflow' : 'plug'));
    } else {
        p.body.append(listTable);
    }
    if (s.studio) p.root.append(studioDialog(s, store, h, environment));
    else resetStudioMotion();
    return p.root;
}

export function mountMain(root: HTMLElement, store: Store, h: Handlers, environment: () => string): void {
    const draw = () => {
        const s = store.get();
        root.replaceChildren();
        const crumbs = document.getElementById('breadcrumb');
        if (crumbs) {
            crumbs.replaceChildren();
            crumbs.hidden = s.solutionId === '';
            if (s.solutionId !== '') {
                const name = s.snapshot?.solution.name ?? s.solutions.find(x => x.id === s.solutionId)?.name ?? '';
                const w = s.wizard;
                // During the write nothing can be left; before it, going back to the solution discards the plan.
                const canLeave = w === null || w.step !== 'apply';
                const toSolution = () => (w && w.step === 'result' ? store.dispatch({ type: 'dismissResults' }) : store.dispatch({ type: 'closePlan' }));
                const trail = w === null ? [{ label: name }] : [
                    { label: name, ...(canMove(w.step, 'leave') ? { onClick: toSolution } : {}) },
                    ...crumbsFor(w.step).map(c => ({ label: c.label })),
                ];
                crumbs.append(...breadcrumb([{ label: 'Solutions', ...(canLeave ? { onClick: () => h.selectSolution('') } : {}) }, ...trail]).childNodes);
            }
        }
        if (s.error !== '') {
            const m = el('div', 'message message--error');
            m.setAttribute('role', 'alert');
            m.append(el('span', 'message-text', s.error));
            root.append(m);
        }
        if (s.solutionId === '') {
            root.append(solutionList(s, store, h));
            return;
        }
        if (!s.snapshot) {
            root.append(emptyState(s.busy ? 'Reading the solution...' : 'The solution could not be read.'));
            return;
        }
        root.append(solutionDetail(s, store, h, environment()));
    };
    // The view is rebuilt on every change; keep the focused field and its caret, found again by its label.
    const render = () => {
        const page = root.closest<HTMLElement>('.main-content');
        const pageTop = page?.scrollTop ?? 0;
        const wrapTop = root.querySelector<HTMLElement>('.table-wrap')?.scrollTop ?? 0;
        const modalTop = root.querySelector<HTMLElement>('.modal-body')?.scrollTop ?? 0;
        const reopened = root.querySelector('.modal') !== null;
        const paneTops = [...root.querySelectorAll<HTMLElement>('.studio-pane-body')].map(p => p.scrollTop);
        const active = document.activeElement as HTMLInputElement | null;
        const label = active && root.contains(active) ? active.getAttribute('aria-label') : null;
        const start = label !== null && typeof active!.selectionStart === 'number' ? active!.selectionStart : null;
        const end = label !== null && typeof active!.selectionEnd === 'number' ? active!.selectionEnd : null;
        draw();
        if (page) page.scrollTop = pageTop;
        const wrap = root.querySelector<HTMLElement>('.table-wrap');
        if (wrap) wrap.scrollTop = wrapTop;
        const modalBody = root.querySelector<HTMLElement>('.modal-body');
        if (modalBody) modalBody.scrollTop = modalTop;
        // a re-draw of an open studio is not an opening: no animation, and the lists stay where they were
        if (reopened) root.querySelector('.modal-overlay')?.classList.add('no-anim');
        root.querySelectorAll<HTMLElement>('.studio-pane-body').forEach((p, i) => { p.scrollTop = paneTops[i] ?? 0; });
        const dialog = root.querySelector<HTMLElement>('.modal');
        if (dialog && !dialog.contains(document.activeElement) && label === null) dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();
        if (label === null) return;
        const next = [...root.querySelectorAll<HTMLElement>('[aria-label]')].find(e => e.getAttribute('aria-label') === label);
        if (!next || (next as HTMLInputElement).disabled) return;
        next.focus();
        try {
            if (start !== null && end !== null) (next as HTMLInputElement).setSelectionRange(start, end);
        } catch {
            // not a text field
        }
    };
    store.subscribe(render);
    render();
}
