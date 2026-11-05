import { attentionFirst, banner, formatElapsed, summarize } from '../model/progress';
import { operationLabel } from '../model/workflow';
import type { Wizard } from '../state/reducer';
import type { RowOutcome } from '../types';
import { callout, dataTable, detailBlock, el, factStrip, figures, tableWrap } from '../ui/components';
import { outcomeChip } from './outcome';
import { spacer, stepButton, stepFrame } from './workflow';

/** Step 5: what happened, in a banner, figures and one line per row; a report can be saved. DOM only. */

export interface ResultArgs {
    wizard: Wizard;
    results: readonly RowOutcome[];
    solutionName: string;
    environment: string;
}

export interface ResultHandlers {
    saveReport(): void;
    back(): void;
}

export function resultStep(a: ResultArgs, h: ResultHandlers): HTMLElement {
    const w = a.wizard;
    const sum = summarize(a.results);
    const b = banner(sum, w.refreshFailed);
    const duration = Math.max(0, (w.finishedAt ?? w.now) - w.startedAt);

    const figs = figures([
        { label: 'Changed', value: String(sum.changed), icon: 'check-circle', tone: 'success' },
        { label: 'Skipped', value: String(sum.skipped), icon: 'alert-triangle', tone: sum.skipped > 0 ? 'warning' : 'success' },
        { label: 'Failed', value: String(sum.failed), icon: 'x-circle', tone: sum.failed > 0 ? 'error' : 'success' },
        { label: 'Duration', value: formatElapsed(duration), icon: 'clock', tone: 'info' },
    ]);

    const strip = factStrip([
        { label: 'Operation', value: operationLabel(w.operation) },
        { label: 'Solution', value: a.solutionName },
        { label: 'Environment', value: a.environment || 'Connected environment' },
    ]);

    const table = dataTable(['Item', 'Outcome', 'Message'], attentionFirst(a.results), o => [el('span', 'cell-strong', o.label), outcomeChip(o.status), o.stateChange === 'back-on' ? `${o.message} The flow was turned off for the write and is on again.` : o.message]);
    const left = a.results.filter(r => r.stateChange === 'left-off');
    const leftOff = left.length === 0 ? null : callout('error', `${left.length} flow${left.length === 1 ? ' was' : 's were'} left turned off`, [
        `${left.map(r => r.label).join(', ')}: turn ${left.length === 1 ? 'it' : 'them'} on in the maker portal (Power Automate), then check the connections the message names.`,
    ], 'power');
    leftOff?.classList.add('left-off');

    const bar = callout(b.tone, b.title, b.lines);
    bar.classList.add('callout--compact');

    return stepFrame(
        'result',
        [...(leftOff ? [leftOff] : []), bar, figs, strip, detailBlock('Rows', sum.total, tableWrap(table), false, 'list')],
        [
            stepButton('Save report', 'secondary', 'save', h.saveReport, { title: 'A file with the outcome of every row' }),
            spacer(),
            stepButton('Back to solution', 'primary', 'arrow-left', h.back),
        ],
    );
}
