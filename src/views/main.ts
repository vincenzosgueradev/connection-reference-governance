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
import { cleanupDialog } from './cleanup';
import { actionRunning } from '../state/running';
import { cleanupFigures } from '../model/cleanup';
import { removalModal } from './removal';
import { flowDetail, referenceDetail, stateChip, typeChip } from './detail';

/** DOM only, built with the shared UI kit. Decisions are in model/ and services/; user intent goes out through `Handlers`. */
export interface Handlers {
    /** An empty id means "back to the list of solutions". */
    selectSolution(id: string): void;
    refresh(): void;
    previewConnection(): void;
    previewRepoint(): void;
    /** Allows or forbids turning flows that are on off for the change; the open preview is read again with it. */
    setManageState(on: boolean): void;
    previewRemove(): void;
    previewDelete(): void | Promise<void>;
    /** Writes the reviewed new connection reference (feature 021). */
    createReference(): void | Promise<void>;
    /** Opens the side panel of a new reference for a connector and reads the connections of the environment. */
    openNewReference(connectorId: string): void | Promise<void>;
    /** Reads the connections of the environment again (the Refresh and Check buttons of the panel). */
    refreshConnections(): void | Promise<void>;
    /** Reads what depends on these references in the whole environment, in any solution (feature 023). */
    checkDependencies(ids: readonly string[]): void | Promise<void>;
    /** Clean up (feature 022): remove or delete the ticked unused references through the usual dialogs. */
    cleanupRemove(): void;
    cleanupDelete(): void | Promise<void>;
    /** Merges a group of duplicates: starts the re-point of their flows to the keeper (the removal follows as its own step). */
    startMerge(groupKey: string): void;
    /** Looks the typed connection id up among the connections (Enter in the field, or the search icon). */
    checkConnection(): void | Promise<void>;
    /** What was pasted to unlock Delete. */
    setTypedCode(value: string): void;
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
    const root = el('div', 'screen');
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

function referencesTable(s: State, store: Store, h: Handlers): { table: HTMLElement; count: number } {
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
            used.title = r.flowIds.length === 0 ? 'No flow of this solution. Open the row and press Check dependencies to see everything that uses it in the environment.' : `Flows of this solution: ${r.flowIds.map(id => snap.flows.find(f => f.flow.id === id)?.flow.name ?? id).join(', ')}. Open the row to see what else uses it.`;
            const owner = el('span', 'cell-muted', ref.ownerName || 'Unknown');
            owner.title = 'The owner of the connection reference row, not of the connection behind it.';
            const cells = [referenceCell(ref, ref.logicalName), connectorName(ref.connectorId, ref.customConnectorId !== ''), connectionChip(ref.connectionId), owner, used];
            return attention ? [...cells, flagChips(r.flags)] : cells;
        },
        detail: r => referenceDetail(r, snap.flows, { state: s.dependencies[r.reference.id], onCheck: () => void h.checkDependencies([r.reference.id]) }),
        ...selectionHandlers(s, store),
    });
    t.classList.add('refs-table');
    t.querySelectorAll('th').forEach(th => {
        if (th.textContent === 'Reference owner') th.title = 'The owner of the connection reference row in Dataverse. It is not the owner of the connection behind it.';
    });
    return { table: tableWrap(t), count: shown.length };
}

/** The slim bar over the table: what is selected and one button that opens the studio. It never changes shape. */
function actionStrip(s: State, store: Store, h: Handlers): HTMLElement {
    const snap = s.snapshot!;
    const editable = !snap.solution.managed;
    const refs = s.view === 'references';
    const chosen = s.selected.length;
    const flows = refs ? new Set(snap.references.filter(r => s.selected.includes(r.reference.id)).flatMap(r => r.flowIds)).size : 0;
    const root = el('section', 'action-strip');
    const head = el('div', 'action-strip-text');
    const title = el('h3', 'action-title');
    title.append(icon(refs ? 'link' : 'git-branch'), refs ? 'Change the connection of references' : 'Re-point flows to another reference');
    // A reference a flow of this solution still uses can be neither removed nor deleted: say so instead of offering it.
    const picked = refs ? snap.references.filter(r => s.selected.includes(r.reference.id)) : [];
    const inUse = picked.filter(r => r.flowIds.length > 0).length;
    const allInUse = picked.length > 0 && inUse === picked.length;
    const hint = !editable ? 'This solution is managed: it can be read but not changed.'
        : allInUse ? `${picked.length === 1 ? 'This reference is' : 'These references are'} used by flows, so ${picked.length === 1 ? 'it' : 'they'} cannot be removed or deleted. Re-point those flows to another reference first (Flows view, Choose changes), or change the connection here.`
        : chosen === 0 ? (refs ? 'Select connection references in the table to change their connection.' : 'Select flows in the table to re-point them to another reference.')
            : refs ? 'Choose what to change in the studio, or remove or delete the selected references. Nothing is written until you confirm.' : 'Choose what to change in the studio. Nothing is written until you confirm.';
    head.append(title, el('p', 'action-hint', hint));
    const count = el('span', 'action-count', refs ? `${chosen} selected, ${flows} flows affected` : `${chosen} selected`);
    count.setAttribute('aria-live', 'polite');
    const open = button('Choose changes...', 'primary', () => store.dispatch({ type: 'openStudio' }));
    open.prepend(icon('sliders'));
    open.disabled = !editable || chosen === 0 || s.busy;
    // Taking things away (feature 016): no choices to make, so these go straight to the preview.
    const off = !editable || chosen === 0 || s.busy;
    const remove = button('Remove from solution...', 'secondary', h.previewRemove);
    remove.prepend(icon('minus'));
    remove.disabled = off || allInUse;
    remove.title = allInUse ? 'Used by flows: re-point those flows first' : 'Takes the selected rows out of this solution; they stay in the environment';
    const del = button('Delete...', 'danger', h.previewDelete);
    del.prepend(icon('trash'));
    del.disabled = off || allInUse;
    del.title = allInUse ? 'Used by flows: re-point those flows first' : 'Deletes the selected rows from the environment';
    // Clean up (feature 022): the unused references and the duplicates, with how many there are to look at
    const fig = cleanupFigures(snap);
    const todo = fig.unused + fig.groups;
    const clean = button('Clean up...', 'secondary', () => store.dispatch({ type: 'openCleanup' }));
    clean.prepend(icon('layers'));
    if (todo > 0) clean.append(' ', el('span', 'segment-count', String(todo)));
    clean.setAttribute('aria-label', 'Clean up references');
    clean.disabled = !editable || s.busy;
    clean.title = !editable ? 'This solution is managed: it cannot be changed' : todo === 0 ? 'Nothing to clean up: every reference is used and none is a duplicate' : `${fig.unused} unused, ${fig.groups} duplicate ${fig.groups === 1 ? 'group' : 'groups'}`;
    const actions = el('div', 'action-buttons');
    // Only connection references can be taken out or deleted from here; flows are only re-pointed.
    actions.append(...(refs ? [clean, remove, del] : []), open);
    root.append(head, count, actions);
    return root;
}

/** Remove and Delete open one dialog over the list instead of a Preview step (feature 019). */
function removalDialogOpen(s: State): boolean {
    return s.wizard !== null && s.wizard.step === 'preview' && s.plan !== null && (s.plan.kind === 'remove' || s.plan.kind === 'delete');
}

/** The step screens of a change: Preview, Apply, Result. */
function wizardScreen(s: State, store: Store, h: Handlers, environment: string): HTMLElement {
    const w = s.wizard!;
    const snap = s.snapshot!;
    const root = el('div', 'screen');
    const back = () => store.dispatch({ type: 'closePlan' });
    if (w.step === 'preview' && s.plan) {
        root.append(previewStep({ plan: s.plan, snapshot: snap, wizard: w }, {
            back,
            apply: () => store.dispatch({ type: 'openConfirm' }),
            setLayout: layout => store.dispatch({ type: 'setLayout', layout }),
            setTab: tab => store.dispatch({ type: 'setTab', tab }),
            toggle: id => store.dispatch({ type: 'toggleItem', id }),
            more: () => store.dispatch({ type: 'showMore' }),
        }));
    } else if (w.step === 'apply') {
        root.append(applyStep(w, environment, s.plan?.rows ?? []));
    } else if (w.step === 'result') {
        root.append(resultStep({ wizard: w, results: s.results ?? [], solutionName: snap.solution.name, environment }, {
            saveReport: h.saveReport,
            back: () => store.dispatch({ type: 'dismissResults' }),
            // the second step of a merge: the duplicates that are unused now are offered for removal (its own preview and confirmation)
            ...(s.cleanupFollowUp && w.operation === 'repoint' ? { followUp: { label: `Clean up the ${s.cleanupFollowUp.ids.length === 1 ? 'duplicate' : 'duplicates'}`, run: () => store.dispatch({ type: 'followUpCleanup' }) } } : {}),
        }));
    }
    if (w.confirmOpen && s.plan) {
        root.append(confirmModal(
            { plan: s.plan, snapshot: snap, environment, ack: s.planAck, backupSaved: s.backupSaved, expanded: s.dialogExpanded, stateAck: s.stateAck, manageState: s.manageState },
            { confirm: h.confirm, cancel: () => store.dispatch({ type: 'closeConfirm' }), saveBackup: h.saveBackup, setAck: on => store.dispatch({ type: 'setAck', on }), setExpanded: on => store.dispatch({ type: 'setDialogExpanded', on }), setStateAck: on => store.dispatch({ type: 'setStateAck', on }), setManageState: h.setManageState },
        ));
    }
    return root;
}

function solutionDetail(s: State, store: Store, h: Handlers, environment: string): HTMLElement {
    if (s.wizard && !removalDialogOpen(s)) return wizardScreen(s, store, h, environment);
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
    p.body.append(hint, actionStrip(s, store, h));

    const { table: listTable, count } = s.view === 'flows' ? flowsTable(s, store) : referencesTable(s, store, h);
    if (count === 0) {
        p.body.append(emptyState(s.filter !== '' ? `Nothing matches the filter "${s.filter}" in ${snap.solution.name}.` : s.view === 'flows' ? `${snap.solution.name} has no flows.` : `${snap.solution.name} has no connection references.`, s.filter !== '' ? 'search' : s.view === 'flows' ? 'workflow' : 'plug'));
    } else {
        p.body.append(listTable);
    }
    // Clean up stays behind the confirmation of a Remove or a Delete: both are drawn, the confirmation last, so it is on top
    if (s.cleanup) p.root.append(cleanupDialog(s, store, h, environment));
    if (removalDialogOpen(s)) {
        p.root.append(removalModal(
            { plan: s.plan!, snapshot: snap, environment, ack: s.planAck, backupSaved: s.backupSaved, code: s.confirmCode, typed: s.typedCode, stateAck: s.stateAck },
            { confirm: h.confirm, cancel: () => store.dispatch({ type: 'closePlan' }), saveBackup: h.saveBackup, setAck: on => store.dispatch({ type: 'setAck', on }), setTyped: h.setTypedCode, setStateAck: on => store.dispatch({ type: 'setStateAck', on }) },
        ));
    } else if (!s.cleanup && s.studio) p.root.append(studioDialog(s, store, h, environment));
    else resetStudioMotion();
    p.root.classList.add('screen');
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
                const w = removalDialogOpen(s) ? null : s.wizard;
                // During the write nothing can be left; before it, going back to the solution discards the plan.
                const canLeave = w === null || w.step !== 'apply';
                const toSolution = () => (w && w.step === 'result' ? store.dispatch({ type: 'dismissResults' }) : store.dispatch({ type: 'closePlan' }));
                const trail = w === null ? [{ label: name }] : [
                    { label: name, ...(canMove(w.step, 'leave') ? { onClick: toSolution } : {}) },
                    // the stepper already shows the steps that were done: the breadcrumb names only where you are
                    ...crumbsFor(w.step).slice(-1).map(c => ({ label: c.label })),
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
    // A different page (another solution, view, step or tab) always opens at the top; a redraw of the same page keeps its place.
    let lastPage = '';
    const pageKey = (): string => {
        const s = store.get();
        const w = s.wizard;
        return [s.solutionId, s.snapshot === null ? 'loading' : s.view, w ? `${w.step}:${w.operation}:${w.tab}` : '', removalDialogOpen(s) ? 'removal' : ''].join('|');
    };
    const render = () => {
        const key = pageKey();
        const samePage = key === lastPage;
        lastPage = key;
        const page = root.closest<HTMLElement>('.main-content');
        const pageTop = page?.scrollTop ?? 0;
        const wrapTop = root.querySelector<HTMLElement>('.table-wrap')?.scrollTop ?? 0;
        const modalTops = [...root.querySelectorAll<HTMLElement>('.modal-body')].map(b => b.scrollTop); // one per dialog (two can be stacked)
        const stepTop = root.querySelector<HTMLElement>('.step-body')?.scrollTop ?? 0;
        const dialogsBefore = root.querySelectorAll('.modal-overlay').length; // the dialogs that were already open (two can be stacked)
        const paneTops = [...root.querySelectorAll<HTMLElement>('.studio-pane-body')].map(p => p.scrollTop);
        const cleanBody = root.querySelector<HTMLElement>('.cleanup-content');
        const cleanTop = cleanBody?.scrollTop ?? 0;
        const cleanTab = cleanBody?.dataset['tab'] ?? '';
        const panelBody = root.querySelector<HTMLElement>('.newref-body');
        const panelTop = panelBody?.scrollTop ?? 0;
        const panelStep = panelBody?.dataset['step'] ?? '';
        const active = document.activeElement as HTMLInputElement | null;
        const label = active && root.contains(active) ? active.getAttribute('aria-label') : null;
        const start = label !== null && typeof active!.selectionStart === 'number' ? active!.selectionStart : null;
        const end = label !== null && typeof active!.selectionEnd === 'number' ? active!.selectionEnd : null;
        draw();
        // the global rule: while an action runs every button is disabled, here, once, whatever drew it (constitution T8)
        const running = actionRunning(store.get());
        root.classList.toggle('is-running', running);
        if (running) root.querySelectorAll<HTMLButtonElement>('button').forEach(b => { b.disabled = true; });
        if (page) page.scrollTop = samePage ? pageTop : 0;
        const wrap = root.querySelector<HTMLElement>('.table-wrap');
        if (wrap) wrap.scrollTop = samePage ? wrapTop : 0;
        const stepBody = root.querySelector<HTMLElement>('.step-body');
        if (stepBody) stepBody.scrollTop = samePage ? stepTop : 0;
        root.querySelectorAll<HTMLElement>('.modal-body').forEach((b, i) => { b.scrollTop = modalTops[i] ?? 0; });
        // a re-draw of an open studio is not an opening: no animation, and the lists stay where they were
        // a redraw is not an opening: every dialog that was already open keeps still; only one that has just opened animates
        root.querySelectorAll('.modal-overlay').forEach((o, i) => { if (i < dialogsBefore) o.classList.add('no-anim'); });
        root.querySelectorAll<HTMLElement>('.studio-pane-body').forEach((p, i) => { p.scrollTop = paneTops[i] ?? 0; });
        // the side panel of a new reference keeps its place on a click or on typing; another step opens at the top (feature 021)
        const newBody = root.querySelector<HTMLElement>('.newref-body');
        if (newBody && panelBody && newBody.dataset['step'] === panelStep) newBody.scrollTop = panelTop;
        // the list of Clean up keeps its place on a click; another tab opens at the top (feature 022)
        const newClean = root.querySelector<HTMLElement>('.cleanup-content');
        if (newClean && cleanBody && newClean.dataset['tab'] === cleanTab) newClean.scrollTop = cleanTop;
        const modals = root.querySelectorAll<HTMLElement>('.modal');
        const dialog = modals.length > 0 ? modals[modals.length - 1]! : null; // the topmost one
        if (dialog && !dialog.contains(document.activeElement) && label === null) dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus({ preventScroll: true });
        if (label === null) return;
        const next = [...root.querySelectorAll<HTMLElement>('[aria-label]')].find(e => e.getAttribute('aria-label') === label);
        if (!next || (next as HTMLInputElement).disabled) return;
        next.focus({ preventScroll: true });
        try {
            if (start !== null && end !== null) (next as HTMLInputElement).setSelectionRange(start, end);
        } catch {
            // not a text field
        }
    };
    store.subscribe(render);
    render();
}
