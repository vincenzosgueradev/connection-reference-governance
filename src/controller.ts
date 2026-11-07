import type { Host } from './host';
import { buildSnapshot } from './model/analysis';
import { backupFileName, buildBackup } from './model/backup';
import { planConnectionChange, planRepointGroups } from './model/plans';
import { planRemoval } from './model/removal';
import { buildReport, reportFileName } from './model/report';
import { operationLabel } from './model/workflow';
import { normalizeConnectionName, verifyConnection } from './model/liveConnections';
import { duplicateGroups, keeperOf, mergeInput } from './model/cleanup';
import { randomSeed } from './model/newReference';
import { loadDependencyReport, dependentLabels } from './services/dependencies';
import { applyPlan, createReference, loadLiveConnections, loadFlowCounts, loadSnapshotInput, loadSolutions, readDependencies } from './services/dataverse';
import { log } from './services/log';
import type { Store } from './state/store';
import type { RowOutcome } from './types';
import type { Handlers } from './views/main';

/** A short code to copy and paste, without the characters that are easy to mistake for each other. */
function defaultCode(): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = new Uint8Array(6);
    if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    return `DELETE-${[...bytes].map(b => alphabet[b % alphabet.length]).join('')}`;
}

/** Wires user intent to services and dispatches the outcome. No markup, no rules of its own. */
export function createController(
    host: Host,
    store: Store,
    clock: () => number = () => Date.now(),
    tickMs = 1000,
    makeCode: () => string = defaultCode,
    /** How long the "Created" state is shown before the panel closes (ms). */
    celebrateMs = 700,
): Handlers & { start(): Promise<void>; environment(): string; idle(): Promise<void> } {
    let environment = '';
    let userId = '';
    let run: Promise<void> = Promise.resolve();

    async function readSolutions(): Promise<void> {
        store.dispatch({ type: 'busy', busy: true });
        const res = await loadSolutions(host);
        if (!res.ok) {
            log(res.error, 'error');
            store.dispatch({ type: 'error', message: res.error });
            return;
        }
        store.dispatch({ type: 'solutionsLoaded', solutions: res.value });
        // The counts come after the list: the table is usable while they are being read.
        const counts = await loadFlowCounts(host, res.value.filter(x => !x.managed).map(x => x.id));
        if (counts.ok) store.dispatch({ type: 'flowCountsLoaded', counts: counts.value.perSolution, total: counts.value.total });
        else log(counts.error, 'warning');
        store.dispatch({ type: 'busy', busy: false });
    }

    /** Reads the open solution again. True when it worked (or when the user moved on meanwhile). */
    async function readSolution(): Promise<boolean> {
        const s = store.get();
        const solution = s.solutions.find(x => x.id === s.solutionId);
        if (!solution) return false;
        store.dispatch({ type: 'busy', busy: true });
        const res = await loadSnapshotInput(host, solution);
        if (!res.ok) {
            log(res.error, 'error');
            store.dispatch({ type: 'error', message: res.error });
            return false;
        }
        if (store.get().solutionId !== solution.id) return true; // the user moved on while reading
        store.dispatch({ type: 'snapshotLoaded', snapshot: buildSnapshot(res.value) });
        log(`Read ${res.value.flows.length} flows and ${res.value.memberReferenceIds.length} references from ${solution.name}.`, 'info');
        return true;
    }

    /** The write: rows one by one with their progress, then the solution is read again, then the result. */
    async function apply(): Promise<void> {
        const plan = store.get().plan;
        if (!plan) return;
        const timer = setInterval(() => store.dispatch({ type: 'tick', now: clock() }), tickMs);
        let results: RowOutcome[];
        try {
            results = await applyPlan(host, plan, outcome => store.dispatch({ type: 'applyRow', outcome, now: clock() }), phase => store.dispatch({ type: 'setPhase', phase, now: clock() }));
        } catch (e) {
            results = [{ id: '', label: 'The run', status: 'failed', message: `The run stopped unexpectedly: ${e instanceof Error ? e.message : String(e)}` }];
        }
        store.dispatch({ type: 'rowsDone', now: clock() });
        const refreshed = await readSolution(); // so that the screen shows what is really stored
        clearInterval(timer);
        store.dispatch({ type: 'applied', results, now: clock(), refreshFailed: !refreshed });
        const failed = results.filter(r => r.status === 'failed').length;
        log(`Applied: ${results.filter(r => r.status === 'done').length} done, ${failed} failed.`, failed ? 'warning' : 'success');
    }

    /** The Preview of the re-point chosen in the state (the studio's Review changes, and the start of a merge). */
    function repointNow(): void {
        const s = store.get();
        if (!s.snapshot) return;
        store.dispatch({ type: 'openPlan', plan: planRepointGroups(s.snapshot, s.selected, s.repointGroups, userId, s.manageState) });
    }
    /** The ticked unused references of the clean up dialog. The dialog stays open behind the confirmation that follows (feature 022). */
    function tickedForCleanup(): readonly string[] {
        const s = store.get();
        const ids = s.cleanup?.picked ?? [];
        if (!s.snapshot || ids.length === 0) return [];
        store.dispatch({ type: 'selectAll', ids });
        return ids;
    }
    /** Remove from the solution: the plan and its dialog (feature 016, 019). */
    function removeIds(ids: readonly string[]): void {
        const snapshot = store.get().snapshot;
        if (!snapshot) return;
        store.dispatch({ type: 'openPlan', plan: planRemoval(snapshot, ids, 'remove') });
        store.dispatch({ type: 'openConfirm' });
    }
    /** Delete: what depends on each row is asked first; a row something depends on is never offered for deletion. */
    async function deleteIds(ids: readonly string[]): Promise<void> {
        const snapshot = store.get().snapshot;
        if (!snapshot) return;
        store.dispatch({ type: 'busy', busy: true });
        const deps = await readDependencies(host, snapshot, ids);
        // the components outside the selection that block it are named (feature 023): what they are and which solutions hold them
        const blockers = new Map<string, { id: string; type: number }>();
        for (const list of Object.values(deps)) for (const d of list ?? []) if (!ids.includes(d.id)) blockers.set(d.id, d);
        const labels = blockers.size === 0 ? {} : await dependentLabels(host, snapshot, [...blockers.values()]);
        store.dispatch({ type: 'busy', busy: false });
        if (store.get().snapshot !== snapshot) return; // the user moved on while it was read
        store.dispatch({ type: 'openPlan', plan: planRemoval(snapshot, ids, 'delete', deps, labels), code: makeCode() });
        store.dispatch({ type: 'openConfirm' });
    }

    let reading = false;
    /**
     * Reads the connections of the environment for the open panel. With `check` the typed id is then looked up in them
     * (only on Enter or the search icon, never while typing). A second request while one runs is ignored.
     */
    function readConnections(check: boolean): Promise<void> {
        const form = store.get().newReference;
        if (!form || form.saving || reading) return run;
        reading = true;
        store.dispatch({ type: 'connectionsLoading' });
        const connectorId = form.connectorId;
        const typed = form.connectionSource === 'typed' ? form.connectionId : '';
        run = (async () => {
            try {
                const res = await loadLiveConnections(host);
                if (store.get().newReference?.connectorId !== connectorId) return; // closed or changed while reading
                if (res.ok) store.dispatch({ type: 'connectionsLoaded', items: res.value });
                else {
                    store.dispatch({ type: 'connectionsFailed', error: res.error });
                    log(`The connections could not be read: ${res.error}`, 'warning');
                }
                if (check && typed !== '') store.dispatch({ type: 'connectionChecked', typed, verdict: verifyConnection(store.get().newReference?.live ?? { status: 'idle', items: [], error: '' }, connectorId, normalizeConnectionName(typed)) });
            } finally {
                reading = false;
            }
        })();
        return run;
    }

    return {
        environment: () => environment,
        idle: () => run,
        async start() {
            environment = await host.environmentName().catch(() => '');
            userId = await host.currentUserId().catch(() => '');
            await readSolutions();
        },
        selectSolution(id) {
            if (store.get().wizard?.step === 'apply') return; // a write in progress is never abandoned
            store.dispatch({ type: 'selectSolution', id });
            // Entering a list re-reads it (constitution VII): the solutions when going back, the solution when opening it.
            void (id === '' ? readSolutions() : readSolution());
        },
        refresh() {
            void (store.get().solutionId === '' ? readSolutions() : readSolution());
        },
        previewConnection() {
            const s = store.get();
            if (!s.snapshot) return;
            store.dispatch({ type: 'openPlan', plan: planConnectionChange(s.snapshot, s.selected, s.newConnectionId, userId) });
        },
        previewRepoint() {
            repointNow();
        },
        setManageState(on) {
            store.dispatch({ type: 'setManageState', on });
            const s = store.get();
            if (s.snapshot && s.plan && s.plan.kind === 'repoint' && s.wizard?.step === 'preview')
                store.dispatch({ type: 'replacePlan', plan: planRepointGroups(s.snapshot, s.selected, s.repointGroups, userId, on) });
        },
        // Taking things away has no step to choose in: the dialog opens at once, over the list (feature 019).
        previewRemove() {
            removeIds(store.get().selected);
        },
        previewDelete() {
            return deleteIds(store.get().selected);
        },
        /** What depends on these references in the whole environment (feature 023): explicit, a few at a time, answers for an old solution dropped. */
        checkDependencies(ids) {
            const s = store.get();
            const snapshot = s.snapshot;
            if (!snapshot) return run;
            const todo = [...new Set(ids)].filter(id => s.dependencies[id]?.status !== 'loading' && snapshot.allReferences.some(r => r.id === id));
            if (todo.length === 0) return run;
            store.dispatch({ type: 'dependenciesLoading', ids: todo });
            let next = 0;
            const worker = async (): Promise<void> => {
                while (next < todo.length) {
                    const id = todo[next++]!;
                    const reference = snapshot.allReferences.find(r => r.id === id)!;
                    const res = await loadDependencyReport(host, snapshot, reference);
                    if (store.get().snapshot !== snapshot) return; // the solution was read again meanwhile: this answer is old
                    store.dispatch(res.ok ? { type: 'dependenciesLoaded', id, report: res.value } : { type: 'dependenciesFailed', id, error: res.error });
                    if (!res.ok) log(`The dependencies of ${reference.logicalName} could not be read: ${res.error}`, 'warning');
                }
            };
            run = Promise.all([worker(), worker(), worker()]).then(() => undefined);
            return run;
        },
        // Clean up (feature 022): the ticked references go through the very same Remove and Delete dialogs.
        cleanupRemove() {
            const ids = tickedForCleanup();
            if (ids.length === 0) return;
            removeIds(ids);
        },
        cleanupDelete() {
            const ids = tickedForCleanup();
            if (ids.length === 0) return Promise.resolve();
            return deleteIds(ids);
        },
        /** Starts the re-point of a merge (two operations, two confirmations: T2); with no flow to re-point, goes to the unused list. */
        startMerge(groupKey) {
            const s = store.get();
            const snapshot = s.snapshot;
            const group = snapshot ? duplicateGroups(snapshot).find(g => g.key === groupKey) : undefined;
            if (!snapshot || !group) return;
            const keeper = keeperOf(group, s.cleanup);
            const merge = mergeInput(snapshot, group, keeper);
            if (!merge) return;
            const ids = merge.duplicates.map(d => d.id);
            if (merge.group === null) {
                // no flow uses the duplicates: they are already unused, so they are only to be taken away
                store.dispatch({ type: 'openCleanup', tab: 'unused', picked: ids });
                return;
            }
            store.dispatch({ type: 'startMerge', flowIds: merge.flowIds, group: merge.group, followUp: { ids, keeper: merge.keeper.displayName || merge.keeper.logicalName } });
            if (store.get().cleanupFollowUp === null) return;
            repointNow();
        },
        openNewReference(connectorId) {
            store.dispatch({ type: 'openNewReference', connectorId, seed: randomSeed() });
            if (store.get().newReference === null) return run;
            return readConnections(false);
        },
        refreshConnections() {
            return readConnections(false);
        },
        checkConnection() {
            return readConnections(true);
        },
        createReference() {
            const s = store.get();
            const form = s.newReference;
            const snapshot = s.snapshot;
            if (!form || !snapshot || !form.reviewing || form.saving) return run;
            // The state is the only authority: it starts the write only from a reviewed form.
            store.dispatch({ type: 'newReferenceSaving' });
            if (store.get().newReference?.saving !== true) return run;
            run = (async () => {
                const res = await createReference(host, snapshot, form, step => store.dispatch({ type: 'newReferenceStep', step }));
                if (store.get().solutionId !== snapshot.solution.id) return; // the user moved on while it was written
                if (res.ok) {
                    // the end is shown (all steps done, "Created") for a moment before the panel closes
                    store.dispatch({ type: 'newReferenceStep', step: 'done' });
                    if (celebrateMs > 0) await new Promise<void>(done => setTimeout(done, celebrateMs));
                    if (store.get().solutionId !== snapshot.solution.id) return;
                    store.dispatch({ type: 'referenceCreated', reference: res.value.reference, componentType: res.value.componentType });
                    log(`Created ${res.value.reference.logicalName} in ${snapshot.solution.name}.`, 'success');
                    await host.notify(`Created ${res.value.reference.displayName || res.value.reference.logicalName}.`, 'success').catch(() => undefined);
                } else {
                    store.dispatch({ type: 'newReferenceFailed', error: res.error });
                    log(res.error, 'error');
                }
            })();
            return run;
        },
        setTypedCode(value) {
            store.dispatch({ type: 'setTypedCode', value });
        },
        async saveBackup() {
            const plan = store.get().plan;
            if (!plan) return;
            const at = new Date().toISOString();
            const saved = await host.saveFile(backupFileName(plan, at), buildBackup(plan, environment, at)).catch(() => false);
            if (saved) store.dispatch({ type: 'backupSaved' });
            log(saved ? 'Backup of the old values saved.' : 'Backup not saved.', saved ? 'success' : 'warning');
        },
        async saveReport() {
            const s = store.get();
            const w = s.wizard;
            if (!w || w.step !== 'result' || !s.results) return;
            const finishedAt = w.finishedAt ?? w.now;
            const operation = operationLabel(w.operation);
            const content = buildReport({ operation, solution: s.snapshot?.solution.name ?? '', environment, startedAt: w.startedAt, finishedAt, results: s.results });
            const saved = await host.saveFile(reportFileName(operation, finishedAt), content).catch(() => false);
            log(saved ? 'Report saved.' : 'Report not saved.', saved ? 'success' : 'warning');
        },
        confirm() {
            const s = store.get();
            if (!s.plan) return;
            // The state is the only authority: it starts the write only from the open confirmation of the Preview step
            // with the acknowledgement ticked, and refuses anything else (tests: reducer and apply).
            store.dispatch({ type: 'applyStarted', now: clock(), total: s.plan.rows.length });
            if (store.get().wizard?.step !== 'apply') return;
            run = apply();
        },
    };
}
