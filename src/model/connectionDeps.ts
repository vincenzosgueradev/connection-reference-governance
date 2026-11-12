import type { ConnectionDependent } from '../types';

/**
 * What depends on a connection, merged from independent sources (feature 024, constitution T11). Pure. Each source is
 * read on its own; one that fails never hides the others, and a failed source stops a connection from being offered for
 * deletion. The wording is fixed here: a connection nothing was found for is **No dependency found**, never "unused".
 */

export type SourceName = 'apps' | 'references' | 'flows' | 'agents';

export const SOURCE_NAMES: readonly SourceName[] = ['apps', 'references', 'flows', 'agents'];

export const SOURCE_LABEL: Readonly<Record<SourceName, string>> = {
    apps: 'apps',
    references: 'connection references',
    flows: 'flows',
    agents: 'agents',
};

/** `ok`: read. `failed`: could not be read (blocks selection). `notScanned`: the environment refuses that search (named, never blocks). */
export type SourceState =
    | { readonly status: 'ok'; /** What was looked at, in words ("6 apps"): so the note can say how much was read. */ readonly detail?: string }
    | { readonly status: 'failed'; readonly reason: string }
    | { readonly status: 'notScanned'; readonly reason: string };

export type Verdict = 'in-use' | 'none-found' | 'unchecked-source';

/** A flow the inventory named for the connector that was read and uses another connection: shown by name so it can be compared with the portal. */
export interface ElsewhereFlow {
    readonly name: string;
    /** The references of the flow, with the connection each one holds (the connection name, lower case). */
    readonly references: readonly { readonly name: string; readonly connection: string }[];
}

export interface ConnectionDependencyReport {
    /** The flows of the inventory that use another connection (empty when the inventory was not read). */
    readonly elsewhere?: readonly ElsewhereFlow[];
    readonly dependents: readonly ConnectionDependent[];
    readonly sources: Readonly<Record<SourceName, SourceState>>;
    readonly verdict: Verdict;
    /** The coverage note: what was and was not looked at. */
    readonly note: string;
}

export type DepState =
    | { readonly status: 'loading' }
    | { readonly status: 'ready'; readonly report: ConnectionDependencyReport }
    | { readonly status: 'failed'; readonly error: string };

export const allOk = (): Record<SourceName, SourceState> => ({ apps: { status: 'ok' }, references: { status: 'ok' }, flows: { status: 'ok' }, agents: { status: 'ok' } });

/**
 * `in-use` when anything depends on it; `unchecked-source` when a source failed and nothing was found (nothing can be
 * said); `none-found` only when no source failed and nothing was found. A `notScanned` source does not block it: it is
 * named in the note and again in the Preview of a deletion.
 */
export function verdictOf(dependents: readonly ConnectionDependent[], sources: Readonly<Record<SourceName, SourceState>>): Verdict {
    if (dependents.length > 0) return 'in-use';
    return SOURCE_NAMES.some(n => sources[n].status === 'failed') ? 'unchecked-source' : 'none-found';
}

/** What was and was not looked at, in words (FR-2406). Never says a connection is unused or free. */
export function coverageNote(sources: Readonly<Record<SourceName, SourceState>>): string {
    const ok = SOURCE_NAMES.filter(n => sources[n].status === 'ok').map(n => {
        const s = sources[n];
        return s.status === 'ok' && s.detail !== undefined && s.detail !== '' ? s.detail : SOURCE_LABEL[n];
    });
    const parts: string[] = [];
    if (ok.length > 0) parts.push(`Looked at: ${ok.join(', ')}.`);
    for (const n of SOURCE_NAMES) {
        const s = sources[n];
        if (s.status === 'failed') parts.push(`Could not read the ${SOURCE_LABEL[n]}${s.reason === '' ? '' : ` (${s.reason})`}.`);
        if (s.status === 'notScanned') parts.push(`Not scanned: ${SOURCE_LABEL[n]}${s.reason === '' ? '' : ` (${s.reason})`}.`);
    }
    parts.push('Components that the signed-in user cannot read may still use this connection.');
    return parts.join(' ');
}

/** Only what was looked at (no problems: the view shows those on their own lines), and the limit of the signed-in user. */
export function lookedAtNote(sources: Readonly<Record<SourceName, SourceState>>): string {
    const ok = SOURCE_NAMES.filter(n => sources[n].status === 'ok').map(n => {
        const s = sources[n];
        return s.status === 'ok' && s.detail !== undefined && s.detail !== '' ? s.detail : SOURCE_LABEL[n];
    });
    return `${ok.length > 0 ? `Looked at: ${ok.join(', ')}. ` : ''}Components that the signed-in user cannot read may still use this connection.`;
}

/** The report of one connection: dependents without duplicates, the verdict and the coverage note. */
export function mergeReport(found: readonly ConnectionDependent[], sources: Readonly<Record<SourceName, SourceState>>): ConnectionDependencyReport {
    const seen = new Set<string>();
    const dependents: ConnectionDependent[] = [];
    for (const d of found) {
        const key = `${d.kind}:${d.id.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        dependents.push(d);
    }
    return { dependents, sources, verdict: verdictOf(dependents, sources), note: coverageNote(sources) };
}

export interface DependentGroup {
    readonly kind: ConnectionDependent['kind'];
    readonly label: string;
    readonly items: readonly ConnectionDependent[];
}

const GROUPS: readonly { kind: ConnectionDependent['kind']; label: string }[] = [
    { kind: 'app', label: 'Apps' },
    { kind: 'flow', label: 'Flows' },
    { kind: 'reference', label: 'Connection references' },
    { kind: 'agent', label: 'Agents' },
    { kind: 'other', label: 'Other components' },
];

/** The dependents grouped as Apps, Flows, Connection references and Agents; empty groups are left out; each group by name. */
export function groupOf(report: ConnectionDependencyReport): DependentGroup[] {
    return GROUPS.map(g => ({ ...g, items: report.dependents.filter(d => d.kind === g.kind).sort((a, b) => a.name.localeCompare(b.name)) })).filter(g => g.items.length > 0);
}

/** True when only connection references hold the connection: no flow, app or agent was found using it (it is still a dependency). */
export const heldOnlyByReferences = (report: ConnectionDependencyReport): boolean => report.dependents.length > 0 && report.dependents.every(d => d.kind === 'reference');

/** The sources that did not answer as `ok`, for naming them next to a retry. */
export function problemSources(report: ConnectionDependencyReport): { name: SourceName; state: SourceState }[] {
    return SOURCE_NAMES.filter(n => report.sources[n].status !== 'ok').map(n => ({ name: n, state: report.sources[n] }));
}
