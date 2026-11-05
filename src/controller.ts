import type { Host } from './host';
import { buildSnapshot } from './model/analysis';
import { backupFileName, buildBackup } from './model/backup';
import { planConnectionChange, planRepointGroups } from './model/plans';
import { planRemoval } from './model/removal';
import { buildReport, reportFileName } from './model/report';
import { operationLabel } from './model/workflow';
import { applyPlan, loadFlowCounts, loadSnapshotInput, loadSolutions, readDependencies } from './services/dataverse';
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
            const s = store.get();
            if (!s.snapshot) return;
            store.dispatch({ type: 'openPlan', plan: planRepointGroups(s.snapshot, s.selected, s.repointGroups, userId, s.manageState) });
        },
        setManageState(on) {
            store.dispatch({ type: 'setManageState', on });
            const s = store.get();
            if (s.snapshot && s.plan && s.plan.kind === 'repoint' && s.wizard?.step === 'preview')
                store.dispatch({ type: 'replacePlan', plan: planRepointGroups(s.snapshot, s.selected, s.repointGroups, userId, on) });
        },
        // Taking things away has no step to choose in: the dialog opens at once, over the list (feature 019).
        previewRemove() {
            const s = store.get();
            if (!s.snapshot) return;
            store.dispatch({ type: 'openPlan', plan: planRemoval(s.snapshot, s.selected, 'remove') });
            store.dispatch({ type: 'openConfirm' });
        },
        async previewDelete() {
            const s = store.get();
            if (!s.snapshot) return;
            const chosen = s.selected;
            const snapshot = s.snapshot;
            store.dispatch({ type: 'busy', busy: true });
            // what depends on each row is asked first: a row something depends on is never offered for deletion
            const deps = await readDependencies(host, snapshot, chosen);
            store.dispatch({ type: 'busy', busy: false });
            if (store.get().snapshot !== snapshot) return; // the user moved on while it was read
            store.dispatch({ type: 'openPlan', plan: planRemoval(snapshot, chosen, 'delete', deps), code: makeCode() });
            store.dispatch({ type: 'openConfirm' });
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
