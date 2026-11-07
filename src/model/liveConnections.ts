import { connectorKey } from './connectors';
import type { LiveConnection } from '../types';

/**
 * The connections of the connected environment as the Power Platform API lists them (Connectivity, "List connections",
 * api-version 2024-10-01, Microsoft Learn). Pure: parses what the host returned and answers "does this connection exist
 * for this connector". Only documented fields are read: `name`, `id`, `properties.displayName`, `properties.createdTime`.
 */

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const obj = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {});

/** The array of connections inside whatever envelope the host gave (`value`, or `data.value`, or `body.value`). */
function listOf(res: unknown): unknown[] {
    if (Array.isArray(res)) return res;
    const r = obj(res);
    for (const candidate of [r['value'], obj(r['data'])['value'], obj(r['body'])['value']]) if (Array.isArray(candidate)) return candidate;
    return [];
}

/** `shared_commondataserviceforapps` from `/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps/connections/<name>`; empty when absent. */
export function connectorKeyOfConnection(id: string): string {
    return (/\/apis\/([^/]+)\/connections\//i.exec(id)?.[1] ?? '').toLowerCase().replace(/^shared_/, '');
}

export function parseConnections(res: unknown): LiveConnection[] {
    return listOf(res).flatMap(raw => {
        const c = obj(raw);
        const name = str(c['name']);
        if (name === '') return [];
        const props = obj(c['properties']);
        return [{ name, connectorKey: connectorKeyOfConnection(str(c['id'])), displayName: str(props['displayName']), createdTime: str(props['createdTime']) }];
    });
}

/** The environment id from a RetrieveCurrentOrganization answer (`Detail.EnvironmentId`), however the host wrapped it. */
export function environmentIdFrom(res: unknown): string {
    const r = obj(res);
    const value = r['value'];
    const detail = obj(r['Detail']);
    const inner = Array.isArray(value) ? obj(obj(value[0])['Detail']) : obj(obj(value)['Detail']);
    return str(detail['EnvironmentId']) || str(inner['EnvironmentId']);
}

/** A pasted connection: the name, whether it was the bare name or the whole resource id. */
export function normalizeConnectionName(raw: string): string {
    const t = raw.trim();
    const m = /\/connections\/([^/?#]+)\s*$/i.exec(t);
    return m ? m[1]! : t;
}

export type LiveState = { readonly status: 'idle' | 'loading' | 'ready' | 'unavailable'; readonly items: readonly LiveConnection[]; readonly error: string };

export const noLive: LiveState = { status: 'idle', items: [], error: '' };

export type Verdict = 'found' | 'missing' | 'other-connector' | 'unknown';

/** Whether the connection `name` exists among the listed ones and belongs to the connector. 'unknown' while the list is not read. */
export function verifyConnection(live: LiveState, connectorId: string, name: string): Verdict {
    if (live.status !== 'ready') return 'unknown';
    const item = live.items.find(c => c.name.toLowerCase() === name.toLowerCase());
    if (!item) return 'missing';
    const wanted = connectorKey(connectorId).toLowerCase();
    return item.connectorKey !== '' && wanted !== '' && item.connectorKey !== wanted ? 'other-connector' : 'found';
}

/** The listed connections of one connector (those whose connector could be read and matches). */
export function connectionsOf(live: LiveState, connectorId: string): LiveConnection[] {
    const wanted = connectorKey(connectorId).toLowerCase();
    return live.items.filter(c => c.connectorKey === wanted);
}
