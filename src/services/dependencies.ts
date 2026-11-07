import type { Dependent, Host, Record_ } from '../host';
import { describeDependent, infoOf, kindOf, STATE_LABEL, typeLabelOf, WORKFLOW_CATEGORY, type ComponentTypeInfo, type DependencyReport, type ResolvedDependent } from '../model/dependencies';
import type { ConnectionReferenceRow, Result, Snapshot } from '../types';
import { ownerNames, referenceComponentType } from './dataverse';

/**
 * Reads what depends on a connection reference in the whole environment (feature 023, constitution T2e): the dependents
 * from Dataverse dependency tracking, then their names, states, owners and solutions from their own tables, and the agents
 * from their documented relationships to the reference. Read only. Each source can fail on its own: it is named in a note
 * and never hides the others. No DOM.
 */

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHUNK = 20;
/** Solutions every component is in whatever it is: not worth showing. */
const DEFAULT_SOLUTIONS = new Set(['default', 'active', 'basic']);
/** Codes given to the agents found through their relationship to the reference (they have no dependency record). */
const AGENT = -1;
const AGENT_COMPONENT = -2;

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const chunks = <T>(list: readonly T[], size = CHUNK): T[][] => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));

/** The names and tables of the component types, read once per host (they do not change while the tool is open). */
const definitionCache = new WeakMap<Host, Promise<ReadonlyMap<number, ComponentTypeInfo> | undefined>>();
function definitions(host: Host): Promise<ReadonlyMap<number, ComponentTypeInfo> | undefined> {
    let p = definitionCache.get(host);
    if (!p) {
        p = host.query('solutioncomponentdefinitions?$select=solutioncomponenttype,name,primaryentityname').then(rows => {
            const map = new Map<number, ComponentTypeInfo>();
            for (const r of rows) if (typeof r['solutioncomponenttype'] === 'number') map.set(r['solutioncomponenttype'], { name: str(r['name']), entity: str(r['primaryentityname']) });
            return map as ReadonlyMap<number, ComponentTypeInfo>;
        }, () => undefined);
        definitionCache.set(host, p);
    }
    return p;
}

interface Named {
    readonly name: string;
    readonly state: string;
    readonly managed: boolean;
    readonly ownerId: string;
    readonly parentId: string;
    readonly typeLabel: string;
}

/** Rows of one table by id, in chunks; `select` lists the other columns. Throws when the table cannot be read. */
async function rowsById(host: Host, set: string, key: string, select: string, ids: readonly string[]): Promise<Record_[]> {
    const out: Record_[] = [];
    for (const part of chunks(ids)) out.push(...await host.query(`${set}?$select=${key},${select}&$filter=${part.map(id => `${key} eq ${id}`).join(' or ')}`));
    return out;
}

/** Names, kinds, states, owners and solutions for components known by id and type. Notes collect what could not be read. */
async function resolve(host: Host, snapshot: Snapshot, raw: readonly { id: string; type: number }[], found: ReadonlyMap<string, Named & { type: number }>, notes: string[]): Promise<ResolvedDependent[]> {
    const read = await definitions(host);
    if (read === undefined && raw.some(d => infoOf(d.type) === undefined)) notes.push('The names of some component types could not be read.');
    const byId = new Map<string, { id: string; type: number }>();
    for (const d of raw) byId.set(d.id.toLowerCase(), { id: d.id.toLowerCase(), type: d.type });
    for (const [id, n] of found) if (!byId.has(id)) byId.set(id, { id, type: n.type });

    const named = new Map<string, Named>();
    for (const [id, n] of found) named.set(id, n);
    const entityOf = (t: number) => (t < 0 ? '' : infoOf(t, read)?.entity.toLowerCase() ?? '');
    const ofKind = (pred: (d: { id: string; type: number }) => boolean) => [...byId.values()].filter(d => d.type >= 0 && pred(d)).map(d => d.id).filter(id => GUID.test(id));
    const attempt = async (what: string, run: () => Promise<void>) => {
        try {
            await run();
        } catch {
            notes.push(`The names of the ${what} could not be read.`);
        }
    };
    const flowIds = ofKind(d => d.type === 29 || entityOf(d.type) === 'workflow');
    const botIds = ofKind(d => entityOf(d.type) === 'bot');
    const componentIds = ofKind(d => entityOf(d.type) === 'botcomponent');
    const appIds = ofKind(d => d.type === 300 || entityOf(d.type) === 'canvasapp');
    if (flowIds.length > 0)
        await attempt('flows', async () => {
            for (const r of await rowsById(host, 'workflows', 'workflowid', 'name,statecode,category,ismanaged,_ownerid_value', flowIds))
                named.set(str(r['workflowid']).toLowerCase(), { name: str(r['name']), state: typeof r['statecode'] === 'number' ? STATE_LABEL[r['statecode']] ?? '' : '', managed: r['ismanaged'] === true, ownerId: str(r['_ownerid_value']).toLowerCase(), parentId: '', typeLabel: typeof r['category'] === 'number' ? WORKFLOW_CATEGORY[r['category']] ?? 'Flow' : 'Flow' });
        });
    if (botIds.length > 0)
        await attempt('agents', async () => {
            for (const r of await rowsById(host, 'bots', 'botid', 'name,statecode,ismanaged,_ownerid_value', botIds))
                named.set(str(r['botid']).toLowerCase(), { name: str(r['name']), state: '', managed: r['ismanaged'] === true, ownerId: str(r['_ownerid_value']).toLowerCase(), parentId: '', typeLabel: 'Agent' });
        });
    if (componentIds.length > 0)
        await attempt('agent components', async () => {
            for (const r of await rowsById(host, 'botcomponents', 'botcomponentid', 'name,ismanaged,_parentbotid_value', componentIds))
                named.set(str(r['botcomponentid']).toLowerCase(), { name: str(r['name']), state: '', managed: r['ismanaged'] === true, ownerId: '', parentId: str(r['_parentbotid_value']).toLowerCase(), typeLabel: 'Agent component' });
        });
    if (appIds.length > 0)
        await attempt('apps', async () => {
            for (const r of await rowsById(host, 'canvasapps', 'canvasappid', 'displayname', appIds))
                named.set(str(r['canvasappid']).toLowerCase(), { name: str(r['displayname']), state: '', managed: false, ownerId: '', parentId: '', typeLabel: 'Canvas app' });
        });

    // the agents that own agent components
    const botNames = new Map<string, string>();
    for (const [id, n] of named) if (n.typeLabel === 'Agent') botNames.set(id, n.name);
    const parentIds = [...new Set([...named.values()].map(n => n.parentId).filter(id => GUID.test(id) && !botNames.has(id)))];
    if (parentIds.length > 0) {
        try {
            for (const r of await rowsById(host, 'bots', 'botid', 'name', parentIds)) botNames.set(str(r['botid']).toLowerCase(), str(r['name']));
        } catch {
            notes.push('The names of the agents that own agent components could not be read.');
        }
    }

    const owners = await ownerNames(host, [...new Set([...named.values()].map(n => n.ownerId).filter(id => GUID.test(id)))]);

    // which solutions hold them: the open solution is known from the snapshot, the other names are read
    const memberships = new Map<string, Set<string>>();
    const solutionNames = new Map<string, string>();
    let solutionsRead = true;
    try {
        for (const part of chunks([...byId.keys()])) {
            for (const r of await host.query(`solutioncomponents?$select=objectid,_solutionid_value&$filter=${part.map(id => `objectid eq ${id}`).join(' or ')}`)) {
                const o = str(r['objectid']).toLowerCase();
                const s = str(r['_solutionid_value']).toLowerCase();
                if (GUID.test(o) && GUID.test(s)) memberships.set(o, (memberships.get(o) ?? new Set()).add(s));
            }
        }
        const solutionIds = [...new Set([...memberships.values()].flatMap(s => [...s]))];
        for (const r of await rowsById(host, 'solutions', 'solutionid', 'friendlyname,uniquename', solutionIds))
            if (!DEFAULT_SOLUTIONS.has(str(r['uniquename']).toLowerCase())) solutionNames.set(str(r['solutionid']).toLowerCase(), str(r['friendlyname']) || str(r['uniquename']));
    } catch {
        solutionsRead = false;
        notes.push('The solutions that hold the components could not be read.');
    }

    return [...byId.values()].map(d => {
        const n = named.get(d.id);
        const info = d.type < 0 ? undefined : infoOf(d.type, read);
        const kind = d.type === AGENT || d.type === AGENT_COMPONENT ? 'agent' : kindOf(d.type, info);
        const label = n && n.typeLabel !== '' ? n.typeLabel : typeLabelOf(d.type, info);
        return {
            id: d.id,
            type: d.type,
            kind,
            typeLabel: label,
            name: n?.name || `${label} ${d.id.slice(0, 8)}`,
            state: n?.state ?? '',
            managed: n?.managed ?? false,
            owner: n ? owners.get(n.ownerId) ?? '' : '',
            parent: n?.parentId ? botNames.get(n.parentId) ?? '' : '',
            solutions: solutionsRead ? [...(memberships.get(d.id) ?? [])].map(s => solutionNames.get(s)).filter((x): x is string => x !== undefined).sort() : [],
            // a member of the open solution is known from what was read for it; everything else is outside it
            inOpenSolution: snapshot.componentTypes[d.id] !== undefined || memberships.get(d.id)?.has(snapshot.solution.id.toLowerCase()) === true,
        };
    });
}

/** Everything that depends on a reference, in any solution of the environment, plus the agents that use it. */
export async function loadDependencyReport(host: Host, snapshot: Snapshot, reference: ConnectionReferenceRow): Promise<Result<DependencyReport>> {
    const notes: string[] = [];
    try {
        const type = snapshot.componentTypes[reference.id.toLowerCase()] ?? await referenceComponentType(host, snapshot);
        if (type === undefined) return { ok: false, error: 'The component type of this reference could not be read, so its dependencies cannot be asked.' };
        const raw: Dependent[] = (await host.dependents(type, reference.id)).filter(d => GUID.test(d.id) && d.id.toLowerCase() !== reference.id.toLowerCase());

        // agents come from their documented relationships to the reference; each source can fail alone
        const found = new Map<string, Named & { type: number }>();
        try {
            for (const r of await host.query(`bots?$select=botid,name,statecode,ismanaged,_ownerid_value&$filter=_providerconnectionreferenceid_value eq ${reference.id}`))
                found.set(str(r['botid']).toLowerCase(), { type: AGENT, name: str(r['name']), state: '', managed: r['ismanaged'] === true, ownerId: str(r['_ownerid_value']).toLowerCase(), parentId: '', typeLabel: 'Agent' });
        } catch {
            notes.push('The agents that use it as their connection reference could not be read.');
        }
        try {
            for (const r of await host.query(`connectionreferences(${reference.id})/botcomponent_connectionreference?$select=botcomponentid,name,ismanaged,_parentbotid_value`))
                found.set(str(r['botcomponentid']).toLowerCase(), { type: AGENT_COMPONENT, name: str(r['name']), state: '', managed: r['ismanaged'] === true, ownerId: '', parentId: str(r['_parentbotid_value']).toLowerCase(), typeLabel: 'Agent component' });
        } catch {
            notes.push('The agent components that use it could not be read.');
        }
        // an agent that the dependency records already list is not listed twice, and keeps the richer record
        const known = new Set(raw.map(d => d.id.toLowerCase()));
        for (const id of [...found.keys()]) if (known.has(id)) found.delete(id);

        const items = await resolve(host, snapshot, raw, found, notes);
        return { ok: true, value: { items, notes: [...new Set(notes)] } };
    } catch (e) {
        return { ok: false, error: message(e) };
    }
}

/**
 * A readable name for each component that blocks a delete, for the dialog: "Order sync (Cloud flow, in Sales)". The names
 * are a convenience: a component that cannot be named is left out and the dialog says it by its type.
 */
export async function dependentLabels(host: Host, snapshot: Snapshot, deps: readonly { id: string; type: number }[]): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    const valid = deps.filter(d => GUID.test(d.id));
    if (valid.length === 0) return out;
    try {
        for (const d of await resolve(host, snapshot, valid, new Map(), [])) out[d.id] = describeDependent(d);
    } catch {
        // the names are a convenience
    }
    return out;
}
