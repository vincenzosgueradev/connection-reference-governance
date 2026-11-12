import type { ConnectionRow } from '../types';
import { heldOnlyByReferences, type DepState, type Verdict } from './connectionDeps';

/**
 * The Connections area, pure (feature 024, constitution T11): figures, filters, search, sorting and who may be ticked.
 * "No dependency found" and "in use" count only connections whose dependencies were really read.
 */

export type ConnFilter = 'all' | 'broken' | 'none' | 'inuse';
export type ConnSortKey = 'name' | 'connector' | 'status' | 'modified';
export interface ConnSort {
    readonly key: ConnSortKey;
    readonly dir: 'asc' | 'desc';
}

export const DEFAULT_CONN_SORT: ConnSort = { key: 'name', dir: 'asc' };
export const FILTER_LABEL: Readonly<Record<ConnFilter, string>> = { all: 'All', broken: 'Broken', none: 'No dependency found', inuse: 'In use' };
export const STATUS_LABEL: Readonly<Record<ConnectionRow['status'], string>> = { connected: 'Connected', reconnect: 'Needs reconnect', error: 'Error', unknown: 'Unknown' };

/** Needs reconnect or Error: the one meaning of "broken" everywhere (figure, filter, selection). */
export const isBroken = (r: ConnectionRow): boolean => r.status === 'error' || r.status === 'reconnect';

export type Deps = Readonly<Record<string, DepState | undefined>>;

/** The verdict of a connection when its dependencies were read; undefined while unchecked, loading or failed to read at all. */
export function verdictFor(deps: Deps, name: string): Verdict | undefined {
    const d = deps[name];
    return d?.status === 'ready' ? d.report.verdict : undefined;
}

/** Only a connection whose dependencies were read, with no source failed and nothing found, can be ticked (FR-2408). */
/**
 * A Logic flows connection belongs to a flow: the environment refuses to delete it on its own (AdminDeleteLogicFlowConnectionsNotAllowed:
 * "you can delete the flow which will delete the corresponding logicflow connection"). It is never offered for deletion here.
 */
export const isFlowOwned = (row: ConnectionRow): boolean => /logicflows?$/i.test(row.connectorKey);
export const FLOW_OWNED_REASON = 'It belongs to a flow: the environment only deletes it together with that flow, so it is not offered here.';

export const canSelect = (row: ConnectionRow, deps: Deps): boolean => !isFlowOwned(row) && verdictFor(deps, row.name) === 'none-found';

export const eligibleNames = (rows: readonly ConnectionRow[], deps: Deps): string[] => rows.filter(r => canSelect(r, deps)).map(r => r.name);

export interface ConnFigures {
    readonly total: number;
    readonly broken: number;
    /** Of the checked ones. */
    readonly noneFound: number;
    readonly inUse: number;
    /** How many were checked at all (verdict known, even `unchecked-source`). */
    readonly checked: number;
}

export function figuresOf(rows: readonly ConnectionRow[], deps: Deps): ConnFigures {
    let noneFound = 0;
    let inUse = 0;
    let checked = 0;
    for (const r of rows) {
        const v = verdictFor(deps, r.name);
        if (v === undefined) continue;
        checked++;
        if (v === 'none-found' && !isFlowOwned(r)) noneFound++;
        if (v === 'in-use') inUse++;
    }
    return { total: rows.length, broken: rows.filter(isBroken).length, noneFound, inUse, checked };
}

const norm = (t: string) => t.trim().toLowerCase();

export function filterRows(rows: readonly ConnectionRow[], deps: Deps, filter: ConnFilter, connector: string, search: string): ConnectionRow[] {
    const q = norm(search);
    return rows.filter(r => {
        if (connector !== '' && r.connectorKey !== connector) return false;
        if (filter === 'broken' && !isBroken(r)) return false;
        if (filter === 'none' && (verdictFor(deps, r.name) !== 'none-found' || isFlowOwned(r))) return false;
        if (filter === 'inuse' && verdictFor(deps, r.name) !== 'in-use') return false;
        if (q === '') return true;
        return [r.name, r.displayName, r.connectorName, r.connectorKey, r.creator.name, r.creator.email].some(t => norm(t).includes(q));
    });
}

const STATUS_ORDER: Readonly<Record<ConnectionRow['status'], number>> = { error: 0, reconnect: 1, unknown: 2, connected: 3 };

const byName = (a: ConnectionRow, b: ConnectionRow): number => (a.displayName || a.name).localeCompare(b.displayName || b.name) || a.name.localeCompare(b.name);

export function sortRows(rows: readonly ConnectionRow[], sort: ConnSort): ConnectionRow[] {
    const sign = sort.dir === 'asc' ? 1 : -1;
    const compare = (a: ConnectionRow, b: ConnectionRow): number => {
        switch (sort.key) {
            case 'connector':
                return a.connectorName.localeCompare(b.connectorName) || byName(a, b);
            case 'status':
                return STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || byName(a, b);
            case 'modified':
                return a.modifiedTime.localeCompare(b.modifiedTime) || byName(a, b);
            default:
                return byName(a, b);
        }
    };
    return [...rows].sort((a, b) => sign * compare(a, b));
}

/** The connectors present, for the connector filter: key and name, by name. */
export function connectorsOf(rows: readonly ConnectionRow[]): { key: string; name: string }[] {
    const seen = new Map<string, string>();
    for (const r of rows) if (r.connectorKey !== '' && !seen.has(r.connectorKey)) seen.set(r.connectorKey, r.connectorName || r.connectorKey);
    return [...seen.entries()].map(([key, name]) => ({ key, name })).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * A short code that tells connections with the same name apart in a list: the first eight hex digits of the unique part of
 * the id (the last 8 characters when there is none). The whole id is always in the tooltip and in the details.
 */
export function shortId(name: string): string {
    const m = /([0-9a-f]{8})-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.exec(name);
    return m ? m[1]!.toLowerCase() : name.slice(-8);
}

/** The order Check all reads the connections in: by connector, then by name, so the pipeline advances one connector after another. */
export function checkOrder(rows: readonly ConnectionRow[]): ConnectionRow[] {
    return [...rows].sort((a, b) => (a.connectorName || a.connectorKey).localeCompare(b.connectorName || b.connectorKey) || byName(a, b));
}

export type StageState = 'pending' | 'active' | 'done';

export interface PipelineConnector {
    readonly key: string;
    readonly name: string;
    readonly total: number;
    readonly done: number;
    readonly state: StageState;
}

export interface Pipeline {
    readonly apps: StageState;
    readonly references: StageState;
    readonly connectors: readonly PipelineConnector[];
    readonly total: number;
    readonly done: number;
}

/**
 * The blocks of the Check all pipeline: the apps, the connection references, then one block per connector with how many of
 * its connections were read. A connection counts as read when its dependencies are ready or failed. Only the first block
 * that is not finished is active (and any block that has begun), so the eye follows one place.
 */
export function pipelineOf(rows: readonly ConnectionRow[], deps: Deps, step: 'apps' | 'references' | 'connections'): Pipeline {
    const byKey = new Map<string, { name: string; total: number; done: number; loading: boolean }>();
    for (const r of checkOrder(rows)) {
        const g = byKey.get(r.connectorKey) ?? { name: r.connectorName || r.connectorKey || 'Unknown connector', total: 0, done: 0, loading: false };
        g.total++;
        const d = deps[r.name];
        if (d?.status === 'ready' || d?.status === 'failed') g.done++;
        if (d?.status === 'loading') g.loading = true;
        byKey.set(r.connectorKey, g);
    }
    let firstOpen = true;
    const connectors: PipelineConnector[] = [...byKey.entries()].map(([key, g]) => {
        const complete = g.done === g.total;
        let state: StageState = 'pending';
        if (complete) state = 'done';
        else if (step === 'connections' && (firstOpen || g.done > 0 || g.loading)) state = 'active';
        if (!complete) firstOpen = false;
        return { key, name: g.name, total: g.total, done: g.done, state };
    });
    return {
        apps: step === 'apps' ? 'active' : 'done',
        references: step === 'apps' ? 'pending' : step === 'references' ? 'active' : 'done',
        connectors,
        total: rows.length,
        done: connectors.reduce((n, c) => n + c.done, 0),
    };
}

/** What the row says about its dependencies: the one wording for the list, the figures and the dialogs. */
export function dependencyLabel(deps: Deps, name: string, row?: ConnectionRow): { text: string; tone: 'neutral' | 'info' | 'success' | 'warning'; title?: string } {
    const d = deps[name];
    if (row !== undefined && isFlowOwned(row)) return { text: 'Belongs to a flow', tone: 'neutral', title: FLOW_OWNED_REASON };
    if (d === undefined) return { text: 'Not checked', tone: 'neutral' };
    if (d.status === 'loading') return { text: 'Checking...', tone: 'info' };
    if (d.status === 'failed') return { text: 'Could not be checked', tone: 'warning' };
    if (d.report.verdict === 'in-use') {
        const n = d.report.dependents.length;
        // a reference that holds it is a dependency (the reference would lose its connection), but nothing was found running on it
        if (heldOnlyByReferences(d.report)) return { text: `Held by ${n} reference${n === 1 ? '' : 's'}`, tone: 'info', title: 'Only connection references hold this connection: no flow, app or agent was found using them. It still cannot be deleted by this run, because the reference would be left without its connection.' };
        return { text: `In use (${n})`, tone: 'info' };
    }
    if (d.report.verdict === 'none-found') return { text: 'No dependency found', tone: 'success' };
    return { text: 'Could not be checked', tone: 'warning' };
}
