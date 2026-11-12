/**
 * The apps of the environment as the Power Platform API lists them (Power Apps, Get AdminApps, api-version 2024-10-01,
 * Microsoft Learn), reduced to what feature 024 needs: which app uses which connection. Pure. Only documented fields are
 * read: `name`, `properties.displayName`, `properties.owner.displayName` and
 * `properties.connectionReferences[].sharedConnectionId`.
 */

export interface AppUse {
    readonly id: string;
    readonly name: string;
    readonly owner: string;
    /** The names of the connections the app uses, lower case. */
    readonly connections: readonly string[];
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const obj = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {});

function listOf(res: unknown): unknown[] {
    if (Array.isArray(res)) return res;
    const r = obj(res);
    for (const candidate of [r['value'], obj(r['data'])['value'], obj(r['body'])['value']]) if (Array.isArray(candidate)) return candidate;
    return [];
}

/** The connection name from `sharedConnectionId` (the bare name, or a whole resource id ending `/connections/<name>`). */
export function connectionNameOf(sharedConnectionId: string): string {
    const t = sharedConnectionId.trim();
    const m = /\/connections\/([^/?#]+)\s*$/i.exec(t);
    return (m ? m[1]! : t).toLowerCase();
}

export function parseApps(res: unknown): AppUse[] {
    return listOf(res).flatMap(raw => {
        const a = obj(raw);
        const id = str(a['name']);
        if (id === '') return [];
        const props = obj(a['properties']);
        const refs = Array.isArray(props['connectionReferences']) ? props['connectionReferences'] : obj(props['connectionReferences']) && Object.values(obj(props['connectionReferences']));
        const connections = (Array.isArray(refs) ? refs : []).map(r => connectionNameOf(str(obj(r)['sharedConnectionId']))).filter(n => n !== '');
        return [{ id, name: str(props['displayName']) || id, owner: str(obj(props['owner'])['displayName']), connections: [...new Set(connections)] }];
    });
}
