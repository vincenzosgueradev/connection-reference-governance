/**
 * What the inventory says about a connector (feature 024, FR-2425): how many flows, apps and agents of the environment use it.
 * It is a hint, never a dependency: the inventory knows the connector a resource uses, not which connection of it.
 */

export interface ConnectorUsage {
    readonly flows: number;
    readonly apps: number;
    readonly agents: number;
}

export type UsageMap = Readonly<Record<string, ConnectorUsage>>;

/** A flow that the inventory says uses a connector: its name, and the id of its row in the workflow table when it has one. */
export interface FlowCandidate {
    readonly id: string;
    readonly name: string;
    readonly workflowId: string;
}

/** What the inventory gave back: the counts per connector and, per connector, the flows by name. */
export interface Inventory {
    readonly usage: UsageMap;
    readonly flows: Readonly<Record<string, readonly FlowCandidate[]>>;
}

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `shared_webcontents`, `/providers/Microsoft.PowerApps/apis/shared_webcontents` and `webcontents` are the same connector. */
export const connectorIdOf = (key: string): string => key.trim().toLowerCase().replace(/^.*\//, '').replace(/^shared[_-]/, '');

const obj = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

function connectorsOf(v: unknown): string[] {
    let list: unknown = v;
    if (typeof v === 'string') {
        try {
            list = JSON.parse(v);
        } catch {
            return [];
        }
    }
    return Array.isArray(list) ? list.map(c => connectorIdOf(typeof c === 'string' ? c : String(obj(c)['connectorId'] ?? ''))).filter(c => c !== '') : [];
}

const KIND: Readonly<Record<string, keyof ConnectorUsage>> = {
    'microsoft.powerautomate/cloudflows': 'flows',
    'microsoft.powerautomate/agentflows': 'flows',
    'microsoft.powerautomate/m365agentflows': 'flows',
    'microsoft.powerapps/canvasapps': 'apps',
    'microsoft.powerapps/modeldrivenapps': 'apps',
    'microsoft.powerapps/codeapps': 'apps',
    'microsoft.powerapps/apps': 'apps',
    'microsoft.copilotstudio/agents': 'agents',
};

/** The rows of a page of the inventory (`data`), whatever the envelope. */
export function rowsOfUsagePage(res: unknown): Record<string, unknown>[] {
    const r = obj(res);
    for (const c of [r['data'], obj(r['body'])['data'], obj(r['data'])['data']]) if (Array.isArray(c)) return c.map(obj);
    return [];
}

export function skipTokenOf(res: unknown): string {
    const r = obj(res);
    for (const c of [r['skipToken'], obj(r['data'])['skipToken'], obj(r['body'])['skipToken']]) if (typeof c === 'string' && c.trim() !== '') return c.trim();
    return '';
}

/** Adds the rows of one page to the count: one resource counts once for a connector, however many operations it calls. */
export function addUsage(into: Record<string, { flows: number; apps: number; agents: number }>, rows: readonly Record<string, unknown>[], flowsInto?: Record<string, FlowCandidate[]>): void {
    for (const row of rows) {
        const kind = KIND[String(row['type'] ?? '').toLowerCase()];
        if (kind === undefined) continue;
        for (const id of new Set(connectorsOf(row['connectors'] ?? obj(row['properties'])['powerPlatformConnectors']))) {
            const u = (into[id] ??= { flows: 0, apps: 0, agents: 0 });
            u[kind]++;
            if (kind === 'flows' && flowsInto !== undefined) {
                const raw = String(row['workflowId'] ?? obj(row['properties'])['workflowEntityId'] ?? '').trim().toLowerCase();
                const rid = String(row['id'] ?? row['name'] ?? raw).trim().toLowerCase();
                const list = (flowsInto[id] ??= []);
                if (!list.some(f => f.id === rid)) list.push({ id: rid, name: String(row['displayName'] ?? obj(row['properties'])['displayName'] ?? '') || rid, workflowId: GUID_RE.test(raw) ? raw : '' });
            }
        }
    }
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** The short form, for a list: "5 flows, 2 apps use this connector", or undefined when nothing does. */
export function usageShort(map: UsageMap | null, connectorKey: string): string | undefined {
    if (map === null) return undefined;
    const u = map[connectorIdOf(connectorKey)];
    if (u === undefined || u.flows + u.apps + u.agents === 0) return undefined;
    const parts = [u.flows > 0 ? plural(u.flows, 'flow', 'flows') : '', u.apps > 0 ? plural(u.apps, 'app', 'apps') : '', u.agents > 0 ? plural(u.agents, 'agent', 'agents') : ''].filter(p => p !== '');
    return `${parts.join(', ')} of the environment use this connector`;
}

/** The sentence for a connection of this connector, or undefined when nothing in the environment uses the connector. */
export function usageText(map: UsageMap | null, connectorKey: string, connectorName: string): string | undefined {
    if (map === null) return undefined;
    const u = map[connectorIdOf(connectorKey)];
    if (u === undefined || u.flows + u.apps + u.agents === 0) return undefined;
    const parts = [u.flows > 0 ? plural(u.flows, 'flow', 'flows') : '', u.apps > 0 ? plural(u.apps, 'app', 'apps') : '', u.agents > 0 ? plural(u.agents, 'agent', 'agents') : ''].filter(p => p !== '');
    return `In this environment ${parts.join(', ')} use the ${connectorName === '' ? 'same' : connectorName} connector. The inventory does not say which connection each one uses, so some of them may use this one.`;
}
