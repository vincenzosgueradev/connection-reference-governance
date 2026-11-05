import { describe, expect, it } from 'vitest';
import { attentionFirst, banner, formatElapsed, phaseSteps, statusText, summarize } from '../src/model/progress';
import { buildReport, reportFileName } from '../src/model/report';
import type { RowOutcome } from '../src/types';

const row = (id: string, status: RowOutcome['status'], message = ''): RowOutcome => ({ id, label: `Item ${id}`, status, message });

describe('formatElapsed', () => {
    const cases: [number, string][] = [
        [0, '0 s'], [999, '0 s'], [1000, '1 s'], [14_300, '14 s'], [59_999, '59 s'],
        [60_000, '1 min 00 s'], [65_000, '1 min 05 s'], [3_599_000, '59 min 59 s'],
        [3_600_000, '1 h 00 min'], [3_725_000, '1 h 02 min'],
    ];
    for (const [ms, text] of cases) it(`${ms} ms is ${text}`, () => expect(formatElapsed(ms)).toBe(text));
    it('a negative or invalid time reads as zero', () => {
        expect(formatElapsed(-5)).toBe('0 s');
        expect(formatElapsed(Number.NaN)).toBe('0 s');
    });
});

describe('the phases', () => {
    const states = (phase: Parameters<typeof phaseSteps>[0], failed = false) => phaseSteps(phase, failed).map(s => s.state);
    it('are Confirmed, Write and verify, Refresh, Summary', () => {
        expect(phaseSteps('write', false).map(s => s.label)).toEqual(['Confirmed', 'Write and verify', 'Refresh', 'Summary']);
    });
    it('follow the run: writing, refreshing, done', () => {
        expect(states('write')).toEqual(['done', 'active', 'pending', 'pending']);
        expect(states('refresh')).toEqual(['done', 'done', 'active', 'pending']);
        expect(states('done')).toEqual(['done', 'done', 'done', 'done']);
    });
    it('a refresh that failed marks that phase as failed and the summary is still reached', () => {
        expect(states('done', true)).toEqual(['done', 'done', 'error', 'done']);
    });
});

describe('statusText', () => {
    it('says how far the writing is and for how long', () => {
        expect(statusText('write', 3, 12, 14_000)).toBe('Writing and verifying: 3 of 12 rows · 14 s');
        expect(statusText('write', 0, 12, 0)).toBe('Writing and verifying: 0 of 12 rows · 0 s');
        expect(statusText('write', 1, 1, 1_000)).toBe('Writing and verifying: 1 of 1 row · 1 s');
    });
    it('says what comes after the rows', () => {
        expect(statusText('refresh', 12, 12, 65_000)).toBe('Reading the solution again · 1 min 05 s');
        expect(statusText('done', 12, 12, 70_000)).toBe('Finished in 1 min 10 s');
    });
});

describe('summarize', () => {
    it('counts what was changed, skipped and failed, and they add up to the rows', () => {
        const s = summarize([row('a', 'done'), row('b', 'done'), row('c', 'failed'), row('d', 'skipped'), row('e', 'done')]);
        expect(s).toEqual({ changed: 3, skipped: 1, failed: 1, total: 5 });
        expect(s.changed + s.skipped + s.failed).toBe(s.total);
    });
    it('is zero for no rows', () => expect(summarize([])).toEqual({ changed: 0, skipped: 0, failed: 0, total: 0 }));
});

describe('the banner matches the figures', () => {
    it('all written: success', () => {
        const b = banner({ changed: 3, skipped: 0, failed: 0, total: 3 }, false);
        expect(b.tone).toBe('success');
        expect(b.title).toBe('All changes were written');
        expect(b.lines[0]).toBe('3 rows were written and read back.');
        expect(banner({ changed: 1, skipped: 0, failed: 0, total: 1 }, false).lines[0]).toBe('1 row was written and read back.');
    });
    it('some written and some not: a warning that counts them', () => {
        const b = banner({ changed: 2, skipped: 1, failed: 1, total: 4 }, false);
        expect(b.tone).toBe('warning');
        expect(b.title).toBe('Partly done');
        expect(b.lines[0]).toBe('2 written, 1 skipped, 1 failed.');
    });
    it('nothing written: an error that says why to look', () => {
        const b = banner({ changed: 0, skipped: 2, failed: 1, total: 3 }, false);
        expect(b.tone).toBe('error');
        expect(b.title).toBe('Nothing was written');
        expect(b.lines[0]).toContain('1 failed, 2 skipped');
    });
    it('no rows at all is a warning, not a success', () => {
        expect(banner({ changed: 0, skipped: 0, failed: 0, total: 0 }, false)).toMatchObject({ tone: 'warning', title: 'Nothing to write' });
    });
    it('a refresh that failed turns a success into a warning and adds the line', () => {
        const b = banner({ changed: 3, skipped: 0, failed: 0, total: 3 }, true);
        expect(b.tone).toBe('warning');
        expect(b.lines.some(l => l.includes('may be old'))).toBe(true);
        expect(banner({ changed: 0, skipped: 0, failed: 3, total: 3 }, true).tone).toBe('error');
    });
});

describe('attentionFirst', () => {
    it('puts failed rows first, then skipped, then done, keeping the order inside each group', () => {
        const out = attentionFirst([row('a', 'done'), row('b', 'skipped'), row('c', 'failed'), row('d', 'done'), row('e', 'failed'), row('f', 'skipped')]);
        expect(out.map(r => r.id)).toEqual(['c', 'e', 'b', 'f', 'a', 'd']);
    });
    it('does not change the list it is given', () => {
        const rows = [row('a', 'done'), row('b', 'failed')];
        attentionFirst(rows);
        expect(rows.map(r => r.id)).toEqual(['a', 'b']);
    });
});

describe('the report', () => {
    const base = { operation: 'Re-point flows', solution: 'Sample', environment: 'DEV (Dev)', startedAt: Date.parse('2026-11-04T10:00:00Z'), finishedAt: Date.parse('2026-11-04T10:01:05Z'), results: [row('a', 'done'), row('b', 'failed', 'No privilege'), row('c', 'skipped', 'Changed by someone else')] };
    it('holds the operation, environment, times, duration, summary and every row with its outcome and message', () => {
        const r = JSON.parse(buildReport(base));
        expect(r).toMatchObject({ tool: 'Connection Reference Governance', operation: 'Re-point flows', solution: 'Sample', environment: 'DEV (Dev)', startedAt: '2026-11-04T10:00:00.000Z', finishedAt: '2026-11-04T10:01:05.000Z', durationMs: 65000 });
        expect(r.summary).toEqual({ changed: 1, skipped: 1, failed: 1, total: 3 });
        expect(r.rows).toEqual([
            { id: 'a', name: 'Item a', outcome: 'done', message: '' },
            { id: 'b', name: 'Item b', outcome: 'failed', message: 'No privilege' },
            { id: 'c', name: 'Item c', outcome: 'skipped', message: 'Changed by someone else' },
        ]);
    });
    it('a negative duration (clock change) is zero', () => {
        expect(JSON.parse(buildReport({ ...base, finishedAt: base.startedAt - 5000 })).durationMs).toBe(0);
    });
    it('names the file by operation and time, with no path characters', () => {
        expect(reportFileName('Re-point flows', base.finishedAt)).toBe('report-re-point-flows-20261104100105.json');
        expect(reportFileName('Change connection', base.finishedAt)).toBe('report-change-connection-20261104100105.json');
        expect(reportFileName('A/B: C', base.finishedAt)).toMatch(/^[a-z0-9.-]+$/);
    });
});

import { headline, runPercent } from '../src/model/progress';

describe('runPercent and headline', () => {
    it('the write phase fills up to 85% by rows, refresh is 92%, done is 100%', () => {
        expect(runPercent('write', 0, 5)).toBe(0);
        expect(runPercent('write', 1, 5)).toBe(17);
        expect(runPercent('write', 1, 3)).toBe(28);
        expect(runPercent('write', 5, 5)).toBe(85);
        expect(runPercent('refresh', 5, 5)).toBe(92);
        expect(runPercent('done', 5, 5)).toBe(100);
    });
    it('is safe with no rows and with more done than total', () => {
        expect(runPercent('write', 0, 0)).toBe(0);
        expect(runPercent('write', 9, 5)).toBe(85);
        expect(runPercent('write', -1, 5)).toBe(0);
    });
    it('the headline names what is going on', () => {
        expect(headline('write')).toBe('Processing your changes');
        expect(headline('refresh')).toBe('Reading the solution again');
        expect(headline('done')).toBe('Finished');
    });
});

describe('phases of a run that turns flows off and on (feature 011)', () => {
    it('has six phases with Turn off and Turn on around the write', () => {
        expect(phaseSteps('off', false, true).map(s => s.label)).toEqual(['Confirmed', 'Turn off', 'Write and verify', 'Turn on', 'Refresh', 'Summary']);
    });
    it('the states follow the phase', () => {
        const st = (p: Parameters<typeof phaseSteps>[0]) => phaseSteps(p, false, true).map(s => s.state);
        expect(st('off')).toEqual(['done', 'active', 'pending', 'pending', 'pending', 'pending']);
        expect(st('write')).toEqual(['done', 'done', 'active', 'pending', 'pending', 'pending']);
        expect(st('on')).toEqual(['done', 'done', 'done', 'active', 'pending', 'pending']);
        expect(st('refresh')).toEqual(['done', 'done', 'done', 'done', 'active', 'pending']);
        expect(st('done')).toEqual(['done', 'done', 'done', 'done', 'done', 'done']);
    });
    it('a refresh that failed marks the refresh step, as before', () => {
        expect(phaseSteps('done', true, true).map(s => s.state)[4]).toBe('error');
    });
    it('without state changes the phases are the four of before', () => {
        expect(phaseSteps('write', false).map(s => s.label)).toEqual(['Confirmed', 'Write and verify', 'Refresh', 'Summary']);
    });
    it('the bar and the words know the new phases', () => {
        expect(runPercent('off', 0, 3)).toBe(5);
        expect(runPercent('on', 3, 3)).toBe(88);
        expect(headline('off')).toBe('Turning flows off');
        expect(headline('on')).toBe('Turning flows on again');
        expect(statusText('off', 0, 3, 2000)).toBe('Turning the flows off · 2 s');
        expect(statusText('on', 3, 3, 9000)).toBe('Turning the flows on again · 9 s');
    });
});
