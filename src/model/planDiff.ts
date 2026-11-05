import type { Plan, Snapshot } from '../types';

/**
 * What a plan will change, as documents to compare and as a list of changed fields. Pure.
 * For a flow the document is its definition; for a reference it is the record (ids and connection id). The "after"
 * side is the payload of the plan, formatted for reading: the write itself never reformats the stored text.
 */

export interface FieldChange {
    readonly what: string;
    readonly before: string;
    readonly after: string;
}

export interface PlanItem {
    readonly id: string;
    readonly title: string;
    /** The id of the row, shown small next to the title. */
    readonly sub: string;
    /** Why the row will not be written; such an item has no documents and no fields. */
    readonly blocked?: string;
    readonly before: string;
    readonly after: string;
    readonly fields: readonly FieldChange[];
}

const MAX_FIELDS = 200;

/** JSON with two spaces; anything that is not JSON is returned as it is. */
export function prettyDocument(text: string): string {
    if (text === '') return '';
    try {
        return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
        return text;
    }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const show = (v: unknown): string => (v === undefined ? '(none)' : isObject(v) ? '{…}' : Array.isArray(v) ? '[…]' : JSON.stringify(v));

/** The leaves that differ between two parsed documents, by path, at most `MAX_FIELDS`. */
export function changedFields(before: unknown, after: unknown): FieldChange[] {
    const out: FieldChange[] = [];
    const walk = (a: unknown, b: unknown, path: string): void => {
        if (out.length >= MAX_FIELDS || a === b) return;
        if (isObject(a) && isObject(b)) {
            for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) walk(a[key], b[key], path === '' ? key : `${path}.${key}`);
        } else if (Array.isArray(a) && Array.isArray(b)) {
            for (let i = 0; i < Math.max(a.length, b.length); i++) walk(a[i], b[i], `${path}[${i}]`);
        } else {
            out.push({ what: path, before: show(a), after: show(b) });
        }
    };
    walk(before, after, '');
    return out;
}

function parse(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return undefined;
    }
}

export function planItems(plan: Plan, snapshot: Snapshot): PlanItem[] {
    return plan.rows.map(r => {
        const base = { id: r.id, title: r.label, sub: r.id };
        if (r.blocked !== undefined) return { ...base, blocked: r.blocked, before: '', after: '', fields: [] };
        if (plan.kind === 'connection') {
            const logical = snapshot.references.find(x => x.reference.id === r.id)?.reference.logicalName ?? '';
            const doc = (connectionid: string) => JSON.stringify({ connectionreferenceid: r.id, connectionreferencelogicalname: logical, connectionid }, null, 2);
            return { ...base, before: doc(r.oldValue), after: doc(r.payload), fields: [{ what: 'connectionid', before: r.oldValue === '' ? '(not set)' : r.oldValue, after: r.payload }] };
        }
        const before = prettyDocument(r.expectedCurrent);
        const after = prettyDocument(r.payload);
        const fields = changedFields(parse(r.expectedCurrent), parse(r.payload));
        return { ...base, before, after, fields: fields.length > 0 ? fields : [{ what: 'definition', before: 'as stored', after: 'changed' }] };
    });
}
