/** Pure state: no DOM, no host, no side effects. */

import type { Phase } from '../model/progress';
import { turnOffRows } from '../model/plans';
import { categoriesOf, isCompatibleTarget, repointSources, type RepointGroup } from '../model/repoint';
import { canMove, type OperationKind, type WizardStep } from '../model/workflow';
import { DEFAULT_SORT, nextSort, type SolutionSort, type SolutionSortKey } from '../model/solutions';
import { buildSnapshotWith } from '../model/analysis';
import type { DependencyReport, DependencyState } from '../model/dependencies';
import { cleanupFigures, emptyCleanup, pruneCleanup, type Cleanup, type CleanupTab } from '../model/cleanup';
import { emptyForm, withChecked, withField, withPick, withSuggestion, type NewReferenceForm, type Suggestion } from '../model/newReference';
import type { LiveConnection } from '../types';
import type { Verdict } from '../model/liveConnections';
import type { ConnectionReferenceRow, Plan, RowOutcome, Snapshot, SolutionInfo } from '../types';

export type ViewName = 'flows' | 'references';
export type DiffLayout = 'split' | 'unified';
/** The two views of the Preview: the code diff of every item, or one before-and-after table. */
export type PreviewTab = 'diff' | 'table';

/** Items of the Preview step shown at a time. */
export const PAGE_ITEMS = 20;

/** The guided path of one change: Preview, Apply, Result. Null while the user is choosing. */
export interface Wizard {
    readonly operation: OperationKind;
    readonly step: WizardStep;
    readonly layout: DiffLayout;
    readonly tab: PreviewTab;
    /** Items whose card is collapsed. */
    readonly collapsed: readonly string[];
    /** How many items the Preview shows. */
    readonly shown: number;
    readonly confirmOpen: boolean;
    /** Milliseconds, from the clock of the caller. */
    readonly startedAt: number;
    readonly now: number;
    readonly total: number;
    /** The rows finished so far, in order. */
    readonly live: readonly RowOutcome[];
    readonly phase: Phase;
    /** The run turns flows off and on (feature 011): its timeline has six phases. */
    readonly states: boolean;
    readonly finishedAt: number | null;
    readonly refreshFailed: boolean;
}

function freshWizard(operation: OperationKind): Wizard {
    return { operation, step: 'preview', layout: 'split', tab: 'diff', collapsed: [], shown: PAGE_ITEMS, confirmOpen: false, startedAt: 0, now: 0, total: 0, live: [], phase: 'write', states: false, finishedAt: null, refreshFailed: false };
}

export interface State {
    readonly solutions: readonly SolutionInfo[];
    /** Empty while the list of solutions is shown. */
    readonly solutionId: string;
    readonly solutionFilter: string;
    readonly solutionSort: SolutionSort;
    /** Modern flows per solution id and in total; null until counted (or when they cannot be counted). */
    readonly flowCounts: Readonly<Record<string, number>> | null;
    readonly flowTotal: number | null;
    readonly snapshot: Snapshot | null;
    readonly busy: boolean;
    readonly error: string;
    readonly view: ViewName;
    readonly filter: string;
    readonly selected: readonly string[];
    /** Rows opened to show their details (flow or reference ids). */
    readonly expanded: readonly string[];
    /** Inputs of the two operations, kept apart (constitution T2). */
    readonly newConnectionId: string;
    /** One group per category (connector): the references to replace and the one to use instead (feature 013). */
    readonly repointGroups: readonly RepointGroup[];
    readonly plan: Plan | null;
    readonly wizard: Wizard | null;
    /** The user ticked that the previewed changes were reviewed (reset with every new preview). */
    readonly planAck: boolean;
    /** The user ticked that flows will be turned off and on again (feature 011). */
    readonly stateAck: boolean;
    /** Delete only: the code the user has to copy and paste to unlock it, and what was pasted. */
    readonly confirmCode: string;
    readonly typedCode: string;
    /** The user allows the tool to turn flows that are on off and on again; off by default. */
    readonly manageState: boolean;
    /** A backup of the previewed values was saved from the dialog. */
    readonly backupSaved: boolean;
    readonly results: readonly RowOutcome[] | null;
    /** The choosing dialog (feature 010) is open; `dialogExpanded` is whether the dialogs (choosing and confirming) fill the window, kept while the tool is open. */
    readonly studio: boolean;
    readonly dialogExpanded: boolean;
    /** The step of the studio of a re-point: a category each, then the summary (feature 014). */
    readonly studioStep: number;
    /** The form of a new connection reference, open in the studio (feature 021); null when closed. */
    readonly newReference: NewReferenceForm | null;
    /** The clean up dialog (feature 022); null when closed. */
    readonly cleanup: Cleanup | null;
    /** What depends on each reference in the whole environment, by reference id (feature 023); dropped when the solution is read again. */
    readonly dependencies: Readonly<Record<string, DependencyState>>;
    /** While a merge of duplicates is being re-pointed: the duplicates to offer for removal afterwards (feature 022). */
    readonly cleanupFollowUp: { readonly ids: readonly string[]; readonly keeper: string } | null;
    /** A Remove or a Delete was started from the clean up dialog: it opens again after the Result (feature 022). */
    readonly cleanupResume: boolean;
}

export type Action =
    | { type: 'busy'; busy: boolean }
    | { type: 'error'; message: string }
    | { type: 'solutionsLoaded'; solutions: readonly SolutionInfo[] }
    | { type: 'selectSolution'; id: string }
    | { type: 'sortSolutions'; key: SolutionSortKey }
    | { type: 'flowCountsLoaded'; counts: Readonly<Record<string, number>>; total: number }
    | { type: 'setSolutionFilter'; filter: string }
    | { type: 'snapshotLoaded'; snapshot: Snapshot }
    | { type: 'setView'; view: ViewName }
    | { type: 'setFilter'; filter: string }
    | { type: 'toggle'; id: string }
    | { type: 'toggleExpand'; id: string }
    | { type: 'selectAll'; ids: readonly string[] }
    | { type: 'clearSelection' }
    | { type: 'setNewConnectionId'; value: string }
    | { type: 'openStudio' }
    | { type: 'closeStudio' }
    | { type: 'studioGo'; step: number }
    | { type: 'setDialogExpanded'; on: boolean }
    | { type: 'dependenciesLoading'; ids: readonly string[] }
    | { type: 'dependenciesLoaded'; id: string; report: DependencyReport }
    | { type: 'dependenciesFailed'; id: string; error: string }
    | { type: 'openCleanup'; tab?: CleanupTab; picked?: readonly string[] }
    | { type: 'closeCleanup' }
    | { type: 'setCleanupTab'; tab: CleanupTab }
    | { type: 'toggleCleanupUnused'; id: string }
    | { type: 'setCleanupUnused'; ids: readonly string[] }
    | { type: 'setKeeper'; group: string; id: string }
    | { type: 'toggleCleanupDeps'; id: string }
    | { type: 'dismissCleanupSummary' }
    | { type: 'startMerge'; flowIds: readonly string[]; group: RepointGroup; followUp: { readonly ids: readonly string[]; readonly keeper: string } }
    | { type: 'followUpCleanup' }
    | { type: 'openNewReference'; connectorId: string; seed?: string }
    | { type: 'applySuggestion'; suggestion: Suggestion }
    | { type: 'toggleSuggestions' }
    | { type: 'pickConnection'; id: string }
    | { type: 'connectionChecked'; typed: string; verdict: Verdict }
    | { type: 'connectionsLoading' }
    | { type: 'connectionsLoaded'; items: readonly LiveConnection[] }
    | { type: 'connectionsFailed'; error: string }
    | { type: 'setNewReferenceField'; field: 'displayName' | 'name' | 'description' | 'connectionId'; value: string }
    | { type: 'reviewNewReference'; on: boolean }
    | { type: 'toggleNewReferenceConnection'; id: string }
    | { type: 'closeNewReference' }
    | { type: 'newReferenceSaving' }
    | { type: 'newReferenceStep'; step: 'check' | 'write' | 'readback' | 'done' }
    | { type: 'newReferenceFailed'; error: string }
    | { type: 'referenceCreated'; reference: ConnectionReferenceRow; componentType?: number }
    | { type: 'setRepoint'; from: string | readonly string[]; target: string }
    | { type: 'setGroups'; groups: readonly RepointGroup[] }
    | { type: 'setGroup'; group: RepointGroup }
    | { type: 'openPlan'; plan: Plan; code?: string }
    | { type: 'setTypedCode'; value: string }
    | { type: 'replacePlan'; plan: Plan }
    | { type: 'setLayout'; layout: DiffLayout }
    | { type: 'setTab'; tab: PreviewTab }
    | { type: 'toggleItem'; id: string }
    | { type: 'showMore' }
    | { type: 'openConfirm' }
    | { type: 'closeConfirm' }
    | { type: 'applyStarted'; now: number; total: number }
    | { type: 'applyRow'; outcome: RowOutcome; now: number }
    | { type: 'tick'; now: number }
    | { type: 'rowsDone'; now: number }
    | { type: 'setAck'; on: boolean }
    | { type: 'setStateAck'; on: boolean }
    | { type: 'setManageState'; on: boolean }
    | { type: 'setPhase'; phase: Phase; now: number }
    | { type: 'backupSaved' }
    | { type: 'closePlan' }
    | { type: 'applied'; results: readonly RowOutcome[]; now?: number; refreshFailed?: boolean }
    | { type: 'dismissResults' };

export function initialState(): State {
    return {
        solutions: [],
        solutionId: '',
        solutionFilter: '',
        solutionSort: DEFAULT_SORT,
        flowCounts: null,
        flowTotal: null,
        snapshot: null,
        busy: false,
        error: '',
        view: 'flows',
        filter: '',
        selected: [],
        expanded: [],
        newConnectionId: '',
        repointGroups: [],
        plan: null,
        wizard: null,
        planAck: false,
        stateAck: false,
        confirmCode: '',
        typedCode: '',
        manageState: false,
        backupSaved: false,
        results: null,
        studio: false,
        dialogExpanded: true,
        studioStep: 0,
        newReference: null,
        cleanup: null,
        cleanupFollowUp: null,
        cleanupResume: false,
        dependencies: {},
    };
}

/**
 * The choices of a re-point must always be ones the planner accepts: the reference to replace is used by a selected
 * flow, and the new one is another reference of the same connector in the solution. Anything else is cleared.
 */
function compatible(s: State): State {
    if (s.repointGroups.length === 0) return s;
    const snap = s.snapshot;
    // only references some selected flow uses; one group per connector, in the order chosen
    const usable = snap === null ? [] : repointSources(snap, s.selected);
    const connectorOf = (n: string) => usable.find(u => u.logicalName === n)?.connectorId;
    const groups: RepointGroup[] = [];
    for (const g of s.repointGroups) {
        const from = [...new Set(g.from)].filter(n => connectorOf(n) !== undefined);
        if (from.length === 0) continue;
        const connectorId = connectorOf(from[0]!)!;
        if (groups.some(x => x.connectorId === connectorId)) continue;
        const kept = from.filter(n => connectorOf(n) === connectorId);
        groups.push({ connectorId, from: kept, target: isCompatibleTarget(snap!, kept, g.target) ? g.target : '' });
    }
    const same = groups.length === s.repointGroups.length && groups.every((g, i) => {
        const o = s.repointGroups[i]!;
        return g.connectorId === o.connectorId && g.target === o.target && g.from.length === o.from.length && g.from.every((n, k) => n === o.from[k]);
    });
    return same ? s : { ...s, repointGroups: groups };
}

/** The groups for a list of references (each connector one group); the target goes to the group of its connector. */
function groupsFor(s: State, from: readonly string[], target: string): RepointGroup[] {
    const refs = s.snapshot?.allReferences ?? [];
    const connectorOf = (n: string) => refs.find(r => r.logicalName === n)?.connectorId ?? '';
    const targetConnector = connectorOf(target);
    const order: string[] = [];
    for (const n of from) if (!order.includes(connectorOf(n))) order.push(connectorOf(n));
    return order.map((connectorId, i) => ({
        connectorId,
        from: from.filter(n => connectorOf(n) === connectorId),
        target: targetConnector === connectorId || (i === 0 && !order.includes(targetConnector)) ? target : '',
    }));
}

/** Without a preview there is nothing to acknowledge and no backup to speak of. */
function settled(s: State): State {
    const reviewing = s.wizard !== null && s.wizard.step !== 'result';
    return !reviewing && (s.planAck || s.stateAck || s.backupSaved || s.typedCode !== '') ? { ...s, planAck: false, stateAck: false, backupSaved: false, typedCode: '' } : s;
}

/** The studio only exists where there is something to choose for: a loaded, unmanaged solution and a selection. */
function studioOk(s: State): State {
    if (!s.studio) return s.newReference === null ? s : { ...s, newReference: null };
    const ok = s.snapshot !== null && !s.snapshot.solution.managed && s.selected.length > 0 && s.wizard === null;
    if (!ok) return { ...s, studio: false };
    // the last step is the summary: one step per category and then that one
    const last = s.view === 'flows' ? categoriesOf(s.snapshot!, s.selected).length : 0;
    const step = Math.min(Math.max(s.studioStep, 0), last);
    const next = step === s.studioStep ? s : { ...s, studioStep: step };
    // the form belongs to one category: another step (or a changed selection) closes it
    const cat = s.view === 'flows' ? categoriesOf(s.snapshot!, s.selected)[step] : undefined;
    return next.newReference !== null && cat?.connectorId !== next.newReference.connectorId ? { ...next, newReference: null } : next;
}

/**
 * The clean up dialog only exists where it can be used: a loaded unmanaged solution, the references view, no change being
 * previewed. Its ticks and keepers are checked against the solution as it is now.
 */
function cleanupOk(s: State): State {
    if (!s.cleanup) return s;
    // it stays behind the confirmation of a Remove or a Delete (the plan is previewed over it); any other step closes it
    const behind = s.wizard !== null && s.wizard.step === 'preview' && s.plan !== null && (s.plan.kind === 'remove' || s.plan.kind === 'delete');
    const ok = s.snapshot !== null && !s.snapshot.solution.managed && s.view === 'references' && (s.wizard === null || behind);
    if (!ok) return { ...s, cleanup: null };
    const next = pruneCleanup(s.snapshot!, s.cleanup);
    return next === s.cleanup ? s : { ...s, cleanup: next };
}

export function reducer(s: State, a: Action): State {
    return cleanupOk(studioOk(settled(compatible(step(s, a)))));
}

function step(s: State, a: Action): State {
    switch (a.type) {
        case 'busy':
            return { ...s, busy: a.busy };
        case 'error':
            return { ...s, error: a.message, busy: false };
        case 'solutionsLoaded':
            // The list may arrive before the counts: the screen keeps showing what it has (stale-while-revalidate).
            return { ...s, solutions: a.solutions, error: '' };
        case 'selectSolution':
            // A write in progress is never abandoned: the run owns the screen until its Result.
            if (s.wizard?.step === 'apply') return s;
            return { ...s, solutionId: a.id, snapshot: null, selected: [], expanded: [], plan: null, wizard: null, results: null, error: '', filter: '', repointGroups: [], newConnectionId: '', newReference: null, cleanup: null, cleanupFollowUp: null, cleanupResume: false, dependencies: {} };
        case 'sortSolutions':
            return { ...s, solutionSort: nextSort(s.solutionSort, a.key) };
        case 'flowCountsLoaded':
            return { ...s, flowCounts: a.counts, flowTotal: a.total };
        case 'setSolutionFilter':
            return { ...s, solutionFilter: a.filter };
        case 'snapshotLoaded':
            // A fresh read invalidates anything built on older data (stale-while-revalidate keeps the view, drops the plan).
{
            const open = s.wizard !== null && s.wizard.step === 'preview';
            const stale = s.wizard !== null && !open;
            return {
                ...s,
                snapshot: a.snapshot,
                dependencies: {},
                selected: s.selected.filter(id => exists(a.snapshot, id)),
                expanded: s.expanded.filter(id => exists(a.snapshot, id)),
                plan: stale ? s.plan : null,
                wizard: stale ? s.wizard : null,
                error: open ? 'The solution was read again, so the preview was closed. Choose again.' : '',
                busy: false,
            };
        }
        case 'setView':
            return { ...s, view: a.view, selected: [], expanded: [], plan: null, wizard: null, cleanupFollowUp: null };
        case 'setFilter':
            return { ...s, filter: a.filter };
        case 'toggle':
            return { ...s, selected: s.selected.includes(a.id) ? s.selected.filter(x => x !== a.id) : [...s.selected, a.id] };
        case 'toggleExpand':
            return { ...s, expanded: s.expanded.includes(a.id) ? s.expanded.filter(x => x !== a.id) : [...s.expanded, a.id] };
        case 'selectAll':
            return { ...s, selected: [...a.ids] };
        case 'clearSelection':
            return { ...s, selected: [] };
        case 'setNewConnectionId':
            return { ...s, newConnectionId: a.value };
        case 'setRepoint':
            return { ...s, repointGroups: groupsFor(s, typeof a.from === 'string' ? (a.from === '' ? [] : [a.from]) : a.from, a.target) };
        case 'setGroups':
            return { ...s, repointGroups: a.groups };
        case 'setGroup': {
            const has = s.repointGroups.some(g => g.connectorId === a.group.connectorId);
            const next = has ? s.repointGroups.map(g => (g.connectorId === a.group.connectorId ? a.group : g)) : [...s.repointGroups, a.group];
            return { ...s, repointGroups: next.filter(g => g.from.length > 0) };
        }
        case 'dismissCleanupSummary':
            return s.cleanup ? { ...s, cleanup: { ...s.cleanup, summaryHidden: true } } : s;
        case 'dependenciesLoading':
            return { ...s, cleanup: s.cleanup && s.cleanup.summaryHidden ? { ...s.cleanup, summaryHidden: false } : s.cleanup, dependencies: { ...s.dependencies, ...Object.fromEntries(a.ids.map(id => [id, { status: 'loading' } as DependencyState])) } };
        case 'dependenciesLoaded':
            return { ...s, dependencies: { ...s.dependencies, [a.id]: { status: 'ready', report: a.report } } };
        case 'dependenciesFailed':
            return { ...s, dependencies: { ...s.dependencies, [a.id]: { status: 'failed', error: a.error } } };
        case 'openCleanup': {
            if (s.snapshot === null || s.snapshot.solution.managed || s.view !== 'references' || s.wizard !== null) return s;
            const f = cleanupFigures(s.snapshot);
            const tab = a.tab ?? (f.unused === 0 && f.groups > 0 ? 'duplicates' : 'unused');
            return { ...s, studio: false, cleanup: emptyCleanup(tab, a.picked ?? []) };
        }
        case 'closeCleanup':
            return { ...s, cleanup: null, cleanupResume: false };
        case 'setCleanupTab':
            return s.cleanup ? { ...s, cleanup: { ...s.cleanup, tab: a.tab } } : s;
        case 'toggleCleanupUnused':
            return s.cleanup ? { ...s, cleanup: { ...s.cleanup, picked: s.cleanup.picked.includes(a.id) ? s.cleanup.picked.filter(x => x !== a.id) : [...s.cleanup.picked, a.id] } } : s;
        case 'setCleanupUnused':
            return s.cleanup ? { ...s, cleanup: { ...s.cleanup, picked: [...new Set(a.ids)] } } : s;
        case 'toggleCleanupDeps':
            return s.cleanup ? { ...s, cleanup: { ...s.cleanup, open: s.cleanup.open.includes(a.id) ? s.cleanup.open.filter(x => x !== a.id) : [...s.cleanup.open, a.id] } } : s;
        case 'setKeeper':
            return s.cleanup ? { ...s, cleanup: { ...s.cleanup, keepers: { ...s.cleanup.keepers, [a.group]: a.id } } } : s;
        case 'startMerge':
            // The merge is a re-point of those flows to the keeper (feature 013), chosen already; its Preview comes next.
            return { ...s, view: 'flows', selected: [...a.flowIds], expanded: [], filter: '', plan: null, wizard: null, results: null, studio: false, cleanup: null, cleanupResume: false, repointGroups: [a.group], cleanupFollowUp: a.followUp };
        case 'followUpCleanup': {
            // After the merge: the duplicates are offered for removal, ticked where they are unused now (the rest is dropped).
            const ids = s.cleanupFollowUp?.ids ?? [];
            return { ...s, view: 'references', selected: [], expanded: [], plan: null, wizard: null, results: null, repointGroups: [], cleanupFollowUp: null, cleanupResume: false, cleanup: emptyCleanup('unused', ids) };
        }
        case 'openStudio':
            return { ...s, studio: true, studioStep: 0 };
        case 'studioGo':
            return { ...s, studioStep: a.step };
        case 'closeStudio':
            return { ...s, studio: false, newReference: null };
        case 'openNewReference':
            return s.studio && s.snapshot !== null && !s.snapshot.solution.managed ? { ...s, newReference: { ...emptyForm(a.connectorId, a.seed), live: { status: 'loading', items: [], error: '' } } } : s;
        case 'setNewReferenceField':
            return s.newReference && !s.newReference.saving ? { ...s, newReference: withField(s.newReference, a.field, a.value) } : s;
        case 'applySuggestion':
            return s.newReference && !s.newReference.saving ? { ...s, newReference: withSuggestion(s.newReference, a.suggestion) } : s;
        case 'pickConnection':
            return s.newReference && !s.newReference.saving ? { ...s, newReference: withPick(s.newReference, a.id) } : s;
        case 'connectionChecked':
            return s.newReference && !s.newReference.saving ? { ...s, newReference: withChecked(s.newReference, a.typed, a.verdict) } : s;
        case 'toggleSuggestions':
            return s.newReference ? { ...s, newReference: { ...s.newReference, suggestOpen: !s.newReference.suggestOpen } } : s;
        case 'connectionsLoading':
            return s.newReference && s.newReference.live.status !== 'loading' ? { ...s, newReference: { ...s.newReference, live: { ...s.newReference.live, status: 'loading', error: '' } } } : s;
        case 'connectionsLoaded':
            return s.newReference ? { ...s, newReference: { ...s.newReference, live: { status: 'ready', items: a.items, error: '' } } } : s;
        case 'connectionsFailed':
            return s.newReference ? { ...s, newReference: { ...s.newReference, live: { status: 'unavailable', items: [], error: a.error } } } : s;
        case 'toggleNewReferenceConnection':
            return s.newReference ? { ...s, newReference: { ...s.newReference, openConnections: s.newReference.openConnections.includes(a.id) ? s.newReference.openConnections.filter(x => x !== a.id) : [...s.newReference.openConnections, a.id] } } : s;
        case 'reviewNewReference':
            return s.newReference && !s.newReference.saving ? { ...s, newReference: { ...s.newReference, reviewing: a.on, error: '' } } : s;
        case 'closeNewReference':
            return s.newReference?.saving ? s : { ...s, newReference: null };
        case 'newReferenceSaving':
            return s.newReference && s.newReference.reviewing ? { ...s, newReference: { ...s.newReference, saving: true, step: 'check', error: '' } } : s;
        case 'newReferenceStep':
            return s.newReference && s.newReference.saving ? { ...s, newReference: { ...s.newReference, step: a.step } } : s;
        case 'newReferenceFailed':
            return s.newReference ? { ...s, newReference: { ...s.newReference, saving: false, step: '', reviewing: false, error: a.error } } : s;
        case 'referenceCreated': {
            if (!s.snapshot) return s;
            const snapshot = buildSnapshotWith(s.snapshot, a.reference, a.componentType);
            // the new reference becomes the one to use instead in its category (kept only if the planner would accept it)
            const groups = s.repointGroups.map(g => (g.connectorId === a.reference.connectorId ? { ...g, target: a.reference.logicalName } : g));
            return { ...s, snapshot, repointGroups: groups, newReference: null };
        }
        case 'setDialogExpanded':
            return { ...s, dialogExpanded: a.on };
        case 'openPlan':
            return { ...s, studio: false, cleanupResume: s.cleanup !== null && (a.plan.kind === 'remove' || a.plan.kind === 'delete'), plan: a.plan, wizard: freshWizard(a.plan.kind), planAck: false, stateAck: false, backupSaved: false, confirmCode: a.code ?? '', typedCode: '' };
        case 'replacePlan':
            // The same preview with another reading of the same choices (the permission changed): what was ticked no longer applies.
            return s.wizard && s.wizard.step === 'preview' ? { ...s, plan: a.plan, planAck: false, stateAck: false, backupSaved: false } : s;
        case 'setTypedCode':
            return s.plan ? { ...s, typedCode: a.value } : s;
        case 'setAck':
            return s.plan ? { ...s, planAck: a.on } : s;
        case 'setStateAck':
            return s.plan ? { ...s, stateAck: a.on } : s;
        case 'setManageState':
            return { ...s, manageState: a.on };
        case 'setPhase':
            return s.wizard && s.wizard.step === 'apply' ? { ...s, wizard: { ...s.wizard, phase: a.phase, now: a.now } } : s;
        case 'backupSaved':
            return s.plan ? { ...s, backupSaved: true } : s;
        case 'closePlan':
            // Leaving is only possible while nothing has been written: not during Apply, not from the Result.
            return s.wizard && canMove(s.wizard.step, 'leave') && s.wizard.step !== 'result' ? { ...s, plan: null, wizard: null, cleanupFollowUp: null, cleanupResume: false, selected: s.cleanup ? [] : s.selected } : s;
        case 'setLayout':
            return s.wizard ? { ...s, wizard: { ...s.wizard, layout: a.layout } } : s;
        case 'setTab':
            return s.wizard ? { ...s, wizard: { ...s.wizard, tab: a.tab } } : s;
        case 'toggleItem':
            return s.wizard ? { ...s, wizard: { ...s.wizard, collapsed: s.wizard.collapsed.includes(a.id) ? s.wizard.collapsed.filter(x => x !== a.id) : [...s.wizard.collapsed, a.id] } } : s;
        case 'showMore':
            return s.wizard ? { ...s, wizard: { ...s.wizard, shown: s.wizard.shown + PAGE_ITEMS } } : s;
        case 'openConfirm':
            return s.wizard && s.wizard.step === 'preview' ? { ...s, wizard: { ...s.wizard, confirmOpen: true } } : s;
        case 'closeConfirm':
            return s.wizard ? { ...s, wizard: { ...s.wizard, confirmOpen: false } } : s;
        case 'applyStarted': {
            // The only way into Apply: from Preview, with the dialog open and the acknowledgements ticked (the second
            // one only when flows will be turned off).
            const states = s.plan !== null && turnOffRows(s.plan).length > 0;
            // Delete is also locked until the code that was shown has been pasted.
            const unlocked = s.plan?.kind !== 'delete' || (s.confirmCode !== '' && s.typedCode.trim() === s.confirmCode);
            return s.plan && s.wizard && s.wizard.step === 'preview' && s.wizard.confirmOpen && s.planAck && unlocked && (!states || s.stateAck)
                ? { ...s, busy: true, wizard: { ...s.wizard, step: 'apply', confirmOpen: false, startedAt: a.now, now: a.now, total: a.total, live: [], phase: states ? 'off' : 'write', states, finishedAt: null, refreshFailed: false } }
                : s;
        }
        case 'applyRow':
            return s.wizard && s.wizard.step === 'apply' ? { ...s, wizard: { ...s.wizard, live: [...s.wizard.live, a.outcome], now: a.now } } : s;
        case 'tick':
            return s.wizard && s.wizard.step === 'apply' ? { ...s, wizard: { ...s.wizard, now: a.now } } : s;
        case 'rowsDone':
            return s.wizard && s.wizard.step === 'apply' ? { ...s, wizard: { ...s.wizard, phase: 'refresh', now: a.now } } : s;
        case 'applied':
            return s.wizard
                ? { ...s, results: a.results, plan: null, busy: false, wizard: { ...s.wizard, step: 'result', phase: 'done', confirmOpen: false, now: a.now ?? s.wizard.now, finishedAt: a.now ?? s.wizard.now, refreshFailed: a.refreshFailed ?? false } }
                : { ...s, results: a.results, plan: null, busy: false };
        case 'dismissResults':
            if (s.wizard && s.wizard.step !== 'result') return s;
            // a Remove or a Delete that came from Clean up: it opens again, read anew, on the Unused tab
            return s.cleanupResume
                ? { ...s, results: null, wizard: null, cleanupFollowUp: null, cleanupResume: false, selected: [], cleanup: emptyCleanup('unused', []) }
                : { ...s, results: null, wizard: null, cleanupFollowUp: null };
    }
}

function exists(snap: Snapshot, id: string): boolean {
    return snap.flows.some(f => f.flow.id === id) || snap.references.some(r => r.reference.id === id);
}
