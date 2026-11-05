import type { Result } from '../types';

/** Pure functions on the `clientdata` JSON of a modern flow. No I/O. */

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

function parse(clientData: string): Result<Json> {
    let doc: unknown;
    try {
        doc = JSON.parse(clientData);
    } catch {
        return { ok: false, error: 'The flow definition is not valid JSON.' };
    }
    return isObject(doc) ? { ok: true, value: doc } : { ok: false, error: 'The flow definition is not an object.' };
}

/** The connectionReferences map under properties, or undefined when the flow has none. */
function refMap(doc: Json): Json | undefined {
    const props = doc['properties'];
    if (!isObject(props)) return undefined;
    const refs = props['connectionReferences'];
    return isObject(refs) ? refs : undefined;
}

function logicalNameOf(entry: unknown): string | undefined {
    if (!isObject(entry)) return undefined;
    const conn = entry['connection'];
    if (!isObject(conn)) return undefined;
    const name = conn['connectionReferenceLogicalName'];
    return typeof name === 'string' && name !== '' ? name : undefined;
}

/** Distinct connection reference logical names a flow declares, in order of first appearance. */
export function readReferenceNames(clientData: string): Result<string[]> {
    const parsed = parse(clientData);
    if (!parsed.ok) return parsed;
    const map = refMap(parsed.value);
    if (!map) return { ok: true, value: [] };
    const names: string[] = [];
    for (const entry of Object.values(map)) {
        const n = logicalNameOf(entry);
        if (n !== undefined && !names.includes(n)) names.push(n);
    }
    return { ok: true, value: names };
}

function deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every(k => Object.prototype.hasOwnProperty.call(b, k) && deepEqual((a as Json)[k], (b as Json)[k]));
}

const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Replaces the reference `from` with `to` in every connectionReferences entry that holds it.
 *
 * The text is edited in place (only the string value after "connectionReferenceLogicalName" changes), so numbers,
 * spacing, key order and everything else stay exactly as stored. Before returning, the edited text is parsed and
 * compared with the original document after the same change made on the parsed object: any difference is an error
 * and nothing is returned for writing.
 */
export function repointClientData(clientData: string, fromNames: string | readonly string[], to: string): Result<string> {
    const parsed = parse(clientData);
    if (!parsed.ok) return parsed;
    const list = typeof fromNames === 'string' ? [fromNames] : fromNames;
    if (list.some(n => n === '') || to === '') return { ok: false, error: 'A reference name is empty.' };
    // the new reference is never replaced by itself
    const from = [...new Set(list)].filter(n => n !== to);
    if (from.length === 0) return { ok: false, error: 'There is no reference to replace.' };

    // Expected document: same change on the parsed object.
    const expected = JSON.parse(clientData) as Json;
    let changed = 0;
    const map = refMap(expected);
    if (map) {
        for (const entry of Object.values(map)) {
            const n = logicalNameOf(entry);
            if (n !== undefined && from.includes(n)) {
                ((entry as Json)['connection'] as Json)['connectionReferenceLogicalName'] = to;
                changed++;
            }
        }
    }
    if (changed === 0) return { ok: false, error: `The flow does not declare ${from.length === 1 ? 'the reference' : 'any of the references'} ${from.join(', ')}.` };

    const alternatives = from.map(n => escapeRegex(JSON.stringify(n))).join('|');
    const pattern = new RegExp(`("connectionReferenceLogicalName"\\s*:\\s*)(?:${alternatives})`, 'g');
    const text = clientData.replace(pattern, (_m, head: string) => head + JSON.stringify(to));

    const check = parse(text);
    if (!check.ok || !deepEqual(check.value, expected)) return { ok: false, error: 'The edited definition did not pass the safety check.' };
    return { ok: true, value: text };
}
