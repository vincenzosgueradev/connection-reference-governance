import type { ConnectionRow } from '../types';
import { problemSources, SOURCE_LABEL } from './connectionDeps';
import { canSelect, FLOW_OWNED_REASON, isFlowOwned, verdictFor, type Deps } from './connections';

/**
 * The plan of a deletion of connections (feature 024, constitution T11, T3). Pure; nothing here writes. A row that is not
 * eligible stays in the plan as blocked with the reason, so a plan can never hold a connection with a dependency, with an
 * unread source or unchecked as writable.
 */

export interface ConnectionDeleteRow {
    readonly name: string;
    readonly label: string;
    readonly connector: string;
    readonly connectorKey: string;
    readonly creator: string;
    /** Why the row will not be written, when it will not be. */
    readonly blocked?: string;
}

export interface ConnectionDeletePlan {
    readonly rows: readonly ConnectionDeleteRow[];
    /** Things to read before confirming; they do not block. */
    readonly warnings: readonly string[];
    /** The text of the backup file: records, no secret and no email. */
    readonly backup: string;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** Why this connection cannot be deleted by this run; undefined when it can. */
export function blockReason(row: ConnectionRow, deps: Deps): string | undefined {
    if (canSelect(row, deps)) return undefined;
    if (isFlowOwned(row)) return FLOW_OWNED_REASON;
    const d = deps[row.name];
    if (d === undefined || d.status === 'loading') return 'Its dependencies were not read, so nothing is deleted.';
    if (d.status === 'failed') return 'Its dependencies could not be read, so nothing is deleted.';
    const v = verdictFor(deps, row.name);
    if (v === 'in-use') return `Something depends on it (${d.report.dependents.length}): it cannot be deleted by this run.`;
    return 'A source could not be read, so nothing is deleted.';
}

/** The records of the backup: the fields listed in the data model, never an email and never a secret. */
export function backupRecords(rows: readonly ConnectionRow[]): { name: string; connector: string; displayName: string; creator: string; createdTime: string; status: string }[] {
    return rows.map(r => ({ name: r.name, connector: r.connectorKey, displayName: r.displayName, creator: r.creator.name, createdTime: r.createdTime, status: r.status }));
}

export function planConnectionDeletion(rows: readonly ConnectionRow[], deps: Deps, selected: readonly string[]): ConnectionDeletePlan {
    const chosen = new Set(selected);
    const picked = rows.filter(r => chosen.has(r.name));
    const planRows: ConnectionDeleteRow[] = picked.map(r => {
        const blocked = blockReason(r, deps);
        return { name: r.name, label: r.displayName || r.name, connector: r.connectorName, connectorKey: r.connectorKey, creator: r.creator.name, ...(blocked !== undefined ? { blocked } : {}) };
    });
    const writable = planRows.filter(r => r.blocked === undefined);
    const warnings: string[] = [];
    warnings.push('Delete is permanent: the connections are removed from the environment. Undo is not possible.');
    if (writable.length > 0) warnings.push('A connection reference that still holds the id of a deleted connection will show it as missing, and anything that needs it will have to be connected again.');
    if (writable.length > 0) warnings.push('This tool cannot see the flows that the flow service has bound to a connection (the Maker portal shows them under "Flows using this connection"). Check the portal first.');
    // what was not looked at, repeated here so the user reads it before confirming
    const notScanned = new Set<string>();
    for (const r of writable) {
        const d = deps[r.name];
        if (d?.status !== 'ready') continue;
        for (const p of problemSources(d.report)) if (p.state.status === 'notScanned') notScanned.add(`${SOURCE_LABEL[p.name]}${p.state.reason === '' ? '' : ` (${p.state.reason})`}`);
    }
    for (const n of notScanned) warnings.push(`Not scanned: ${n}. Something there may still use ${plural(writable.length, 'this connection', 'these connections')}.`);
    const blocked = planRows.length - writable.length;
    if (blocked > 0) warnings.push(`${blocked} ${plural(blocked, 'connection is', 'connections are')} blocked and will not be deleted.`);
    const backup = JSON.stringify({ kind: 'connections-before-delete', connections: backupRecords(picked) }, null, 2);
    return { rows: planRows, warnings, backup };
}

export const writableRows = (plan: ConnectionDeletePlan): ConnectionDeleteRow[] => plan.rows.filter(r => r.blocked === undefined);

/** The four things done to each connection, in order. */
export type DeletionStep = 'check' | 'exists' | 'delete' | 'verify';
export const DELETION_STEPS: readonly { readonly key: DeletionStep; readonly label: string; readonly doing: string }[] = [
    { key: 'check', label: 'Check', doing: 'Reading what depends on it again' },
    { key: 'exists', label: 'Find', doing: 'Making sure it is still in the environment' },
    { key: 'delete', label: 'Delete', doing: 'Sending the delete request' },
    { key: 'verify', label: 'Read back', doing: 'Reading the list again to confirm it is gone' },
];
/** How far a run is, from 0 to 100: each connection counts for its finished steps (the last 5 percent is the final reading). */
export function deletionPercent(done: number, total: number, step: DeletionStep | null): number {
    if (total <= 0) return 0;
    const inside = step === null ? 0 : DELETION_STEPS.findIndex(x => x.key === step) / DELETION_STEPS.length;
    return Math.min(95, Math.round(((Math.min(done, total) + inside) / total) * 95));
}
