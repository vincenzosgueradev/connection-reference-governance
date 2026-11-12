import { connectorInfo, connectorKey } from './connectors';
import type { ConnectionRow, ConnectionStatus, LiveConnection } from '../types';

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

// ---- the richer reading of feature 024 -------------------------------------------------------------------------------

/** Words by which the service says that a connection must be signed in again (matched without case). */
const RECONNECT_WORDS = /unauthenticated|reconnect|re-?authenticat|sign in again|expired/i;

/**
 * The status of a connection from `properties.statuses`. Connected only when the list is not empty and every entry says
 * so; Needs reconnect when an entry says the connection must be signed in again; Error when an entry reports an error;
 * otherwise unknown. Never a guess: a shape that is not understood is `unknown`, not `connected`.
 */
export function statusOf(statuses: unknown): { status: ConnectionStatus; detail: string } {
    if (!Array.isArray(statuses) || statuses.length === 0) return { status: 'unknown', detail: '' };
    let reconnect = '';
    let error = '';
    let allConnected = true;
    for (const raw of statuses) {
        const s = obj(raw);
        const state = str(s['status']);
        const err = obj(s['error']);
        const text = [str(err['code']), str(err['message']), state].filter(t => t !== '').join(': ');
        if (state.toLowerCase() !== 'connected') allConnected = false;
        if (RECONNECT_WORDS.test(`${state} ${str(err['code'])} ${str(err['message'])}`)) reconnect = reconnect || text;
        else if (/error/i.test(state) || Object.keys(err).length > 0) error = error || text;
    }
    if (reconnect !== '') return { status: 'reconnect', detail: reconnect };
    if (error !== '') return { status: 'error', detail: error };
    return allConnected ? { status: 'connected', detail: '' } : { status: 'unknown', detail: '' };
}

/** The connections with what the list says about each one. Fields the answer does not carry are empty. */
export function parseConnectionRows(res: unknown): ConnectionRow[] {
    return listOf(res).flatMap(raw => {
        const c = obj(raw);
        const name = str(c['name']);
        if (name === '') return [];
        const props = obj(c['properties']);
        const key = connectorKeyOfConnection(str(c['id'])) || connectorKey(str(props['apiId']));
        const by = obj(props['createdBy']);
        const { status, detail } = statusOf(props['statuses']);
        return [{
            name,
            connectorKey: key,
            connectorName: key === '' ? '' : connectorInfo(`shared_${key}`).name,
            displayName: str(props['displayName']),
            status,
            statusDetail: detail,
            createdTime: str(props['createdTime']),
            modifiedTime: str(props['lastModifiedTime']),
            creator: { name: str(by['displayName']) || str(by['userPrincipalName']), email: str(by['email']) },
        }];
    });
}

/** The token of the next page, or an empty string at the last page (`nextLink`, however the host wrapped it). */
export function nextOf(res: unknown): string {
    const r = obj(res);
    for (const candidate of [r['nextLink'], obj(r['data'])['nextLink'], obj(r['body'])['nextLink'], r['@odata.nextLink']]) {
        const v = str(candidate).trim();
        if (v !== '') return v;
    }
    return '';
}
