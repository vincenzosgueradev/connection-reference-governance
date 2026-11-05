import { headline, phaseSteps, runPercent, statusText } from '../model/progress';
import type { Wizard } from '../state/reducer';
import type { RowOutcome } from '../types';
import { chip, el, icon, pipeline } from '../ui/components';
import { outcomeChip } from './outcome';
import { spacer, stepButton, stepFrame } from './workflow';

/** Step 4: the timeline of the run with the time elapsed, and the rows as they finish. DOM only. */

/** The top of the panel: the ring, what is happening, the phases of the run in the middle, and the three counters. */
function runHero(w: Wizard, environment: string, phases: HTMLElement): HTMLElement {
    const done = w.live.length;
    const percent = runPercent(w.phase, done, w.total);
    const hero = el('div', 'run-hero');

    const ring = el('div', w.phase === 'done' ? 'run-ring is-done' : 'run-ring is-moving');
    ring.style.setProperty('--p', String(percent));
    ring.setAttribute('role', 'progressbar');
    ring.setAttribute('aria-label', 'Progress of the run');
    ring.setAttribute('aria-valuemin', '0');
    ring.setAttribute('aria-valuemax', '100');
    ring.setAttribute('aria-valuenow', String(percent));
    ring.append(el('span', 'run-percent', `${percent}%`));

    const titles = el('div', 'run-titles');
    const head = el('div', 'run-headline-row');
    if (w.phase !== 'done') {
        const spinner = el('span', 'run-spinner');
        spinner.setAttribute('aria-hidden', 'true');
        head.append(spinner);
    }
    head.append(el('h3', 'run-headline', headline(w.phase)));
    const now = w.phase === 'off' ? 'Turning the flows that are on off, so that they can be changed'
        : w.phase === 'write' ? `Writing and verifying row ${Math.min(done + 1, Math.max(w.total, 1))} of ${w.total}`
            : w.phase === 'on' ? 'Turning the flows on again'
                : w.phase === 'refresh' ? 'All rows are written. Reading the solution again' : 'Finished';
    titles.append(
        head,
        el('p', 'run-now', now),
        el('p', 'run-sub', `${{ connection: 'Writing to', repoint: 'Writing to', remove: 'Removing components in', delete: 'Deleting in' }[w.operation]} ${environment === '' ? 'the connected environment' : environment}. Do not close this tool until it finishes.`),
    );

    const counters = el('div', 'run-counters');
    const count = (status: 'done' | 'failed' | 'skipped', label: string) => {
        const box = el('span', `run-count run-count--${status}`);
        box.append(el('b', '', String(w.live.filter(o => o.status === status).length)), el('span', '', label));
        return box;
    };
    counters.append(count('done', 'written'), count('skipped', 'skipped'), count('failed', 'failed'));

    hero.append(ring, titles, phases, counters);
    return hero;
}

const STATUS_ICON = { done: 'check-circle', failed: 'x-circle', skipped: 'alert-triangle' } as const;

/**
 * Every row of the plan from the start, waiting and greyed; the one being processed turns on a spinner; each one takes
 * the colour of its outcome as soon as it is finished.
 */
function runItems(w: Wizard, rows: readonly { id: string; label: string }[]): HTMLElement {
    const byId = new Map<string, RowOutcome>();
    for (const o of w.live) if (!byId.has(o.id)) byId.set(o.id, o);
    const known = new Set(rows.map(r => r.id));
    const extra = w.live.filter(o => !known.has(o.id)).map(o => ({ id: o.id, label: o.label }));
    const all = [...rows, ...extra];
    const working = w.phase === 'refresh' || w.phase === 'done' ? undefined : all.find(r => !byId.has(r.id))?.id;
    const list = el('ul', 'run-items');
    for (const r of all) {
        const o = byId.get(r.id);
        const state = o ? o.status : r.id === working ? 'working' : 'pending';
        const li = el('li', `run-item run-item--${state}`);
        li.dataset['row'] = r.id;
        const mark = el('span', 'run-item-mark');
        if (state === 'working') mark.append(el('span', 'run-spinner run-spinner--sm'));
        else if (o) mark.append(icon(STATUS_ICON[o.status]));
        else mark.append(icon('minus'));
        const text = el('span', 'run-item-text');
        text.append(el('span', 'run-item-name', r.label), el('span', 'run-item-msg', o ? o.message : state === 'working' ? 'Writing and verifying...' : 'Waiting'));
        li.append(mark, text);
        if (o) li.append(outcomeChip(o.status));
        list.append(li);
    }
    return list;
}

/** One panel: the ring and the counters, the phases of the run, then every row. */
export function applyStep(w: Wizard, environment = '', plannedRows: readonly { id: string; label: string }[] = []): HTMLElement {
    const panel = el('section', 'run-panel');
    const phases = el('div', 'run-phases');
    phases.append(pipeline(phaseSteps(w.phase, false, w.states), statusText(w.phase, w.live.length, w.total, w.now - w.startedAt)));

    const rowsHead = el('div', 'run-rows-head');
    rowsHead.append(icon('list'), el('span', 'run-rows-title', 'Rows'));
    if (w.total > 0) rowsHead.append(chip(`${w.live.length} of ${w.total}`, 'info'));
    const rows = el('div', 'run-rows');
    rows.append(rowsHead, runItems(w, plannedRows));

    panel.append(runHero(w, environment, phases), rows);
    return stepFrame(
        'apply',
        [panel],
        [stepButton('Back', 'secondary', 'arrow-left', () => undefined, { disabled: true, title: 'The write has started: there is no way back.' }), spacer()],
    );
}
