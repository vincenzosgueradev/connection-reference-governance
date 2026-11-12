import { features } from '../features';
import type { ConnectionDependencyReport, DepState } from '../model/connectionDeps';
import { canSelect, DEFAULT_CONN_SORT, filterRows, type ConnFilter, type ConnSort, type ConnSortKey } from '../model/connections';
import { DELETION_STEPS, writableRows, type ConnectionDeletePlan, type DeletionStep } from '../model/connectionPlan';
import type { UsageMap } from '../model/connectorUsage';
import type { ConnectionRow, RowOutcome } from '../types';

/**
 * The state of the Connections area (feature 024). Pure: no DOM, no host. Its actions all start with `cm`.
 * Invariants: a loaded list drops what was read about the old one; only an eligible connection can be ticked; a
 * deletion can be opened only while the flag is on, from a non-empty selection, and is left only before or after its run.
 */

/** Rows drawn at a time (FR-2403). */
export const CONN_PAGE = 100;

export interface CmListState {
    readonly status: 'idle' | 'loading' | 'ready' | 'failed';
    readonly items: readonly ConnectionRow[];
    /** How many connections are in so far while the pages arrive. */
    readonly read: number;
    readonly error: string;
}

export interface CmCheckAll {
    readonly total: number;
    readonly done: number;
    readonly startedAt: number;
    readonly now: number;
    readonly step: 'apps' | 'references' | 'connections';
    readonly cancelled: boolean;
    /** Set when only the ticked connections are read: their names. Null when every connection is read. */
    readonly only: readonly string[] | null;
}

/** One line of the live log of a deletion: when (ms since the start), what, and how it went. */
export interface CmLogLine {
    readonly at: number;
    readonly text: string;
    readonly tone: 'info' | 'success' | 'warning' | 'error';
}

export interface CmDeletion {
    readonly plan: ConnectionDeletePlan;
    readonly step: 'preview' | 'apply' | 'result';
    /** The one-time code shown, and what was typed. */
    readonly code: string;
    readonly typedCode: string;
    readonly ack: boolean;
    /** The names the author confirmed in the Maker portal (Flows using this connection): the tool cannot see the flows of the flow service. */
    readonly portalChecked: readonly string[];
    readonly backupSaved: boolean;
    readonly startedAt: number;
    readonly now: number;
    readonly total: number;
    readonly live: readonly RowOutcome[];
    /** The connection being worked on and the step it is at. */
    readonly current: { readonly id: string; readonly label: string; readonly step: DeletionStep } | null;
    readonly log: readonly CmLogLine[];
    readonly results: readonly RowOutcome[] | null;
    readonly refreshFailed: boolean;
}

export interface CmUsage {
    readonly status: 'idle' | 'loading' | 'ready' | 'failed';
    readonly map: UsageMap | null;
    readonly error: string;
}

export interface ConnectionsState {
    readonly list: CmListState;
    readonly environmentId: string;
    readonly filter: ConnFilter;
    readonly connector: string;
    readonly search: string;
    readonly sort: ConnSort;
    /** How many rows are drawn. */
    readonly shown: number;
    /** Names of the rows that are open. */
    readonly open: readonly string[];
    /** Names that are ticked; only eligible ones can be here. */
    readonly selected: readonly string[];
    readonly deps: Readonly<Record<string, DepState>>;
    readonly checkAll: CmCheckAll | null;
    /** What the inventory says about the connectors: a hint beside the verdict. */
    readonly usage: CmUsage;
    readonly deletion: CmDeletion | null;
}

export type ConnectionsAction =
    | { type: 'cmLoading' }
    | { type: 'cmPage'; count: number }
    | { type: 'cmLoaded'; items: readonly ConnectionRow[]; environmentId: string; keepDeps?: boolean }
    | { type: 'cmFailed'; error: string }
    | { type: 'cmUsageLoading' }
    | { type: 'cmUsageLoaded'; map: UsageMap }
    | { type: 'cmUsageFailed'; error: string }
    | { type: 'cmFilter'; filter: ConnFilter }
    | { type: 'cmConnector'; key: string }
    | { type: 'cmSearch'; text: string }
    | { type: 'cmSort'; key: ConnSortKey }
    | { type: 'cmShowMore' }
    | { type: 'cmToggleOpen'; name: string }
    | { type: 'cmDepsLoading'; names: readonly string[] }
    | { type: 'cmDepsLoaded'; name: string; report: ConnectionDependencyReport }
    | { type: 'cmDepsFailed'; name: string; error: string }
    | { type: 'cmCheckAllStarted'; total: number; now: number; only?: readonly string[] }
    | { type: 'cmCheckAllStep'; step: CmCheckAll['step'] }
    | { type: 'cmCheckAllProgress'; done: number; now: number }
    | { type: 'cmCheckAllFinished' }
    | { type: 'cmCheckAllCancel' }
    | { type: 'cmToggle'; name: string }
    | { type: 'cmSelectEligible' }
    | { type: 'cmClearSelection' }
    | { type: 'cmDeletionOpen'; plan: ConnectionDeletePlan; code: string }
    | { type: 'cmDeletionTyped'; text: string }
    | { type: 'cmDeletionAck'; on: boolean }
    | { type: 'cmDeletionPortal'; name: string; on: boolean }
    | { type: 'cmDeletionPortalAll'; on: boolean }
    | { type: 'cmDeletionBackupSaved' }
    | { type: 'cmDeletionApply'; now: number }
    | { type: 'cmDeletionStep'; id: string; label: string; step: DeletionStep; now: number }
    | { type: 'cmDeletionTick'; now: number }
    | { type: 'cmDeletionRow'; outcome: RowOutcome; now: number }
    | { type: 'cmDeletionDone'; results: readonly RowOutcome[]; refreshFailed: boolean; now: number }
    | { type: 'cmDeletionClose' };

export const isConnectionsAction = (a: { type: string }): a is ConnectionsAction => a.type.startsWith('cm');

export function emptyConnections(): ConnectionsState {
    return {
        list: { status: 'idle', items: [], read: 0, error: '' },
        environmentId: '',
        filter: 'all',
        connector: '',
        search: '',
        sort: DEFAULT_CONN_SORT,
        shown: CONN_PAGE,
        open: [],
        selected: [],
        deps: {},
        checkAll: null,
        usage: { status: 'idle', map: null, error: '' },
        deletion: null,
    };
}

/** The names the current filter, connector and search show. */
export const shownNames = (c: ConnectionsState): string[] => filterRows(c.list.items, c.deps, c.filter, c.connector, c.search).map(r => r.name);

const eligible = (c: ConnectionsState, name: string): boolean => {
    const row = c.list.items.find(r => r.name === name);
    return row !== undefined && canSelect(row, c.deps);
};

/** The selection after anything that can change who is shown or who is eligible: only shown, eligible names stay. */
function prune(c: ConnectionsState): ConnectionsState {
    if (c.selected.length === 0) return c;
    const shown = new Set(shownNames(c));
    const selected = c.selected.filter(n => shown.has(n) && eligible(c, n));
    return selected.length === c.selected.length ? c : { ...c, selected };
}

export function connectionsStep(c: ConnectionsState, a: ConnectionsAction): ConnectionsState {
    switch (a.type) {
        case 'cmLoading':
            // a new read drops what was read about the old list; filter, search, sort and the scroll belong to the user and stay
            return { ...c, list: { ...c.list, status: 'loading', read: 0, error: '' }, deps: {}, selected: [], checkAll: null };
        case 'cmPage':
            return c.list.status === 'loading' ? { ...c, list: { ...c.list, read: a.count } } : c;
        case 'cmLoaded': {
            const names = new Set(a.items.map(r => r.name));
            return { ...c, list: { status: 'ready', items: a.items, read: a.items.length, error: '' }, environmentId: a.environmentId, open: c.open.filter(n => names.has(n)), selected: [], deps: a.keepDeps ? Object.fromEntries(Object.entries(c.deps).filter(([n, d]) => names.has(n) && d.status !== 'loading')) : {}, checkAll: null };
        }
        case 'cmFailed':
            // what was on the screen stays (stale while revalidate), with the reason
            return { ...c, list: { ...c.list, status: 'failed', error: a.error }, checkAll: null };
        case 'cmUsageLoading':
            return { ...c, usage: { status: 'loading', map: c.usage.map, error: '' } };
        case 'cmUsageLoaded':
            return { ...c, usage: { status: 'ready', map: a.map, error: '' } };
        case 'cmUsageFailed':
            return { ...c, usage: { status: 'failed', map: null, error: a.error } };
        case 'cmFilter':
            return prune({ ...c, filter: a.filter, shown: CONN_PAGE });
        case 'cmConnector':
            return prune({ ...c, connector: a.key, shown: CONN_PAGE });
        case 'cmSearch':
            return prune({ ...c, search: a.text, shown: CONN_PAGE });
        case 'cmSort':
            return { ...c, sort: c.sort.key === a.key ? { key: a.key, dir: c.sort.dir === 'asc' ? 'desc' : 'asc' } : { key: a.key, dir: 'asc' } };
        case 'cmShowMore':
            return { ...c, shown: c.shown + CONN_PAGE };
        case 'cmToggleOpen':
            return { ...c, open: c.open.includes(a.name) ? c.open.filter(n => n !== a.name) : [...c.open, a.name] };
        case 'cmDepsLoading': {
            const deps = { ...c.deps };
            for (const n of a.names) deps[n] = { status: 'loading' };
            return { ...c, deps };
        }
        case 'cmDepsLoaded':
            // an answer for a connection that left the list is ignored
            if (!c.list.items.some(r => r.name === a.name)) return c;
            return prune({ ...c, deps: { ...c.deps, [a.name]: { status: 'ready', report: a.report } } });
        case 'cmDepsFailed':
            if (!c.list.items.some(r => r.name === a.name)) return c;
            return prune({ ...c, deps: { ...c.deps, [a.name]: { status: 'failed', error: a.error } } });
        case 'cmCheckAllStarted':
            return { ...c, checkAll: { total: a.total, done: 0, startedAt: a.now, now: a.now, step: 'apps', cancelled: false, only: a.only ?? null } };
        case 'cmCheckAllStep':
            return c.checkAll ? { ...c, checkAll: { ...c.checkAll, step: a.step } } : c;
        case 'cmCheckAllProgress':
            return c.checkAll ? { ...c, checkAll: { ...c.checkAll, done: a.done, now: a.now } } : c;
        case 'cmCheckAllCancel':
            return c.checkAll ? { ...c, checkAll: { ...c.checkAll, cancelled: true } } : c;
        case 'cmCheckAllFinished':
            return { ...c, checkAll: null };
        case 'cmToggle': {
            if (!eligible(c, a.name)) return c; // an ineligible connection can never be ticked
            return { ...c, selected: c.selected.includes(a.name) ? c.selected.filter(n => n !== a.name) : [...c.selected, a.name] };
        }
        case 'cmSelectEligible': {
            const shown = new Set(shownNames(c));
            return { ...c, selected: c.list.items.filter(r => shown.has(r.name) && canSelect(r, c.deps)).map(r => r.name) };
        }
        case 'cmClearSelection':
            return c.selected.length === 0 ? c : { ...c, selected: [] };
        case 'cmDeletionOpen':
            // only while the flag is on, from a plan that has something to write, and never over a run
            if (!features.connectionDelete || c.deletion !== null || writableRows(a.plan).length === 0) return c;
            return { ...c, deletion: { plan: a.plan, step: 'preview', code: a.code, typedCode: '', ack: false, portalChecked: [], backupSaved: false, startedAt: 0, now: 0, total: 0, live: [], current: null, log: [], results: null, refreshFailed: false } };
        case 'cmDeletionTyped':
            return c.deletion && c.deletion.step === 'preview' ? { ...c, deletion: { ...c.deletion, typedCode: a.text } } : c;
        case 'cmDeletionAck':
            return c.deletion && c.deletion.step === 'preview' ? { ...c, deletion: { ...c.deletion, ack: a.on } } : c;
        case 'cmDeletionPortal': {
            const d = c.deletion;
            // only a connection of the plan that can be written can be confirmed, and only before the run
            if (!d || d.step !== 'preview' || !writableRows(d.plan).some(r => r.name === a.name)) return c;
            const has = d.portalChecked.includes(a.name);
            if (a.on === has) return c;
            return { ...c, deletion: { ...d, portalChecked: a.on ? [...d.portalChecked, a.name] : d.portalChecked.filter(n => n !== a.name) } };
        }
        case 'cmDeletionPortalAll': {
            const d = c.deletion;
            // the author asked for a select all: every connection of the run, or none; only in the Preview
            if (!d || d.step !== 'preview') return c;
            return { ...c, deletion: { ...d, portalChecked: a.on ? writableRows(d.plan).map(r => r.name) : [] } };
        }
        case 'cmDeletionBackupSaved':
            return c.deletion ? { ...c, deletion: { ...c.deletion, backupSaved: true } } : c;
        case 'cmDeletionApply': {
            const d = c.deletion;
            // reachable only from a confirmed Preview: the code typed exactly and the acknowledgement on
            if (!d || d.step !== 'preview' || d.typedCode.trim() !== d.code || !d.ack) return c;
            // every connection of the run was confirmed in the portal one by one
            if (!writableRows(d.plan).every(r => d.portalChecked.includes(r.name))) return c;
            return { ...c, deletion: { ...d, step: 'apply', startedAt: a.now, now: a.now, total: writableRows(d.plan).length, live: [], current: null, log: [{ at: 0, text: `Started: ${writableRows(d.plan).length} connection${writableRows(d.plan).length === 1 ? '' : 's'} to delete.`, tone: 'info' }] } };
        }
        case 'cmDeletionStep': {
            const d = c.deletion;
            if (!d || d.step !== 'apply') return c;
            const doing = DELETION_STEPS.find(x => x.key === a.step)!.doing;
            return { ...c, deletion: { ...d, now: a.now, current: { id: a.id, label: a.label, step: a.step }, log: [...d.log, { at: a.now - d.startedAt, text: `${a.label}: ${doing}`, tone: 'info' }] } };
        }
        case 'cmDeletionTick':
            return c.deletion && c.deletion.step === 'apply' ? { ...c, deletion: { ...c.deletion, now: a.now } } : c;
        case 'cmDeletionRow': {
            const d = c.deletion;
            if (!d || d.step !== 'apply') return c;
            const tone = a.outcome.status === 'done' ? 'success' : a.outcome.status === 'failed' ? 'error' : 'warning';
            return { ...c, deletion: { ...d, live: [...d.live, a.outcome], now: a.now, current: null, log: [...d.log, { at: a.now - d.startedAt, text: `${a.outcome.label}: ${a.outcome.message}`, tone }] } };
        }
        case 'cmDeletionDone':
            return c.deletion && c.deletion.step === 'apply' ? { ...c, deletion: { ...c.deletion, step: 'result', results: a.results, refreshFailed: a.refreshFailed, now: a.now } } : c;
        case 'cmDeletionClose':
            // a run is never abandoned
            if (!c.deletion || c.deletion.step === 'apply') return c;
            // after a run the search is cleared too: it was how the connection was found, and what is left would be hidden by it
            return c.deletion.step === 'result' ? { ...c, deletion: null, selected: [], search: '', shown: CONN_PAGE } : { ...c, deletion: null };
    }
}
