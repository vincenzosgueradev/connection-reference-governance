import type { RowOutcome } from '../types';

/** Time, phases, summary and banner of a run. Pure: the clock is a parameter of the caller. */

export function formatElapsed(ms: number): string {
    const total = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0;
    const pad = (n: number) => String(n).padStart(2, '0');
    if (total < 60) return `${total} s`;
    if (total < 3600) return `${Math.floor(total / 60)} min ${pad(total % 60)} s`;
    return `${Math.floor(total / 3600)} h ${pad(Math.floor((total % 3600) / 60))} min`;
}

export type Phase = 'off' | 'write' | 'on' | 'refresh' | 'done';
export interface PhaseStep {
    readonly label: string;
    readonly state: 'done' | 'active' | 'pending' | 'error';
}

const PHASES = ['Confirmed', 'Write and verify', 'Refresh', 'Summary'] as const;
const PHASES_WITH_STATE = ['Confirmed', 'Turn off', 'Write and verify', 'Turn on', 'Refresh', 'Summary'] as const;

/** The timeline of a run. With state changes the flows are turned off before the write and on again after it. */
export function phaseSteps(phase: Phase, refreshFailed: boolean, withState = false): PhaseStep[] {
    if (withState) {
        const at = { off: 1, write: 2, on: 3, refresh: 4, done: 6 }[phase];
        const states = PHASES_WITH_STATE.map((_, i): PhaseStep['state'] => (i < at ? 'done' : i === at ? 'active' : 'pending'));
        if (phase === 'done' && refreshFailed) states[4] = 'error';
        return PHASES_WITH_STATE.map((label, i) => ({ label, state: states[i]! }));
    }
    const states: PhaseStep['state'][] =
        phase === 'write' || phase === 'off' || phase === 'on' ? ['done', 'active', 'pending', 'pending']
            : phase === 'refresh' ? ['done', 'done', 'active', 'pending']
                : ['done', 'done', refreshFailed ? 'error' : 'done', 'done'];
    return PHASES.map((label, i) => ({ label, state: states[i]! }));
}

export function statusText(phase: Phase, done: number, total: number, elapsedMs: number): string {
    const t = formatElapsed(elapsedMs);
    if (phase === 'off') return `Turning the flows off · ${t}`;
    if (phase === 'on') return `Turning the flows on again · ${t}`;
    if (phase === 'write') return `Writing and verifying: ${done} of ${total} row${total === 1 ? '' : 's'} · ${t}`;
    if (phase === 'refresh') return `Reading the solution again · ${t}`;
    return `Finished in ${t}`;
}

export interface Summary {
    readonly changed: number;
    readonly skipped: number;
    readonly failed: number;
    readonly total: number;
}

export function summarize(results: readonly RowOutcome[]): Summary {
    const count = (s: RowOutcome['status']) => results.filter(r => r.status === s).length;
    return { changed: count('done'), skipped: count('skipped'), failed: count('failed'), total: results.length };
}

export interface Banner {
    readonly tone: 'success' | 'warning' | 'error';
    readonly title: string;
    readonly lines: readonly string[];
}

export function banner(s: Summary, refreshFailed: boolean): Banner {
    let tone: Banner['tone'];
    let title: string;
    let lines: string[];
    if (s.total === 0) {
        tone = 'warning';
        title = 'Nothing to write';
        lines = ['No row could be written.'];
    } else if (s.changed === 0) {
        tone = 'error';
        title = 'Nothing was written';
        lines = [`${s.failed} failed, ${s.skipped} skipped. Read the messages below.`];
    } else if (s.failed === 0 && s.skipped === 0) {
        tone = 'success';
        title = 'All changes were written';
        lines = [`${s.changed} row${s.changed === 1 ? ' was' : 's were'} written and read back.`];
    } else {
        tone = 'warning';
        title = 'Partly done';
        lines = [`${s.changed} written, ${s.skipped} skipped, ${s.failed} failed.`];
    }
    if (refreshFailed) {
        if (tone === 'success') tone = 'warning';
        lines = [...lines, 'The solution could not be read again, so the data on screen may be old. Use Refresh.'];
    }
    return { tone, title, lines };
}

const ORDER: Record<RowOutcome['status'], number> = { failed: 0, skipped: 1, done: 2 };

/** The rows that need a second look first; the order inside each group is kept. */
export function attentionFirst(results: readonly RowOutcome[]): RowOutcome[] {
    return results.map((r, i) => ({ r, i })).sort((a, b) => ORDER[a.r.status] - ORDER[b.r.status] || a.i - b.i).map(x => x.r);
}

/** How far the bar is: the rows fill it up to 85%, reading the solution again takes it to 92%, the end is 100%. */
export function runPercent(phase: Phase, done: number, total: number): number {
    if (phase === 'done') return 100;
    if (phase === 'refresh') return 92;
    if (phase === 'on') return 88;
    if (phase === 'off') return 5;
    if (total <= 0) return 0;
    return Math.round((Math.min(Math.max(done, 0), total) / total) * 85);
}

export function headline(phase: Phase): string {
    return phase === 'off' ? 'Turning flows off' : phase === 'write' ? 'Processing your changes' : phase === 'on' ? 'Turning flows on again' : phase === 'refresh' ? 'Reading the solution again' : 'Finished';
}
