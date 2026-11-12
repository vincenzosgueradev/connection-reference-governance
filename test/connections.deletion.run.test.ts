// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DELETION_STEPS, deletionPercent, planConnectionDeletion } from '../src/model/connectionPlan';
import { allOk, mergeReport } from '../src/model/connectionDeps';
import type { ConnectionRow } from '../src/types';
import { emptyWorld, worldHost } from './helpers/connectionsWorld';
import type { ConnectionSeed, ScenarioOptions } from './helpers/scenario';

/**
 * Feature 024, FR-2422: the deletion run is alive. The percentage, the four steps of each connection, the log with its times,
 * the tick of the clock and what the dialog shows while it runs. The flag is mocked on (it is a declared decision of the tool).
 * Synthetic data only.
 */

afterEach(() => {
    vi.doUnmock('../src/features');
});

const row = (name: string): ConnectionRow => ({ name, connectorKey: 'a', connectorName: 'A', displayName: `${name} display`, status: 'connected', statusDetail: '', createdTime: '', modifiedTime: '', creator: { name: 'Ann', email: '' } });
const free = () => mergeReport([], allOk());
const used = () => mergeReport([{ kind: 'app', id: 'a1', name: 'An app', state: '', ownerName: '', solutions: [], via: '' }], allOk());
const planFor = (rows: ConnectionRow[]) => planConnectionDeletion(rows, Object.fromEntries(rows.map(r => [r.name, { status: 'ready' as const, report: free() }])), rows.map(r => r.name));

describe('the percentage of the run', () => {
    it('the four steps are in order, each with a name and what is being done', () => {
        expect(DELETION_STEPS.map(s => s.key)).toEqual(['check', 'exists', 'delete', 'verify']);
        expect(DELETION_STEPS.every(s => s.label !== '' && s.doing !== '')).toBe(true);
    });
    it('counts the finished connections and the steps of the one in hand, never more than 95 before the end', () => {
        expect(deletionPercent(0, 0, null)).toBe(0);
        expect(deletionPercent(0, 4, null)).toBe(0);
        expect(deletionPercent(0, 4, 'check')).toBe(0);
        expect(deletionPercent(0, 4, 'delete')).toBe(12); // half of one connection of four, of 95
        expect(deletionPercent(2, 4, 'check')).toBe(48);
        expect(deletionPercent(4, 4, null)).toBe(95);
        expect(deletionPercent(9, 4, 'verify')).toBe(95); // a count beyond the total is held
    });
    it('only ever goes forward through a run', () => {
        let last = -1;
        for (let done = 0; done < 3; done++) {
            for (const s of [null, ...DELETION_STEPS.map(x => x.key)] as const) {
                const p = deletionPercent(done, 3, s);
                expect(p).toBeGreaterThanOrEqual(last);
                last = p;
            }
        }
    });
});

describe('the steps that the service announces', () => {
    const load = async () => {
        vi.resetModules();
        vi.doMock('../src/features', () => ({ features: { connectionDelete: true } }));
        return import('../src/services/connections');
    };
    it('announces the four steps, in order, for each connection that goes through', async () => {
        const { applyConnectionDeletion } = await load();
        const rows = [row('c1'), row('c2')];
        const h = worldHost(emptyWorld({ connections: [{ name: 'c1' }, { name: 'c2' }] }));
        const seen: string[] = [];
        await applyConnectionDeletion(h, 'env-1', planFor(rows), rows, async () => free(), undefined, (id, label, step) => seen.push(`${id}:${step}:${label}`));
        expect(seen).toEqual([
            'c1:check:c1 display', 'c1:exists:c1 display', 'c1:delete:c1 display', 'c1:verify:c1 display',
            'c2:check:c2 display', 'c2:exists:c2 display', 'c2:delete:c2 display', 'c2:verify:c2 display',
        ]);
    });
    it('stops announcing at the step where a connection stops: a dependency found again after the check', async () => {
        const { applyConnectionDeletion } = await load();
        const rows = [row('c1')];
        const h = worldHost(emptyWorld({ connections: [{ name: 'c1' }] }));
        const seen: string[] = [];
        await applyConnectionDeletion(h, 'env-1', planFor(rows), rows, async () => used(), undefined, (_id, _l, step) => seen.push(step));
        expect(seen).toEqual(['check']);
        expect(h.calls.deleted).toEqual([]);
    });
    it('announces nothing for a connection that is blocked in the plan, and a failing listener never stops the run', async () => {
        const { applyConnectionDeletion } = await load();
        const rows = [row('c1'), row('c2')];
        const h = worldHost(emptyWorld({ connections: [{ name: 'c1' }, { name: 'c2' }] }));
        const plan = planConnectionDeletion(rows, { c1: { status: 'ready', report: used() }, c2: { status: 'ready', report: free() } }, ['c1', 'c2']);
        const seen: string[] = [];
        const out = await applyConnectionDeletion(h, 'env-1', plan, rows, async () => free(), undefined, (id, _l, step) => { seen.push(`${id}:${step}`); throw new Error('listener'); });
        expect(seen.every(s => s.startsWith('c2:'))).toBe(true);
        expect(out.map(o => o.status)).toEqual(['skipped', 'done']);
    });
});

describe('the state of the run', () => {
    const load = async () => {
        vi.resetModules();
        vi.doMock('../src/features', () => ({ features: { connectionDelete: true } }));
        return import('../src/state/connectionsState');
    };
    const started = async () => {
        const m = await load();
        const rows = [row('a'), row('b')];
        let c = m.emptyConnections();
        const step = (...as: Parameters<typeof m.connectionsStep>[1][]) => { for (const a of as) c = m.connectionsStep(c, a); return c; };
        step({ type: 'cmLoaded', items: rows, environmentId: 'e' }, { type: 'cmDepsLoaded', name: 'a', report: free() }, { type: 'cmDepsLoaded', name: 'b', report: free() }, { type: 'cmToggle', name: 'a' }, { type: 'cmToggle', name: 'b' });
        const plan = planConnectionDeletion(rows, c.deps, c.selected);
        step({ type: 'cmDeletionOpen', plan, code: 'K' }, { type: 'cmDeletionTyped', text: 'K' }, { type: 'cmDeletionAck', on: true }, { type: 'cmDeletionPortalAll', on: true }, { type: 'cmDeletionApply', now: 1000 });
        return { m, step, get: () => c.deletion! };
    };
    it('starts with one line in the log and nothing in hand', async () => {
        const { get } = await started();
        expect(get()).toMatchObject({ step: 'apply', total: 2, current: null, log: [{ at: 0, text: 'Started: 2 connections to delete.', tone: 'info' }] });
    });
    it('a step puts the connection in hand and adds a line with the time since the start', async () => {
        const { step, get } = await started();
        step({ type: 'cmDeletionStep', id: 'a', label: 'A', step: 'delete', now: 4500 });
        expect(get().current).toEqual({ id: 'a', label: 'A', step: 'delete' });
        expect(get().log.at(-1)).toEqual({ at: 3500, text: `A: ${DELETION_STEPS[2]!.doing}`, tone: 'info' });
        expect(get().now).toBe(4500);
    });
    it('a finished connection clears the one in hand and logs its outcome in the colour of how it went', async () => {
        const { step, get } = await started();
        step({ type: 'cmDeletionStep', id: 'a', label: 'A', step: 'verify', now: 2000 });
        step({ type: 'cmDeletionRow', outcome: { id: 'a', label: 'A', status: 'done', message: 'Deleted and read back.' }, now: 3000 });
        expect(get().current).toBeNull();
        expect(get().log.at(-1)).toEqual({ at: 2000, text: 'A: Deleted and read back.', tone: 'success' });
        step({ type: 'cmDeletionRow', outcome: { id: 'b', label: 'B', status: 'skipped', message: 'Checked again just before: x' }, now: 4000 });
        expect(get().log.at(-1)!.tone).toBe('warning');
    });
    it('a failure is logged as an error', async () => {
        const { step, get } = await started();
        step({ type: 'cmDeletionRow', outcome: { id: 'a', label: 'A', status: 'failed', message: 'boom' }, now: 2000 });
        expect(get().log.at(-1)!.tone).toBe('error');
    });
    it('the tick moves the clock and nothing else', async () => {
        const { step, get } = await started();
        const before = get();
        step({ type: 'cmDeletionTick', now: 9000 });
        expect(get()).toEqual({ ...before, now: 9000 });
    });
    it('steps and ticks outside a run change nothing: not in the Preview, not after the end', async () => {
        const m = await load();
        const rows = [row('a')];
        let c = m.connectionsStep(m.emptyConnections(), { type: 'cmLoaded', items: rows, environmentId: 'e' });
        c = m.connectionsStep(c, { type: 'cmDepsLoaded', name: 'a', report: free() });
        c = m.connectionsStep(c, { type: 'cmToggle', name: 'a' });
        c = m.connectionsStep(c, { type: 'cmDeletionOpen', plan: planConnectionDeletion(rows, c.deps, c.selected), code: 'K' });
        expect(m.connectionsStep(c, { type: 'cmDeletionStep', id: 'a', label: 'A', step: 'check', now: 5 })).toBe(c);
        expect(m.connectionsStep(c, { type: 'cmDeletionTick', now: 5 })).toBe(c);
        expect(m.connectionsStep(m.emptyConnections(), { type: 'cmDeletionStep', id: 'a', label: 'A', step: 'check', now: 5 }).deletion).toBeNull();
    });
});

describe('what the dialog shows while it runs', () => {
    const TYPE_QUERY = "solutioncomponentdefinitions?$select=solutioncomponenttype&$filter=primaryentityname eq 'connectionreference'";
    const SEEDS: ConnectionSeed[] = [{ name: 'conn-1' }, { name: 'conn-free' }, { name: 'conn-other', connector: 'shared_b' }];
    async function ready(over: ScenarioOptions = {}) {
        vi.resetModules();
        vi.doMock('../src/features', () => ({ features: { connectionDelete: true } }));
        const m = await import('./helpers/scenario');
        const answer: ScenarioOptions['answer'] = q => (q.startsWith(TYPE_QUERY) ? [{ solutioncomponenttype: 10001 }] : undefined);
        const a = await m.app({ answer, connectionRows: SEEDS.map(s => ({ ...s })), ...over });
        await a.controller.connections!.open();
        await a.controller.idle();
        await m.settle();
        await a.controller.connections!.checkAll();
        await m.settle();
        return { a, m };
    }

    it('shows the ring, the four steps, the counters and a log that grows, then the result', async () => {
        let release!: () => void;
        const gate = new Promise<void>(r => { release = r; });
        const { a, m } = await ready({ beforeDeleteConnection: () => gate });
        m.buttonByText(a.root, 'Select the ones with no dependency found')!.click();
        m.buttonByText(a.root, 'Delete...')!.click();
        const code = a.store.get().connections.deletion!.code;
        const field = m.q(a.root, '.removal-input') as HTMLInputElement;
        field.value = code;
        field.dispatchEvent(new Event('input', { bubbles: true }));
        (m.q(a.root, '.cm-deletion .ack .toggle') as HTMLElement).click();
        a.store.dispatch({ type: 'cmDeletionPortalAll', on: true });
        (m.qa(a.root, '.cm-deletion .modal-actions button').find(b => /^Delete \d/.test(b.textContent!.trim())) as HTMLButtonElement).click();
        await m.settle();
        const d = m.q(a.root, '.cm-deletion')!;
        expect(m.q(d, '.run-ring')!.getAttribute('aria-label')).toBe('Progress of the deletion');
        expect(m.qa(d, '.pipe-step').map(s => m.q(s, '.pipe-label')!.textContent)).toEqual(DELETION_STEPS.map(s => s.label));
        expect(m.qa(d, '.pipe-step.is-active').map(s => m.q(s, '.pipe-label')!.textContent)).toEqual(['Delete']); // held at the delete request
        expect(m.qa(d, '.run-count').map(c => c.textContent)).toEqual(['0deleted', '0skipped', '0failed']);
        const lines = m.qa(d, '.cm-runlog-line');
        expect(lines[0]!.textContent).toContain('Started: ');
        expect(lines.length).toBeGreaterThanOrEqual(4); // started, check, find, delete
        expect(m.q(d, '.cm-runlog')!.getAttribute('role')).toBe('log');
        release();
        await a.controller.idle();
        await m.settle(30);
        expect(a.store.get().connections.deletion!.step).toBe('result');
        expect(a.store.get().connections.deletion!.current).toBeNull();
    });
});
