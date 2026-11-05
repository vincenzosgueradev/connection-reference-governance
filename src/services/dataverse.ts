import type { Host, Record_ } from '../host';
import type { ConnectionReferenceRow, FlowRow, Plan, Result, RowOutcome, SnapshotInput, SolutionInfo } from '../types';
import { readReferenceNames } from '../model/clientdata';
import { turnOffRows, writableRows } from '../model/plans';

/** Use cases over a Host. No DOM. A view never builds an OData URL. */

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHUNK = 20;
/** Component type of a workflow (Learn: SolutionComponent ComponentType, 29). */
export const WORKFLOW_COMPONENT_TYPE = 29;

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

const SOLUTION_COLUMNS = 'solutionid,friendlyname,uniquename,ismanaged,version,createdon';

function toSolution(r: Record_): SolutionInfo {
    const publisher = r['publisherid'];
    return {
        id: str(r['solutionid']),
        name: str(r['friendlyname']) || str(r['uniquename']),
        uniqueName: str(r['uniquename']),
        managed: r['ismanaged'] === true,
        version: str(r['version']),
        publisher: typeof publisher === 'object' && publisher !== null ? str((publisher as Record_)['friendlyname']) : '',
        createdOn: str(r['createdon']),
    };
}

export async function loadSolutions(host: Host): Promise<Result<SolutionInfo[]>> {
    const base = `solutions?$select=${SOLUTION_COLUMNS}`;
    const tail = '&$filter=isvisible eq true&$orderby=friendlyname';
    let rows: Record_[];
    try {
        // The publisher name is a convenience: if the expand is refused, read the solutions without it.
        try {
            rows = await host.query(`${base}&$expand=publisherid($select=friendlyname)${tail}`);
        } catch {
            rows = await host.query(`${base}${tail}`);
        }
    } catch (e) {
        return { ok: false, error: `Could not read solutions: ${message(e)}` };
    }
    return { ok: true, value: rows.filter(r => GUID.test(str(r['solutionid']))).map(toSolution) };
}

/** A query this size or bigger may have been cut by the environment; counts from it are not shown. */
const PAGE_LIMIT = 5000;

export interface FlowCounts {
    /** Modern flows per solution id. */
    readonly perSolution: Readonly<Record<string, number>>;
    /** Distinct modern flows in the solutions asked for. */
    readonly total: number;
}

/**
 * How many modern flows each of the given solutions holds, from two plain queries: the definition rows of modern flows
 * and the workflow components of every solution. Counts only what can be proven: a result that may be cut is an error.
 */
export async function loadFlowCounts(host: Host, solutionIds: readonly string[]): Promise<Result<FlowCounts>> {
    try {
        const flowRows = await host.query('workflows?$select=workflowid&$filter=category eq 5 and type eq 1');
        const components = await host.query(`solutioncomponents?$select=_solutionid_value,objectid&$filter=componenttype eq ${WORKFLOW_COMPONENT_TYPE}`);
        if (flowRows.length >= PAGE_LIMIT || components.length >= PAGE_LIMIT) return { ok: false, error: 'Too many rows to count flows reliably.' };
        const flows = new Set(flowRows.map(r => str(r['workflowid']).toLowerCase()));
        const wanted = new Set(solutionIds.map(id => id.toLowerCase()));
        const per = new Map<string, Set<string>>();
        const all = new Set<string>();
        for (const c of components) {
            const sol = str(c['_solutionid_value']).toLowerCase();
            const obj = str(c['objectid']).toLowerCase();
            if (!wanted.has(sol) || !flows.has(obj)) continue;
            per.set(sol, (per.get(sol) ?? new Set()).add(obj));
            all.add(obj);
        }
        const perSolution: Record<string, number> = {};
        for (const id of solutionIds) perSolution[id] = per.get(id.toLowerCase())?.size ?? 0;
        return { ok: true, value: { perSolution, total: all.size } };
    } catch (e) {
        return { ok: false, error: `Could not count flows: ${message(e)}` };
    }
}

function toReference(r: Record_): ConnectionReferenceRow {
    return {
        id: str(r['connectionreferenceid']),
        logicalName: str(r['connectionreferencelogicalname']),
        displayName: str(r['connectionreferencedisplayname']),
        connectorId: str(r['connectorid']),
        connectionId: str(r['connectionid']),
        customConnectorId: str(r['_customconnectorid_value']).toLowerCase(),
        ownerName: '',
        ownerId: str(r['_ownerid_value']).toLowerCase(),
        managed: r['ismanaged'] === true,
    };
}

/**
 * Names of the users and teams that own references, from plain queries (no custom request headers).
 * A failure here only leaves names empty: the owner id is still known and nothing is hidden.
 */
async function ownerNames(host: Host, ids: readonly string[]): Promise<Map<string, string>> {
    const names = new Map<string, string>();
    const sources: readonly [string, string, string][] = [['systemusers', 'systemuserid', 'fullname'], ['teams', 'teamid', 'name']];
    for (let i = 0; i < ids.length; i += CHUNK) {
        const filterFor = (key: string) => ids.slice(i, i + CHUNK).map(id => `${key} eq ${id}`).join(' or ');
        for (const [set, key, nameColumn] of sources) {
            try {
                const rows = await host.query(`${set}?$select=${key},${nameColumn}&$filter=${filterFor(key)}`);
                for (const r of rows) {
                    const id = str(r[key]).toLowerCase();
                    if (GUID.test(id) && str(r[nameColumn]) !== '') names.set(id, str(r[nameColumn]));
                }
            } catch {
                // names are a convenience; keep going
            }
        }
    }
    return names;
}

export async function loadSnapshotInput(host: Host, solution: SolutionInfo): Promise<Result<SnapshotInput>> {
    if (!GUID.test(solution.id)) return { ok: false, error: 'Invalid solution id.' };
    try {
        const components = await host.query(`solutioncomponents?$select=objectid,componenttype&$filter=_solutionid_value eq ${solution.id}`);
        const memberIds = components.map(c => str(c['objectid']).toLowerCase()).filter(id => GUID.test(id));
        const memberSet = new Set(memberIds);

        const refRows = await host.query(
            'connectionreferences?$select=connectionreferenceid,connectionreferencelogicalname,connectionreferencedisplayname,connectorid,connectionid,ismanaged,_ownerid_value,_customconnectorid_value',
        );
        const found = refRows.map(toReference).filter(r => GUID.test(r.id));
        const names = await ownerNames(host, [...new Set(found.map(r => r.ownerId).filter(id => GUID.test(id)))]);
        const references = found.map(r => ({ ...r, ownerName: names.get(r.ownerId) ?? '' }));
        const memberReferenceIds = references.filter(r => memberSet.has(r.id.toLowerCase())).map(r => r.id);

        // Flows: members of type workflow, read in chunks so the URL stays short; category 5 keeps modern flows only.
        const flowCandidates = components.filter(c => c['componenttype'] === WORKFLOW_COMPONENT_TYPE).map(c => str(c['objectid'])).filter(id => GUID.test(id));
        const flows: FlowRow[] = [];
        for (let i = 0; i < flowCandidates.length; i += CHUNK) {
            const ids = flowCandidates.slice(i, i + CHUNK);
            const filter = ids.map(id => `workflowid eq ${id}`).join(' or ');
            const rows = await host.query(`workflows?$select=workflowid,name,statecode,ismanaged,clientdata,description,createdon,modifiedon,_ownerid_value&$filter=category eq 5 and type eq 1 and (${filter})`);
            for (const r of rows)
                flows.push({
                    id: str(r['workflowid']),
                    name: str(r['name']),
                    stateCode: typeof r['statecode'] === 'number' ? r['statecode'] : 0,
                    managed: r['ismanaged'] === true,
                    clientData: str(r['clientdata']),
                    description: str(r['description']),
                    createdOn: str(r['createdon']),
                    modifiedOn: str(r['modifiedon']),
                    ownerId: str(r['_ownerid_value']).toLowerCase(),
                    ownerName: '',
                });
        }
        const owners = await ownerNames(host, [...new Set(flows.map(f => f.ownerId).filter(id => GUID.test(id)))]);
        const named = flows.map(f => ({ ...f, ownerName: owners.get(f.ownerId) ?? '' }));
        named.sort((a, b) => a.name.localeCompare(b.name));
        // No verified source for connection owner/state yet (specs/000-connection-reference-governance/research.md).
        return { ok: true, value: { solution, references, memberReferenceIds, flows: named, connections: {} } };
    } catch (e) {
        return { ok: false, error: `Could not read the solution: ${message(e)}` };
    }
}

/** Current stored value of the column a plan row writes, or undefined when the row cannot be read. */
async function readCurrent(host: Host, entity: Plan['entity'], row: { id: string; field: string }): Promise<string | undefined> {
    if (!GUID.test(row.id)) return undefined;
    const set = entity === 'workflow' ? 'workflows' : 'connectionreferences';
    const key = entity === 'workflow' ? 'workflowid' : 'connectionreferenceid';
    const rows = await host.query(`${set}?$select=${row.field}&$filter=${key} eq ${row.id}`);
    return rows.length === 1 ? str(rows[0]![row.field]) : undefined;
}

/** What a row that was written and read back says. */
export const VERIFIED = 'Written and read back.';

export type RunPhase = 'off' | 'write' | 'on';

/** The stored state of a flow (0 draft, 1 activated, 2 suspended), or undefined when it cannot be read. */
async function readState(host: Host, id: string): Promise<number | undefined> {
    if (!GUID.test(id)) return undefined;
    const rows = await host.query(`workflows?$select=statecode&$filter=workflowid eq ${id}`);
    const v = rows.length === 1 ? rows[0]!['statecode'] : undefined;
    return typeof v === 'number' ? v : undefined;
}

/** Turns a flow off (draft) or on (activated) with the official state and status values, and reads the state back. */
async function setFlowState(host: Host, id: string, to: 'off' | 'on'): Promise<string | undefined> {
    try {
        await host.update('workflow', id, to === 'off' ? { statecode: 0, statuscode: 1 } : { statecode: 1, statuscode: 2 });
        const now = await readState(host, id);
        return now === (to === 'off' ? 0 : 1) ? undefined : `the environment accepted the change but the flow is ${now === 1 ? 'still on' : now === 0 ? 'still off' : 'in an unknown state'}`;
    } catch (e) {
        return message(e);
    }
}

/**
 * Applies a confirmed plan. Flows that are on and marked to be turned off are turned off first (the stored state must
 * still be the expected one, and is read back), then every row is written one by one (the stored value is read again
 * and must still be the one the preview showed; after the write it is read back), then every flow that was turned off
 * is turned on again, whatever happened to its write, and read back. A failure never stops the other rows.
 */
export async function applyPlan(host: Host, plan: Plan, onRow?: (outcome: RowOutcome, done: number, total: number) => void, onPhase?: (phase: RunPhase) => void): Promise<RowOutcome[]> {
    const outcomes: RowOutcome[] = [];
    const writable = new Set(writableRows(plan).map(r => r.id));
    const emit = (outcome: RowOutcome) => {
        outcomes.push(outcome);
        try {
            onRow?.(outcome, outcomes.length, plan.rows.length); // each row is reported as soon as it is finished
        } catch {
            // a failing listener must never stop the run
        }
    };
    const outOf = (row: { id: string; label: string }, status: RowOutcome['status'], msg: string, stateChange?: RowOutcome['stateChange']): RowOutcome =>
        ({ id: row.id, label: row.label, status, message: msg, ...(stateChange ? { stateChange } : {}) });

    // 1. turn off the flows that are on
    const offRows = turnOffRows(plan);
    const turnedOff = new Set<string>();
    const settled = new Set<string>();
    if (offRows.length > 0) {
        onPhase?.('off');
        for (const row of offRows) {
            try {
                const state = await readState(host, row.id);
                if (state !== 1) {
                    settled.add(row.id);
                    emit(outOf(row, 'skipped', 'The state changed since the preview (the flow is no longer on); the flow was left alone and nothing was written.'));
                    continue;
                }
                const err = await setFlowState(host, row.id, 'off');
                if (err !== undefined) {
                    settled.add(row.id);
                    emit(outOf(row, 'failed', `The flow could not be turned off: ${err}. Nothing was written.`));
                    continue;
                }
                turnedOff.add(row.id);
            } catch (e) {
                settled.add(row.id);
                emit(outOf(row, 'failed', `The flow could not be turned off: ${message(e)}. Nothing was written.`));
            }
        }
    }

    // 2. write
    onPhase?.('write');
    const held = new Map<string, RowOutcome>(); // outcomes of flows that are off until they are on again
    for (const row of plan.rows) {
        if (settled.has(row.id)) continue;
        const out = (status: RowOutcome['status'], msg: string) => {
            const outcome = outOf(row, status, msg);
            if (turnedOff.has(row.id)) held.set(row.id, outcome);
            else emit(outcome);
        };
        if (!writable.has(row.id)) {
            out('skipped', row.blocked ?? 'Blocked.');
            continue;
        }
        try {
            const before = await readCurrent(host, plan.entity, row);
            if (before === undefined) {
                out('skipped', 'The row could not be read again; nothing was written.');
                continue;
            }
            if (before !== row.expectedCurrent) {
                out('skipped', 'Changed by someone else since the preview; nothing was written. Refresh and preview again.');
                continue;
            }
            await host.update(plan.entity, row.id, { [row.field]: row.payload });
            const after = await readCurrent(host, plan.entity, row);
            if (!confirmed(plan.kind, row, after)) out('failed', 'Written, but the stored value could not be confirmed. Check the row before relying on it.');
            else out('done', VERIFIED);
        } catch (e) {
            out('failed', message(e));
        }
    }

    // 3. turn on again every flow that was turned off, whatever happened to its write
    if (turnedOff.size > 0) {
        onPhase?.('on');
        for (const row of plan.rows) {
            if (!turnedOff.has(row.id)) continue;
            const result = held.get(row.id) ?? outOf(row, 'failed', 'The row was not processed.');
            let err: string | undefined;
            try {
                err = await setFlowState(host, row.id, 'on');
            } catch (e) {
                err = message(e);
            }
            if (err === undefined) emit({ ...result, stateChange: 'back-on' });
            else emit(outOf(row, 'failed', `${row.label} could not be turned on again: ${err}. It is off: turn it on in the maker portal.${result.status === 'done' ? ' The change itself was written.' : ` ${result.message}`}`, 'left-off'));
        }
    }
    return outcomes;
}

function confirmed(kind: Plan['kind'], row: { newValue: string; oldValue: string; payload: string }, after: string | undefined): boolean {
    if (after === undefined) return false;
    if (kind === 'connection') return after === row.payload;
    // A re-point may hold several references on each side (one per category): the stored names must be exactly the
    // names of the payload that was written, and none of the replaced ones may remain.
    const want = readReferenceNames(row.payload);
    const got = readReferenceNames(after);
    if (!want.ok || !got.ok) return false;
    const gone = row.oldValue.split(',').map(n => n.trim()).filter(n => n !== '' && !want.value.includes(n));
    return want.value.length === got.value.length && want.value.every(n => got.value.includes(n)) && gone.every(n => !got.value.includes(n));
}
