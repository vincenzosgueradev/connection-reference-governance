import type { Plan } from '../types';

/** The values a plan is about to overwrite, so the user can restore them by hand. Pure. */
export function buildBackup(plan: Plan, environment: string, createdAt: string): string {
    return JSON.stringify(
        {
            kind: plan.kind,
            table: plan.entity,
            environment,
            createdAt,
            rows: plan.rows
                .filter(r => r.blocked === undefined)
                .map(r => ({ id: r.id, name: r.label, column: r.field, previousValue: r.expectedCurrent })),
        },
        null,
        2,
    );
}

export function backupFileName(plan: Plan, createdAt: string): string {
    return `backup-${plan.kind}-${createdAt.replace(/[^0-9]/g, '').slice(0, 14)}.json`;
}
