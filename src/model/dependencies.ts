/**
 * What depends on a connection reference, in the whole environment (feature 023, constitution T2e). Pure: kinds, labels,
 * grouping and the summary. The data comes from Dataverse dependency tracking (`RetrieveDependentComponents`), read by
 * services/dependencies.ts; nothing here reads or writes.
 */

export type DependentKind = 'flow' | 'agent' | 'app' | 'other';

export const KIND_ORDER: readonly DependentKind[] = ['flow', 'agent', 'app', 'other'];
export const KIND_LABEL: Readonly<Record<DependentKind, string>> = { flow: 'Flows', agent: 'Agents', app: 'Apps', other: 'Other components' };
export const KIND_ICON: Readonly<Record<DependentKind, string>> = { flow: 'workflow', agent: 'bot', app: 'layout', other: 'layers' };

/** What `solutioncomponentdefinitions` says about a component type: its name and the table behind it. */
export interface ComponentTypeInfo {
    readonly name: string;
    readonly entity: string;
}

/** The codes that are fixed (Microsoft Learn, SolutionComponent componenttype); every other code is read, never guessed (T5). */
export const FIXED_TYPES: Readonly<Record<number, ComponentTypeInfo>> = {
    1: { name: 'Table', entity: 'entity' },
    20: { name: 'Security role', entity: 'role' },
    24: { name: 'Form', entity: 'systemform' },
    29: { name: 'Flow', entity: 'workflow' }, // Learn calls the type Process; most of them are flows, and the table says which
    300: { name: 'Canvas app', entity: 'canvasapp' },
    371: { name: 'Connector', entity: 'connector' },
    372: { name: 'Connector', entity: 'connector' },
    380: { name: 'Environment variable', entity: 'environmentvariabledefinition' },
    381: { name: 'Environment variable value', entity: 'environmentvariablevalue' },
};

export const infoOf = (type: number, read?: ReadonlyMap<number, ComponentTypeInfo>): ComponentTypeInfo | undefined => read?.get(type) ?? FIXED_TYPES[type];

export function kindOf(type: number, info?: ComponentTypeInfo): DependentKind {
    const entity = (info ?? FIXED_TYPES[type])?.entity.toLowerCase() ?? '';
    if (type === 29 || entity === 'workflow') return 'flow';
    if (entity === 'bot' || entity === 'botcomponent') return 'agent';
    if (type === 300 || entity === 'canvasapp' || entity === 'appmodule') return 'app';
    return 'other';
}

export const typeLabelOf = (type: number, info?: ComponentTypeInfo): string => (info ?? FIXED_TYPES[type])?.name || `Component of type ${type}`;

/** `workflow.category`: the kind of process (Microsoft Learn). A modern flow is a cloud flow. */
export const WORKFLOW_CATEGORY: Readonly<Record<number, string>> = { 0: 'Workflow', 1: 'Dialog', 2: 'Business rule', 3: 'Action', 4: 'Business process flow', 5: 'Cloud flow', 6: 'Desktop flow', 7: 'AI flow' };

export const STATE_LABEL: Readonly<Record<number, string>> = { 0: 'Off', 1: 'On', 2: 'Suspended' };

/** One component that depends on the reference, named and located. */
export interface ResolvedDependent {
    readonly id: string;
    readonly type: number;
    readonly kind: DependentKind;
    /** The name of its type: "Cloud flow", "Agent", "Canvas app", "Component of type 10042". */
    readonly typeLabel: string;
    readonly name: string;
    /** For a flow: On, Off or Suspended; empty when the table does not say. */
    readonly state: string;
    readonly managed: boolean;
    readonly owner: string;
    /** The agent an agent component belongs to; empty otherwise. */
    readonly parent: string;
    /** The solutions (friendly names) that hold it, without the default ones; empty when they could not be read. */
    readonly solutions: readonly string[];
    /** True when it is a member of the open solution. Everything else is "outside this solution". */
    readonly inOpenSolution: boolean;
}

export interface DependencyReport {
    readonly items: readonly ResolvedDependent[];
    /** What could not be read, in words (a source that failed never hides the others). */
    readonly notes: readonly string[];
}

/** The state of one reference's dependencies in the screen. */
export type DependencyState =
    | { readonly status: 'loading' }
    | { readonly status: 'ready'; readonly report: DependencyReport }
    | { readonly status: 'failed'; readonly error: string };

export interface DependencySummary {
    readonly total: number;
    readonly inSolution: number;
    readonly outside: number;
    readonly byKind: Readonly<Record<DependentKind, number>>;
}

export function summarize(report: DependencyReport): DependencySummary {
    const byKind: Record<DependentKind, number> = { flow: 0, agent: 0, app: 0, other: 0 };
    for (const d of report.items) byKind[d.kind]++;
    const inSolution = report.items.filter(d => d.inOpenSolution).length;
    return { total: report.items.length, inSolution, outside: report.items.length - inSolution, byKind };
}

export interface DependentGroup {
    readonly kind: DependentKind;
    readonly label: string;
    readonly icon: string;
    /** Outside this solution first, then by name. */
    readonly items: readonly ResolvedDependent[];
}

export function groupDependents(report: DependencyReport): DependentGroup[] {
    return KIND_ORDER
        .map(kind => ({
            kind,
            label: KIND_LABEL[kind],
            icon: KIND_ICON[kind],
            items: report.items.filter(d => d.kind === kind).sort((a, b) => Number(a.inOpenSolution) - Number(b.inOpenSolution) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
        }))
        .filter(g => g.items.length > 0);
}

/** The sentence at the top of a report. */
export function summaryLine(s: DependencySummary): string {
    if (s.total === 0) return 'Nothing depends on it anywhere in the environment.';
    const parts = [`${s.total} ${s.total === 1 ? 'component depends' : 'components depend'} on it`];
    parts.push(s.outside === 0 ? 'all in this solution' : `${s.inSolution} in this solution, ${s.outside} outside`);
    return `${parts.join(': ')}.`;
}

/** A short name with its place, for a message: "Order sync (Cloud flow, in Sales and Shared)". */
export function describeDependent(d: ResolvedDependent): string {
    const where = d.solutions.length === 0 ? (d.inOpenSolution ? 'in this solution' : 'outside this solution') : `in ${d.solutions.join(' and ')}`;
    return `${d.name} (${d.typeLabel}, ${where})`;
}
