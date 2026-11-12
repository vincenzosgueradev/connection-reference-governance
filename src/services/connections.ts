import type { Host, Record_ } from '../host';
import { parseApps, type AppUse } from '../model/apps';
import { allOk, mergeReport, type ConnectionDependencyReport, type ElsewhereFlow, type SourceName, type SourceState } from '../model/connectionDeps';
import { isFlowOwned, type Deps } from '../model/connections';
import { blockReason, writableRows, type ConnectionDeletePlan, type DeletionStep } from '../model/connectionPlan';
import { addUsage, connectorIdOf, rowsOfUsagePage, skipTokenOf, type FlowCandidate, type Inventory } from '../model/connectorUsage';
import { nextOf, parseConnectionRows } from '../model/liveConnections';
import { STATE_LABEL } from '../model/dependencies';
import { features } from '../features';
import type { ConnectionDependent, ConnectionRow, Result, RowOutcome } from '../types';
import { loadReferenceDependents, noScope, solutionsOfComponents } from './dependencies';

/**
 * The Connections area: reading the connections, what depends on each, Check all, and the guarded deletion (feature 024,
 * constitution T11). Read only except `applyConnectionDeletion`, which does nothing while the flag is off. No DOM.
 */

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** More pages than this is a loop, not a list. */
const MAX_PAGES = 200;
/** How many connections Check all reads at a time. */
export const CHECK_CONCURRENCY = 4;

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
/** A readable reason: the wrapper of the remote call is cut, and a refusal of the toolbox's permission is said in words. */
export function message(e: unknown): string {
    const raw = e instanceof Error ? e.message : String(e);
    if (/ClientScopeAuthorizationFailed/i.test(raw)) return 'the toolbox is not allowed to call this API (its application has no permission for it)';
    return raw.replace(/^Error invoking remote method '[^']*':\s*(Error:\s*)?/i, '').replace(/^Power Platform request failed:\s*/i, '');
}

// ---- the list -----------------------------------------------------------------------------------------------------------

/** Every connection the signed-in user can see, page by page. An error is a value; a failing later page fails the whole read. */
export async function loadConnections(host: Host, onPage?: (count: number) => void): Promise<Result<{ rows: ConnectionRow[]; environmentId: string }>> {
    try {
        const environmentId = await host.environmentId();
        if (environmentId === '') return { ok: false, error: 'The id of the environment could not be read, so its connections cannot be listed.' };
        const rows = new Map<string, ConnectionRow>();
        const tokens = new Set<string>();
        let next = '';
        for (let page = 0; page < MAX_PAGES; page++) {
            const res = await host.listConnections(environmentId, next);
            // the connections that belong to a flow are not listed: they come and go with their flow, and the environment refuses to delete them alone
            for (const r of parseConnectionRows(res)) if (!isFlowOwned(r)) rows.set(r.name, r);
            onPage?.(rows.size);
            next = nextOf(res);
            if (next === '' || tokens.has(next)) break; // the last page, or a token that came back
            tokens.add(next);
        }
        return { ok: true, value: { rows: [...rows.values()], environmentId } };
    } catch (e) {
        return { ok: false, error: `The connections could not be read: ${message(e)}` };
    }
}

/** What the inventory says about the connectors of the environment (a hint, FR-2425). An error is a value: the tool goes on without it. */
export async function loadConnectorUsage(host: Host, environmentId: string): Promise<Result<Inventory>> {
    try {
        const into: Record<string, { flows: number; apps: number; agents: number }> = {};
        const flows: Record<string, FlowCandidate[]> = {};
        const tokens = new Set<string>();
        let token = '';
        for (let page = 0; page < MAX_PAGES; page++) {
            const res = await host.queryConnectorUsage(environmentId, token);
            addUsage(into, rowsOfUsagePage(res), flows);
            token = skipTokenOf(res);
            if (token === '' || tokens.has(token)) break;
            tokens.add(token);
        }
        return { ok: true, value: { usage: into, flows } };
    } catch (e) {
        return { ok: false, error: message(e) };
    }
}

// ---- the dependencies ---------------------------------------------------------------------------------------------------

export interface ReferenceUse {
    readonly id: string;
    readonly logicalName: string;
    readonly displayName: string;
    /** The connection it holds, lower case; empty when none. */
    readonly connectionId: string;
}

type Read<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: string };

/**
 * The reads that every connection shares: the apps of the environment, its connection references and the component type
 * of a reference. Each is read once and kept until `invalidate()` (a refresh of the list), so Check all costs a few
 * calls per connection and not a few hundred.
 */
export interface DepsContext {
    readonly environmentId: string;
    apps(): Promise<Read<AppUse[]>>;
    references(): Promise<Read<ReferenceUse[]>>;
    referenceType(): Promise<number | undefined>;
    /** What the inventory says (read once, shared with the hint of the area). */
    inventory(): Promise<Result<Inventory>>;
    /** The definitions of flows by the id of their row in the workflow table; a flow that cannot be read is `null`. Each is read once. */
    flowDefinitions(ids: readonly string[]): Promise<Map<string, FlowDefinition | null>>;
    invalidate(): void;
}

/** What is needed of a flow's definition to tell which connections it uses. */
export interface FlowDefinition {
    readonly name: string;
    readonly state: string;
    /** The logical names of the connection references the definition names, lower case. */
    readonly references: readonly string[];
    /** The names of the connections the definition holds directly (flows outside a solution), lower case. */
    readonly connections: readonly string[];
}

const REFERENCE_NAME = /"connectionReferenceLogicalName"\s*:\s*"([^"]+)"/gi;
const CONNECTION_NAME = /shared-[a-z0-9]+-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/gi;

export function definitionOf(row: Record_): FlowDefinition {
    const data = str(row['clientdata']);
    return {
        name: str(row['name']),
        state: typeof row['statecode'] === 'number' ? STATE_LABEL[row['statecode']] ?? '' : '',
        references: [...new Set([...data.matchAll(REFERENCE_NAME)].map(m => m[1]!.toLowerCase()))],
        connections: [...new Set((data.match(CONNECTION_NAME) ?? []).map(c => c.toLowerCase()))],
    };
}

export function makeContext(host: Host, environmentId: string): DepsContext {
    let apps: Promise<Read<AppUse[]>> | undefined;
    let refs: Promise<Read<ReferenceUse[]>> | undefined;
    let type: Promise<number | undefined> | undefined;
    let inventory: Promise<Result<Inventory>> | undefined;
    const defs = new Map<string, FlowDefinition | null>();
    const readApps = async (): Promise<Read<AppUse[]>> => {
        try {
            const out: AppUse[] = [];
            const tokens = new Set<string>();
            let next = '';
            for (let page = 0; page < MAX_PAGES; page++) {
                const res = await host.listApps(environmentId, next);
                out.push(...parseApps(res));
                next = nextOf(res);
                if (next === '' || tokens.has(next)) break;
                tokens.add(next);
            }
            return { ok: true, value: out };
        } catch (e) {
            return { ok: false, reason: message(e) };
        }
    };
    const readRefs = async (): Promise<Read<ReferenceUse[]>> => {
        try {
            const rows = await host.query('connectionreferences?$select=connectionreferenceid,connectionreferencelogicalname,connectionreferencedisplayname,connectionid');
            return {
                ok: true,
                value: rows
                    .map(r => ({ id: str(r['connectionreferenceid']).toLowerCase(), logicalName: str(r['connectionreferencelogicalname']), displayName: str(r['connectionreferencedisplayname']), connectionId: str(r['connectionid']).trim().toLowerCase() }))
                    .filter(r => GUID.test(r.id)),
            };
        } catch (e) {
            return { ok: false, reason: message(e) };
        }
    };
    const readType = async (): Promise<number | undefined> => {
        try {
            const rows = await host.query("solutioncomponentdefinitions?$select=solutioncomponenttype&$filter=primaryentityname eq 'connectionreference'");
            const t = rows[0]?.['solutioncomponenttype'];
            return typeof t === 'number' ? t : undefined;
        } catch {
            return undefined;
        }
    };
    const flowDefinitions = async (ids: readonly string[]): Promise<Map<string, FlowDefinition | null>> => {
        const todo = [...new Set(ids)].filter(i => !defs.has(i));
        for (let i = 0; i < todo.length; i += 10) {
            const chunk = todo.slice(i, i + 10);
            try {
                const rows = await host.query(`workflows?$select=workflowid,name,statecode,clientdata&$filter=${chunk.map(c => `workflowid eq ${c}`).join(' or ')}`);
                for (const r of rows) defs.set(str(r['workflowid']).toLowerCase(), definitionOf(r));
            } catch {
                // a chunk that cannot be read leaves its flows unreadable, which is said and never guessed
            }
            for (const c of chunk) if (!defs.has(c)) defs.set(c, null);
        }
        return new Map(ids.map(i => [i, defs.get(i) ?? null]));
    };
    return {
        environmentId,
        inventory: () => (inventory ??= loadConnectorUsage(host, environmentId)),
        flowDefinitions,
        apps: () => (apps ??= readApps()),
        references: () => (refs ??= readRefs()),
        referenceType: () => (type ??= readType()),
        invalidate() {
            apps = undefined;
            refs = undefined;
            type = undefined;
            inventory = undefined;
            defs.clear();
        },
    };
}

const kindOf = (k: string): ConnectionDependent['kind'] => (k === 'flow' || k === 'agent' || k === 'app' ? k : 'other');
const failedState = (reason: string): SourceState => ({ status: 'failed', reason });
/** The notes of feature 023 that say the agents source could not be read (not just that a name could not). */
const AGENT_SOURCE_NOTE = /^The agents that use it|^The agent components that use it/;

/**
 * What depends on one connection, from four sources read on their own: apps, connection references, flows (through the
 * references that hold it, and by name inside definitions when the environment allows it) and agents. A source that
 * fails is named and never hides the others; the verdict is `none-found` only when no source failed and nothing was found.
 */
export async function loadConnectionDependencies(host: Host, ctx: DepsContext, row: ConnectionRow): Promise<ConnectionDependencyReport> {
    const found: ConnectionDependent[] = [];
    const sources: Record<SourceName, SourceState> = allOk();
    const key = row.name.toLowerCase();

    // 1. apps
    const apps = await ctx.apps();
    if (apps.ok) {
        for (const a of apps.value) if (a.connections.includes(key)) found.push({ kind: 'app', id: a.id, name: a.name, state: '', ownerName: a.owner, solutions: [], via: '' });
        sources.apps = { status: 'ok', detail: `${apps.value.length} ${apps.value.length === 1 ? 'app' : 'apps'}` };
    } else sources.apps = failedState(apps.reason);

    // 2. connection references that hold it (any solution)
    const refs = await ctx.references();
    let holding: ReferenceUse[] = [];
    if (refs.ok) {
        holding = refs.value.filter(r => r.connectionId === key);
        sources.references = { status: 'ok', detail: `${refs.value.length} connection ${refs.value.length === 1 ? 'reference' : 'references'} (${holding.length} ${holding.length === 1 ? 'holds' : 'hold'} it)` };
        const where = await solutionsOfComponents(host, holding.map(r => r.id));
        for (const r of holding) found.push({ kind: 'reference', id: r.id, name: r.displayName || r.logicalName, state: '', ownerName: '', solutions: where?.get(r.id) ?? [], via: '' });
    } else sources.references = failedState(refs.reason);

    // 3 and 4. flows and agents through the references that hold the connection
    if (!refs.ok) {
        sources.flows = failedState('the connection references could not be read, so the flows that use them are not known');
        sources.agents = failedState('the connection references could not be read, so the agents that use them are not known');
    } else if (holding.length > 0) {
        const type = await ctx.referenceType();
        if (type === undefined) {
            sources.flows = failedState('the component type of a connection reference could not be read');
            sources.agents = failedState('the component type of a connection reference could not be read');
        } else {
            for (const r of holding) {
                const res = await loadReferenceDependents(host, noScope, r, type);
                if (!res.ok) {
                    sources.flows = failedState(res.error);
                    sources.agents = failedState(res.error);
                    continue;
                }
                for (const n of res.value.notes) if (AGENT_SOURCE_NOTE.test(n)) sources.agents = failedState(n);
                for (const d of res.value.items) found.push({ kind: kindOf(d.kind), id: d.id, name: d.name, state: d.state, ownerName: d.owner, solutions: d.solutions, via: r.displayName || r.logicalName });
            }
        }
    }

    // dependency tracking can leave a flow out, so the definitions of the flows are searched too: for the connection by name (flows outside a solution
    // hold it so) and for the name of each reference that holds it (a flow that uses a reference names it in its definition)
    try {
        const needles = [{ text: row.name, via: '' }, ...holding.map(r => ({ text: r.logicalName, via: r.displayName || r.logicalName })).filter(n => n.text !== '')];
        let searched = 0;
        let returned = 0; // how many flows the search of the definitions gave back for the references (0 for a reference that has flows says the filter does not work on this column)
        for (const n of needles) {
            const rows: Record_[] = await host.searchFlowsByConnection(n.text);
            searched++;
            if (n.via !== '') returned += rows.length;
            for (const f of rows) {
                const id = str(f['workflowid']).toLowerCase();
                if (id === '') continue;
                found.push({ kind: 'flow', id, name: str(f['name']) || id, state: typeof f['statecode'] === 'number' ? STATE_LABEL[f['statecode']] ?? '' : '', ownerName: '', solutions: [], via: n.via });
            }
        }
        if (sources.flows.status === 'ok' && holding.length > 0 && searched > 1) sources.flows = { status: 'ok', detail: `flows (dependency tracking; the search of their definitions for ${holding.length === 1 ? 'the reference' : `${holding.length} references`} gave back ${returned})` };
    } catch (e) {
        if (sources.flows.status === 'ok') sources.flows = { status: 'notScanned', reason: `the definitions of the flows could not be searched: ${message(e)}` };
    }

    let awayAll: ElsewhereFlow[] = [];
    // 5. the flows the inventory names for this connector: each one is read, and told apart as using this connection, using another, or unclear
    const inv = await ctx.inventory();
    if (inv.ok && sources.flows.status === 'ok') {
        const candidates = inv.value.flows[connectorIdOf(row.connectorKey)] ?? [];
        const have = new Set(found.filter(f => f.kind === 'flow').map(f => f.id));
        const todo = candidates.filter(c => c.workflowId === '' || !have.has(c.workflowId));
        if (todo.length > 0) {
            const readable = await ctx.flowDefinitions(todo.map(c => c.workflowId).filter(i => i !== ''));
            const logical = new Map((refs.ok ? refs.value : []).map(r => [r.logicalName.toLowerCase(), r]));
            const holdingNames = new Set(holding.map(r => r.logicalName.toLowerCase()));
            let confirmed = 0;
            let elsewhere = 0;
            const away: ElsewhereFlow[] = [];
            const unclear: string[] = [];
            for (const c of todo) {
                const def = c.workflowId === '' ? null : readable.get(c.workflowId) ?? null;
                if (def === null) {
                    unclear.push(c.name);
                    continue;
                }
                const mine = def.connections.includes(key) || def.references.some(n => holdingNames.has(n));
                if (mine) {
                    confirmed++;
                    found.push({ kind: 'flow', id: c.workflowId, name: def.name || c.name, state: def.state, ownerName: '', solutions: [], via: 'the inventory' });
                    continue;
                }
                const uses = def.references.map(n => logical.get(n));
                // every reference of the flow is known and holds another connection: this flow does not use this one
                if (uses.length > 0 && uses.every(r => r !== undefined && r.connectionId !== '' && r.connectionId !== key)) {
                    elsewhere++;
                    away.push({ name: def.name || c.name, references: uses.map(r => ({ name: r!.displayName || r!.logicalName, connection: r!.connectionId })) });
                }
                else unclear.push(c.name);
            }
            awayAll = away;
            const shown = unclear.slice(0, 8).join(', ') + (unclear.length > 8 ? ` and ${unclear.length - 8} more` : '');
            if (unclear.length > 0) sources.flows = failedState(`the inventory names ${todo.length} ${todo.length === 1 ? 'flow' : 'flows'} that use this connector and ${unclear.length} could not be tied to a connection (${shown}); check them in the Maker portal`);
            else sources.flows = { status: 'ok', detail: `flows (dependency tracking, definitions, and the inventory: ${todo.length} ${todo.length === 1 ? 'flow' : 'flows'} of this connector read, ${confirmed} use it, ${elsewhere} use another connection)` };
        }
    }
    return { ...mergeReport(found, sources), elsewhere: awayAll };
}

// ---- Check all ----------------------------------------------------------------------------------------------------------

export interface CheckAllHooks {
    onStep(step: 'apps' | 'references' | 'connections'): void;
    onProgress(done: number, total: number): void;
    onResult(name: string, report: ConnectionDependencyReport | { error: string }): void;
    /** True once the user cancelled: no new connection is started, the ones running finish. */
    cancelled(): boolean;
}

/**
 * Reads the dependencies of every row: first the two shared reads, one step each, then the connections four at a time.
 * A cancel keeps what was read. Never throws.
 */
export async function checkAll(host: Host, ctx: DepsContext, rows: readonly ConnectionRow[], hooks: CheckAllHooks): Promise<{ done: number; cancelled: boolean }> {
    hooks.onStep('apps');
    await ctx.apps();
    hooks.onStep('references');
    await ctx.references();
    hooks.onStep('connections');
    let next = 0;
    let done = 0;
    const worker = async (): Promise<void> => {
        while (!hooks.cancelled() && next < rows.length) {
            const row = rows[next++]!;
            try {
                hooks.onResult(row.name, await loadConnectionDependencies(host, ctx, row));
            } catch (e) {
                hooks.onResult(row.name, { error: message(e) });
            }
            done++;
            try {
                hooks.onProgress(done, rows.length);
            } catch {
                // a failing listener never stops the run
            }
        }
    };
    await Promise.all(Array.from({ length: Math.min(CHECK_CONCURRENCY, Math.max(rows.length, 1)) }, worker));
    return { done, cancelled: hooks.cancelled() };
}

// ---- the deletion (guarded) ---------------------------------------------------------------------------------------------

export const SWITCHED_OFF = 'Deleting connections is switched off.';

/**
 * Applies a confirmed plan. While `features.connectionDelete` is off nothing is sent: every row is skipped. Otherwise,
 * one row at a time: the dependencies are read again (a dependency that appeared skips the row), the connection must still
 * be listed, the delete is sent, and the list is read again: the row is done only when the connection is gone. When the
 * route itself is refused the run stops and says so. `readDeps` gives the fresh dependencies of a row.
 */
export async function applyConnectionDeletion(
    host: Host,
    environmentId: string,
    plan: ConnectionDeletePlan,
    rows: readonly ConnectionRow[],
    readDeps: (row: ConnectionRow) => Promise<ConnectionDependencyReport>,
    onRow?: (outcome: RowOutcome) => void,
    onStep?: (id: string, label: string, step: DeletionStep) => void,
): Promise<RowOutcome[]> {
    const outcomes: RowOutcome[] = [];
    const say = (id: string, label: string, step: DeletionStep) => {
        try {
            onStep?.(id, label, step);
        } catch {
            // a failing listener never stops the run
        }
    };
    const emit = (o: RowOutcome) => {
        outcomes.push(o);
        try {
            onRow?.(o);
        } catch {
            // a failing listener never stops the run
        }
    };
    const writable = new Set(writableRows(plan).map(r => r.name));
    if (!features.connectionDelete) {
        for (const r of plan.rows) emit({ id: r.name, label: r.label, status: 'skipped', message: SWITCHED_OFF });
        return outcomes;
    }
    let stopped = '';
    for (const r of plan.rows) {
        const out = (status: RowOutcome['status'], msg: string) => emit({ id: r.name, label: r.label, status, message: msg });
        if (stopped !== '') {
            out('skipped', stopped);
            continue;
        }
        if (!writable.has(r.name)) {
            out('skipped', r.blocked ?? 'Blocked.');
            continue;
        }
        const row = rows.find(x => x.name === r.name);
        if (!row) {
            out('skipped', 'It is not in the list any more.');
            continue;
        }
        try {
            // 1. what depends on it now
            say(r.name, r.label, 'check');
            const fresh = await readDeps(row);
            const deps: Deps = { [row.name]: { status: 'ready', report: fresh } };
            const reason = blockReason(row, deps);
            if (reason !== undefined) {
                out('skipped', `Checked again just before: ${reason}`);
                continue;
            }
            // 2. it must still be there
            say(r.name, r.label, 'exists');
            const before = await loadConnections(host);
            if (!before.ok) {
                out('failed', before.error);
                continue;
            }
            if (!before.value.rows.some(x => x.name === row.name)) {
                out('skipped', 'The connection is already gone; nothing was deleted.');
                continue;
            }
            // 3. delete, and 4. read the list back
            say(r.name, r.label, 'delete');
            await host.deleteConnection(environmentId, row.connectorKey, row.name);
            say(r.name, r.label, 'verify');
            const after = await loadConnections(host);
            if (!after.ok) out('failed', `Deleted, but the list could not be read to confirm it: ${after.error}`);
            else if (after.value.rows.some(x => x.name === row.name)) out('failed', 'The environment accepted the request but the connection is still listed.');
            else out('done', 'Deleted and read back.');
        } catch (e) {
            const msg = message(e);
            if (/not found|404|not supported|no route|cannot be reached|does not match any known API routes/i.test(msg)) {
                out('failed', `The route for deleting a connection was refused: ${msg}. The run stopped; nothing else was attempted.`);
                stopped = 'Not attempted: the route for deleting a connection was refused.';
            } else out('failed', msg);
        }
    }
    return outcomes;
}
