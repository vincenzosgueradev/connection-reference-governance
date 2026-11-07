import type { Host, Record_ } from '../host';
import type { ConnectionReferenceRow, FlowRow, LiveConnection, Plan, Result, RowOutcome, Snapshot, SnapshotInput, SolutionInfo } from '../types';
import { readReferenceNames } from '../model/clientdata';
import { turnOffRows, writableRows } from '../model/plans';
import { parseConnections, verifyConnection, normalizeConnectionName } from '../model/liveConnections';
import { checkForm, newReferenceRecord, type NewReferenceForm } from '../model/newReference';

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
        prefix: typeof publisher === 'object' && publisher !== null ? str((publisher as Record_)['customizationprefix']) : '',
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
            rows = await host.query(`${base}&$expand=publisherid($select=friendlyname,customizationprefix)${tail}`);
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

/** Emails of the given users (`internalemailaddress`), from a plain query; a failure only leaves them out. */
async function ownerEmails(host: Host, ids: readonly string[]): Promise<Map<string, string>> {
    const emails = new Map<string, string>();
    for (let i = 0; i < ids.length; i += CHUNK) {
        try {
            const filter = ids.slice(i, i + CHUNK).map(id => `systemuserid eq ${id}`).join(' or ');
            const rows = await host.query(`systemusers?$select=systemuserid,internalemailaddress&$filter=${filter}`);
            for (const r of rows) {
                const id = str(r['systemuserid']).toLowerCase();
                if (GUID.test(id) && str(r['internalemailaddress']) !== '') emails.set(id, str(r['internalemailaddress']));
            }
        } catch {
            // emails are a convenience
        }
    }
    return emails;
}

export async function loadSnapshotInput(host: Host, solution: SolutionInfo): Promise<Result<SnapshotInput>> {
    if (!GUID.test(solution.id)) return { ok: false, error: 'Invalid solution id.' };
    try {
        const components = await host.query(`solutioncomponents?$select=objectid,componenttype&$filter=_solutionid_value eq ${solution.id}`);
        const memberIds = components.map(c => str(c['objectid']).toLowerCase()).filter(id => GUID.test(id));
        const memberSet = new Set(memberIds);
        const memberTypes: Record<string, number> = {};
        for (const c of components) {
            const id = str(c['objectid']).toLowerCase();
            if (GUID.test(id) && typeof c['componenttype'] === 'number') memberTypes[id] = c['componenttype'];
        }

        const refRows = await host.query(
            'connectionreferences?$select=connectionreferenceid,connectionreferencelogicalname,connectionreferencedisplayname,connectorid,connectionid,ismanaged,_ownerid_value,_customconnectorid_value',
        );
        const found = refRows.map(toReference).filter(r => GUID.test(r.id));
        const names = await ownerNames(host, [...new Set(found.map(r => r.ownerId).filter(id => GUID.test(id)))]);
        const emails = await ownerEmails(host, [...new Set(found.map(r => r.ownerId).filter(id => GUID.test(id)))]);
        const references = found.map(r => ({ ...r, ownerName: names.get(r.ownerId) ?? '', ownerEmail: emails.get(r.ownerId) ?? '' }));
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
        return { ok: true, value: { solution, references, memberReferenceIds, memberTypes, flows: named, connections: {} } };
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
        if (plan.kind === 'remove' || plan.kind === 'delete') {
            const r = await removalRow(host, plan, row);
            out(r.status, r.message);
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

    // A deleted flow is not turned on again: it is gone (or, when the delete failed, it stays off and the result says so).
    if (plan.kind === 'delete') {
        for (const row of plan.rows) {
            const result = held.get(row.id);
            if (!result) continue;
            emit(result.status === 'done' ? result : { ...result, message: `${result.message} The flow was turned off by this run and is still off.`, stateChange: 'left-off' });
        }
        return outcomes;
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

/** The component type to ask about for a row: what the solution stored; a flow is a workflow whatever it says. */
const typeOf = (snapshotTypes: Readonly<Record<string, number>>, id: string, isFlow: boolean): number | undefined => snapshotTypes[id.toLowerCase()] ?? (isFlow ? WORKFLOW_COMPONENT_TYPE : undefined);

/** What depends on each row, read from the environment; a row that cannot be read is undefined (and is never deleted). */
export async function readDependencies(host: Host, snapshot: Snapshot, ids: readonly string[]): Promise<Record<string, readonly { id: string; type: number }[] | undefined>> {
    const out: Record<string, readonly { id: string; type: number }[] | undefined> = {};
    // independent questions: asked a few at a time, not one after the other
    const ask = async (id: string) => {
        const type = typeOf(snapshot.componentTypes, id, snapshot.flows.some(f => f.flow.id === id));
        if (type === undefined || !GUID.test(id)) { out[id] = undefined; return; }
        try {
            out[id] = await host.dependencies(type, id);
        } catch {
            out[id] = undefined;
        }
    };
    for (let i = 0; i < ids.length; i += 5) await Promise.all(ids.slice(i, i + 5).map(ask));
    return out;
}

const tableOf = (plan: Plan, row: { entity?: Plan['entity'] }): Plan['entity'] => row.entity ?? plan.entity;

async function rowExists(host: Host, table: Plan['entity'], id: string): Promise<boolean> {
    const set = table === 'workflow' ? 'workflows' : 'connectionreferences';
    const key = table === 'workflow' ? 'workflowid' : 'connectionreferenceid';
    return (await host.query(`${set}?$select=${key}&$filter=${key} eq ${id}`)).length > 0;
}

async function isMember(host: Host, solutionId: string, id: string): Promise<boolean> {
    return (await host.query(`solutioncomponents?$select=objectid&$filter=_solutionid_value eq ${solutionId} and objectid eq ${id}`)).length > 0;
}

/** What a removed row says once the membership is gone, and what a deleted row says once it is gone. */
export const REMOVED = 'Removed from the solution and read back.';
export const DELETED = 'Deleted and read back.';

/**
 * One row of a remove or a delete (feature 016). The state is read again just before (the preview may be old) and read
 * back after: a row is "done" only when the environment shows the result. It never throws.
 */
async function removalRow(host: Host, plan: Plan, row: Plan['rows'][number]): Promise<{ status: RowOutcome['status']; message: string }> {
    const table = tableOf(plan, row);
    try {
        if (!GUID.test(row.id)) return { status: 'skipped', message: 'The row has no valid id; nothing was changed.' };
        if (plan.kind === 'remove') {
            const solution = plan.solution;
            if (!solution || !GUID.test(solution.id) || row.componentType === undefined) return { status: 'skipped', message: 'The solution or the component type is not known; nothing was changed.' };
            if (!(await isMember(host, solution.id, row.id))) return { status: 'skipped', message: 'It is not in the solution any more; nothing was changed. Refresh and preview again.' };
            await host.removeFromSolution(solution.uniqueName, row.id, row.componentType);
            if (await isMember(host, solution.id, row.id)) return { status: 'failed', message: 'The environment accepted the request but the row is still in the solution. Check it in the maker portal.' };
            return { status: 'done', message: REMOVED };
        }
        if (!(await rowExists(host, table, row.id))) return { status: 'skipped', message: 'The row is already gone; nothing was changed. Refresh and preview again.' };
        // Checked again now, not only when the plan was built: something may have started to depend on it since.
        if (row.componentType === undefined) return { status: 'skipped', message: 'The component type is not known, so its dependencies cannot be checked; nothing was deleted.' };
        let deps: readonly { id: string; type: number }[];
        try {
            deps = await host.dependencies(row.componentType, row.id);
        } catch (e) {
            return { status: 'skipped', message: `The dependencies could not be checked (${message(e)}); nothing was deleted.` };
        }
        const planned = new Set(writableRows(plan).map(r => r.id)); // a row that is blocked stays, so it still depends
        const outside = deps.filter(d => !planned.has(d.id));
        if (outside.length > 0) return { status: 'skipped', message: `${outside.length} other component${outside.length === 1 ? '' : 's'} depend${outside.length === 1 ? 's' : ''} on it; nothing was deleted.` };
        if (table === 'workflow') {
            const state = await readState(host, row.id);
            if (state !== 0) return { status: 'skipped', message: 'The flow is not off (its state changed since the preview); it was not deleted.' };
        }
        await host.remove(table, row.id);
        if (await rowExists(host, table, row.id)) return { status: 'failed', message: 'The environment accepted the request but the row still exists. Check it in the maker portal.' };
        return { status: 'done', message: DELETED };
    } catch (e) {
        return { status: 'failed', message: message(e) };
    }
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

const REFERENCE_COLUMNS = 'connectionreferenceid,connectionreferencelogicalname,connectionreferencedisplayname,connectorid,connectionid,ismanaged,_ownerid_value,_customconnectorid_value';

/**
 * The `componenttype` of a connection reference, read and never guessed (constitution T5): from the members of the
 * solution, else from any reference of the environment as stored in a solution, else from the component definitions.
 */
export async function referenceComponentType(host: Host, snapshot: Snapshot): Promise<number | undefined> {
    for (const r of snapshot.references) {
        const t = snapshot.componentTypes[r.reference.id.toLowerCase()];
        if (typeof t === 'number') return t;
    }
    try {
        const any = snapshot.allReferences.find(r => GUID.test(r.id));
        if (any) {
            const rows = await host.query(`solutioncomponents?$select=componenttype&$filter=objectid eq ${any.id}`);
            const t = rows.map(r => r['componenttype']).find((v): v is number => typeof v === 'number');
            if (t !== undefined) return t;
        }
    } catch {
        // try the next source
    }
    try {
        const rows = await host.query("solutioncomponentdefinitions?$select=solutioncomponenttype&$filter=primaryentityname eq 'connectionreference'");
        return rows.map(r => r['solutioncomponenttype']).find((v): v is number => typeof v === 'number');
    } catch {
        return undefined;
    }
}

/** The connections of the environment (Power Platform API). An error value, never a throw, when they cannot be read. */
export async function loadLiveConnections(host: Host): Promise<Result<LiveConnection[]>> {
    try {
        const id = await host.environmentId();
        if (id === '') return { ok: false, error: 'the environment id could not be read' };
        return { ok: true, value: parseConnections(await host.listConnections(id)) };
    } catch (e) {
        return { ok: false, error: message(e) };
    }
}

/** A reference just created in the solution, with the component type it was added with (so Remove and Delete know it at once). */
export interface CreatedReference {
    readonly reference: ConnectionReferenceRow;
    readonly componentType: number;
}

/** The visible steps of a creation, in order: each is reported when it starts. */
export type CreateStep = 'check' | 'write' | 'readback';

/** What a created reference says once it is in the solution and read back. */
export const CREATED = 'Created, added to the solution and read back.';

/**
 * Creates a connection reference in an unmanaged solution (feature 021). The form is checked again, the name is checked
 * against the environment, the component type is read, the row is created, added to the solution and read back. When the
 * row exists but the rest fails, the row is deleted again; the error says what happened to it. Never throws.
 */
export async function createReference(host: Host, snapshot: Snapshot, form: NewReferenceForm, onStep?: (step: CreateStep) => void): Promise<Result<CreatedReference>> {
    const step = (s: CreateStep) => {
        try {
            onStep?.(s);
        } catch {
            // a failing listener must never stop the write
        }
    };
    const solution = snapshot.solution;
    if (solution.managed) return { ok: false, error: 'A managed solution cannot be changed.' };
    if (!GUID.test(solution.id)) return { ok: false, error: 'Invalid solution id.' };
    const check = checkForm(snapshot, form);
    if (!check.ok) return { ok: false, error: Object.values(check.errors)[0] ?? 'The form is not valid.' };
    const record = newReferenceRecord(snapshot, form);
    const logicalName = String(record['connectionreferencelogicalname']);
    let id = '';
    let created = false;
    const undo = async (why: string): Promise<Result<CreatedReference>> => {
        if (!created) return { ok: false, error: why };
        try {
            if (GUID.test(id)) {
                await host.remove('connectionreference', id);
                if (!(await rowExists(host, 'connectionreference', id))) return { ok: false, error: `${why} The reference that had just been created was deleted again; nothing was left behind.` };
            }
        } catch {
            // reported below
        }
        return { ok: false, error: `${why} The reference ${logicalName}${GUID.test(id) ? ` (${id})` : ''} was created and could not be deleted again: delete it in the maker portal.` };
    };
    try {
        step('check');
        const taken = await host.query(`connectionreferences?$select=connectionreferenceid&$filter=connectionreferencelogicalname eq '${logicalName}'`);
        if (taken.length > 0) return { ok: false, error: `${logicalName} already exists in this environment; nothing was created.` };
        // a connection is asked about again now: it must still exist, for this connector, before anything is written
        const connection = normalizeConnectionName(form.connectionId);
        if (connection !== '') {
            const live = await loadLiveConnections(host);
            if (!live.ok) return { ok: false, error: `The connection could not be verified (${live.error}); nothing was created.` };
            const verdict = verifyConnection({ status: 'ready', items: live.value, error: '' }, form.connectorId, connection);
            if (verdict !== 'found') return { ok: false, error: verdict === 'other-connector' ? 'The connection belongs to another connector; nothing was created.' : 'The connection was not found among your connections; nothing was created.' };
        }
        const type = await referenceComponentType(host, snapshot);
        if (type === undefined) return { ok: false, error: 'The component type of a connection reference could not be read, so it could not be added to the solution; nothing was created.' };

        step('write');
        id = (await host.create('connectionreference', record)).toLowerCase();
        created = true;
        if (!GUID.test(id)) {
            const found = await host.query(`connectionreferences?$select=connectionreferenceid&$filter=connectionreferencelogicalname eq '${logicalName}'`);
            id = str(found[0]?.['connectionreferenceid']).toLowerCase();
            if (!GUID.test(id)) return await undo('The environment did not return the id of the new reference.');
        }
        await host.addToSolution(solution.uniqueName, id, type);
        step('readback');
        if (!(await isMember(host, solution.id, id))) return await undo('The reference was created but it is not in the solution.');
        const rows = await host.query(`connectionreferences?$select=${REFERENCE_COLUMNS}&$filter=connectionreferenceid eq ${id}`);
        const row = rows[0] ? toReference(rows[0]) : undefined;
        if (!row || row.logicalName !== logicalName || row.connectorId !== form.connectorId || row.connectionId !== normalizeConnectionName(form.connectionId))
            return await undo('The reference was written but what is stored is not what was asked.');
        const names = await ownerNames(host, GUID.test(row.ownerId) ? [row.ownerId] : []);
        return { ok: true, value: { reference: { ...row, ownerName: names.get(row.ownerId) ?? '' }, componentType: type } };
    } catch (e) {
        return await undo(`Could not create the reference: ${message(e)}.`);
    }
}

