import type { RowOutcome } from '../types';
import { summarize } from './progress';

/** The file a user can keep after a run. Pure; it is saved where the user chooses and never sent anywhere. */

export interface ReportInput {
    readonly operation: string;
    readonly solution: string;
    readonly environment: string;
    readonly startedAt: number;
    readonly finishedAt: number;
    readonly results: readonly RowOutcome[];
}

export function buildReport(i: ReportInput): string {
    return JSON.stringify(
        {
            tool: 'Connection Reference Governance',
            operation: i.operation,
            solution: i.solution,
            environment: i.environment,
            startedAt: new Date(i.startedAt).toISOString(),
            finishedAt: new Date(i.finishedAt).toISOString(),
            durationMs: Math.max(0, i.finishedAt - i.startedAt),
            summary: summarize(i.results),
            rows: i.results.map(r => ({ id: r.id, name: r.label, outcome: r.status, message: r.message, ...(r.stateChange ? { stateChange: r.stateChange } : {}) })),
            turnedOff: i.results.filter(r => r.stateChange !== undefined).map(r => ({ name: r.label, onAgain: r.stateChange === 'back-on' })),
        },
        null,
        2,
    );
}

export function reportFileName(operation: string, finishedAt: number): string {
    const slug = operation.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const stamp = new Date(finishedAt).toISOString().replace(/[^0-9]/g, '').slice(0, 14);
    return `report-${slug}-${stamp}.json`;
}
