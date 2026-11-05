import type { RowOutcome } from '../types';
import { chip } from '../ui/components';

/** The chip of one row of a run: done in green, failed in red, skipped in amber, each with its icon and its word. */
export function outcomeChip(status: RowOutcome['status']): HTMLElement {
    if (status === 'done') return chip('done', 'success', 'check-circle');
    if (status === 'failed') return chip('failed', 'error', 'x-circle');
    return chip('skipped', 'warning', 'alert-triangle');
}
