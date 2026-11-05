import { headline, phaseSteps, runPercent, statusText } from '../model/progress';
import type { Wizard } from '../state/reducer';
import { dataTable, detailBlock, el, pipeline, tableWrap } from '../ui/components';
import { outcomeChip } from './outcome';
import { spacer, stepButton, stepFrame } from './workflow';

/** Step 4: the timeline of the run with the time elapsed, and the rows as they finish. DOM only. */

function runHero(w: Wizard, environment: string): HTMLElement {
    const done = w.live.length;
    const percent = runPercent(w.phase, done, w.total);
    const hero = el('section', 'run-hero');
    const top = el('div', 'run-top');
    if (w.phase !== 'done') {
        const spinner = el('span', 'run-spinner');
        spinner.setAttribute('aria-hidden', 'true');
        top.append(spinner);
    }
    const titles = el('div', 'run-titles');
    titles.append(
        el('h3', 'run-headline', headline(w.phase)),
        el('p', 'run-sub', `Writing to ${environment === '' ? 'the connected environment' : environment}. Do not close this tool until it finishes.`),
    );
    top.append(titles, el('span', 'run-percent', `${percent}%`));
    const bar = el('div', 'run-bar');
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-label', 'Progress of the run');
    bar.setAttribute('aria-valuemin', '0');
    bar.setAttribute('aria-valuemax', '100');
    bar.setAttribute('aria-valuenow', String(percent));
    const fill = el('span', w.phase === 'done' ? 'run-fill' : 'run-fill is-moving');
    fill.style.width = `${percent}%`;
    bar.append(fill);
    const meta = el('div', 'run-meta');
    const count = (status: 'done' | 'failed' | 'skipped', label: string) => el('span', `run-count run-count--${status}`, `${w.live.filter(o => o.status === status).length} ${label}`);
    const now = w.phase === 'off' ? 'Turning the flows that are on off, so that they can be changed'
        : w.phase === 'write' ? `Writing and verifying row ${Math.min(done + 1, Math.max(w.total, 1))} of ${w.total}`
            : w.phase === 'on' ? 'Turning the flows on again'
                : w.phase === 'refresh' ? 'All rows are written. Reading the solution again' : 'Finished';
    meta.append(el('span', 'run-now', now), count('done', 'written'), count('skipped', 'skipped'), count('failed', 'failed'));
    hero.append(top, bar, meta);
    return hero;
}

export function applyStep(w: Wizard, environment = ''): HTMLElement {
    const timeline = pipeline(phaseSteps(w.phase, false, w.states), statusText(w.phase, w.live.length, w.total, w.now - w.startedAt));

    const rows = w.live.length === 0
        ? el('p', 'muted live-empty', 'No row has finished yet.')
        : tableWrap(dataTable(['Item', 'Outcome', 'Message'], w.live, o => [el('span', 'cell-strong', o.label), outcomeChip(o.status), o.message]));

    return stepFrame(
        'apply',
        [runHero(w, environment), detailBlock('Progress', undefined, timeline, false, 'refresh'), detailBlock('Rows', w.total === 0 ? undefined : w.live.length, rows, w.live.length === 0, 'list')],
        [stepButton('Back', 'secondary', 'arrow-left', () => undefined, { disabled: true, title: 'The write has started: there is no way back.' }), spacer()],
    );
}
