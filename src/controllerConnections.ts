import { features } from './features';
import type { Host } from './host';
import { portalAddress } from './host';
import { buildReport, reportFileName } from './model/report';
import { checkOrder } from './model/connections';
import { planConnectionDeletion } from './model/connectionPlan';
import { loadConnections, loadConnectionDependencies, makeContext, applyConnectionDeletion, checkAll as runCheckAll, SWITCHED_OFF, type DepsContext } from './services/connections';
import { log } from './services/log';
import type { Store } from './state/store';
import type { ConnectionsHandlers } from './views/connectionsHandlers';

/**
 * Wires the Connections area to its services and dispatches the outcome (feature 024). No markup and no rules of its own:
 * who may be ticked, what a plan holds and when a dialog may open are decided by the pure model and the state. Logs say
 * how many were read, never the names (T7).
 */
export function createConnectionsController(host: Host, store: Store, clock: () => number, makeCode: () => string, environment: () => string): ConnectionsHandlers & { idle(): Promise<void> } {
    let ctx: DepsContext | null = null;
    let reading: Promise<void> | null = null;
    let checking: Promise<void> | null = null;
    let running: Promise<void> = Promise.resolve();
    let switchedOffSaid = false;

    const cm = () => store.get().connections;

    /** The inventory of the connectors: a hint beside the verdict. It never blocks anything and a refusal is only said once in the log. */
    async function readUsage(environmentId: string): Promise<void> {
        const c = makeContext(host, environmentId);
        store.dispatch({ type: 'cmUsageLoading' });
        const res = await (ctx !== null && ctx.environmentId === environmentId ? ctx : c).inventory();
        if (res.ok) {
            store.dispatch({ type: 'cmUsageLoaded', map: res.value.usage });
            log(`Read how many flows, apps and agents use each connector: ${Object.keys(res.value.usage).length} connectors.`, 'info');
        } else {
            store.dispatch({ type: 'cmUsageFailed', error: res.error });
            log(`The inventory of the connectors could not be read (the dependencies are not affected): ${res.error}`, 'warning');
        }
    }

    async function refresh(): Promise<void> {
        // a second request while one runs is ignored; a Check all in progress is stopped first (its answers belong to the old list)
        if (reading) return reading;
        reading = (async () => {
            if (checking) {
                store.dispatch({ type: 'cmCheckAllCancel' });
                await checking;
            }
            store.dispatch({ type: 'cmLoading' });
            const res = await loadConnections(host, count => store.dispatch({ type: 'cmPage', count }));
            if (res.ok) {
                ctx = makeContext(host, res.value.environmentId);
                store.dispatch({ type: 'cmLoaded', items: res.value.rows, environmentId: res.value.environmentId });
                log(`Read ${res.value.rows.length} connections.`, 'info');
                void readUsage(res.value.environmentId);
            } else {
                store.dispatch({ type: 'cmFailed', error: res.error });
                log(res.error, 'warning');
            }
        })().finally(() => {
            reading = null;
        });
        running = reading;
        return reading;
    }

    /** Reads what depends on one connection; the answer is dropped by the state if the connection left the list meanwhile. */
    async function readDeps(name: string): Promise<void> {
        const c = ctx;
        const row = cm().list.items.find(r => r.name === name);
        if (!c || !row) return;
        store.dispatch({ type: 'cmDepsLoading', names: [name] });
        try {
            const report = await loadConnectionDependencies(host, c, row);
            if (ctx !== c) return; // the list was read again meanwhile: this answer is old
            store.dispatch({ type: 'cmDepsLoaded', name, report });
            const bad = (['apps', 'references', 'flows', 'agents'] as const).filter(n => report.sources[n].status !== 'ok');
            log(`Read the dependencies of a connection: ${report.dependents.length} found${bad.length > 0 ? `; not fully read: ${bad.join(', ')}` : ''}.`, bad.length > 0 ? 'warning' : 'info');
        } catch (e) {
            if (ctx !== c) return;
            const error = e instanceof Error ? e.message : String(e);
            store.dispatch({ type: 'cmDepsFailed', name, error });
            log(`The dependencies of a connection could not be read: ${error}`, 'warning');
        }
    }

    async function open(): Promise<void> {
        store.dispatch({ type: 'setArea', area: 'connections' });
        await refresh();
    }

    return {
        idle: () => running,
        open,
        refresh,
        async toggleOpen(name) {
            store.dispatch({ type: 'cmToggleOpen', name });
            const c = cm();
            const d = c.deps[name];
            if (c.open.includes(name) && (d === undefined || d.status === 'failed')) await readDeps(name);
        },
        async checkAgain(name) {
            ctx?.invalidate();
            await readDeps(name);
        },
        async checkAll(only) {
            const c = ctx;
            const names = only === 'selected' ? new Set(cm().selected) : null;
            const rows = checkOrder(cm().list.items.filter(r => names === null || names.has(r.name)));
            if (!c || rows.length === 0 || checking) return;
            c.invalidate();
            store.dispatch({ type: 'cmCheckAllStarted', total: rows.length, now: clock(), ...(names ? { only: [...names] } : {}) });
            checking = (async () => {
                const result = await runCheckAll(host, c, rows, {
                    onStep: step => store.dispatch({ type: 'cmCheckAllStep', step }),
                    onProgress: done => store.dispatch({ type: 'cmCheckAllProgress', done, now: clock() }),
                    onResult: (name, r) => {
                        if (ctx !== c) return;
                        store.dispatch('error' in r ? { type: 'cmDepsFailed', name, error: r.error } : { type: 'cmDepsLoaded', name, report: r });
                    },
                    cancelled: () => cm().checkAll?.cancelled === true,
                });
                store.dispatch({ type: 'cmCheckAllFinished' });
                const deps = Object.values(cm().deps);
                const none = deps.filter(d => d.status === 'ready' && d.report.verdict === 'none-found').length;
                const used = deps.filter(d => d.status === 'ready' && d.report.verdict === 'in-use').length;
                log(`Checked ${result.done} of ${rows.length} connections${result.cancelled ? ' (cancelled)' : ''}: ${none} with no dependency found, ${used} in use.`, 'info');
            })().finally(() => {
                checking = null;
            });
            running = checking;
            await checking;
        },
        cancelCheckAll() {
            store.dispatch({ type: 'cmCheckAllCancel' });
        },
        async copyAddress(name) {
            const env = cm().environmentId;
            if (env === '') {
                log('The id of the environment is not known, so the address cannot be built.', 'warning');
                return;
            }
            try {
                const row = name === undefined ? undefined : cm().list.items.find(r => r.name === name);
                await host.copyText(row ? portalAddress(env, row.connectorKey, row.name) : portalAddress(env));
                log(row ? 'Address of the connection in the Maker portal copied.' : 'Address of the connections page copied.', 'success');
                await host.notify('Address copied.', 'success').catch(() => undefined);
            } catch (e) {
                log(`The address could not be copied: ${e instanceof Error ? e.message : String(e)}`, 'warning');
            }
        },
        openDeletion() {
            if (!features.connectionDelete) {
                if (!switchedOffSaid) log(SWITCHED_OFF, 'info');
                switchedOffSaid = true;
                return;
            }
            const c = cm();
            store.dispatch({ type: 'cmDeletionOpen', plan: planConnectionDeletion(c.list.items, c.deps, c.selected), code: makeCode() });
        },
        async saveBackup() {
            const d = cm().deletion;
            if (!d) return;
            const stamp = new Date(clock()).toISOString().replace(/[^0-9]/g, '').slice(0, 14);
            const saved = await host.saveFile(`connections-backup-${stamp}.json`, d.plan.backup).catch(() => false);
            if (saved) store.dispatch({ type: 'cmDeletionBackupSaved' });
            log(saved ? 'Backup of the connections saved.' : 'Backup not saved.', saved ? 'success' : 'warning');
        },
        confirmDeletion() {
            // the state starts the run only from a Preview with the code typed and the acknowledgement on
            store.dispatch({ type: 'cmDeletionApply', now: clock() });
            const d = cm().deletion;
            const c = ctx;
            if (!d || d.step !== 'apply' || !c) return;
            const rows = cm().list.items;
            const env = cm().environmentId;
            const timer = setInterval(() => store.dispatch({ type: 'cmDeletionTick', now: clock() }), 1000);
            running = (async () => {
              try {
                const results = await applyConnectionDeletion(
                    host,
                    env,
                    d.plan,
                    rows,
                    async row => {
                        c.invalidate(); // what depends on it is read anew, just before it is deleted
                        return loadConnectionDependencies(host, c, row);
                    },
                    outcome => store.dispatch({ type: 'cmDeletionRow', outcome, now: clock() }),
                    (id, label, step) => store.dispatch({ type: 'cmDeletionStep', id, label, step, now: clock() }),
                );
                const again = await loadConnections(host);
                if (again.ok) {
                    ctx = makeContext(host, again.value.environmentId);
                    store.dispatch({ type: 'cmLoaded', items: again.value.rows, environmentId: again.value.environmentId, keepDeps: true });
                }
                store.dispatch({ type: 'cmDeletionDone', results, refreshFailed: !again.ok, now: clock() });
                const failed = results.filter(r => r.status === 'failed').length;
                log(`Deleted ${results.filter(r => r.status === 'done').length} connections, ${failed} failed.`, failed > 0 ? 'warning' : 'success');
              } finally {
                clearInterval(timer);
              }
            })();
        },
        closeDeletion() {
            store.dispatch({ type: 'cmDeletionClose' });
        },
        async saveReport() {
            const d = cm().deletion;
            if (!d || d.step !== 'result' || !d.results) return;
            const content = buildReport({ operation: 'Delete connections', solution: 'Connections', environment: environment(), startedAt: d.startedAt, finishedAt: d.now, results: d.results });
            const saved = await host.saveFile(reportFileName('Delete connections', d.now), content).catch(() => false);
            log(saved ? 'Report saved.' : 'Report not saved.', saved ? 'success' : 'warning');
        },
        async openConnection(name) {
            await open();
            const c = cm();
            if (!c.list.items.some(r => r.name === name)) {
                log('That connection is not in the list of connections you can see.', 'info');
                return;
            }
            // arriving from a chip: a leftover filter, connector or search must not hide the connection, so the list narrows to it (the cross in the search clears it)
            store.dispatch({ type: 'cmFilter', filter: 'all' });
            store.dispatch({ type: 'cmConnector', key: '' });
            store.dispatch({ type: 'cmSearch', text: name });
            if (!cm().open.includes(name)) store.dispatch({ type: 'cmToggleOpen', name });
            await readDeps(name);
        },
        backToSolutions() {
            store.dispatch({ type: 'setArea', area: 'solutions' });
        },
    };
}
