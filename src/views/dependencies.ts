import { groupDependents, summarize, summaryLine, type DependencyState, type ResolvedDependent } from '../model/dependencies';
import { button, chip, el, icon } from '../ui/components';

/**
 * The dependencies of a reference in the whole environment (feature 023), drawn once and used in the details of a
 * reference, in the Used by of a connection and in Clean up. DOM only; the data is read by the controller, on request.
 */

export interface DependenciesArgs {
    readonly state: DependencyState | undefined;
    /** Said in the intro and the labels: the reference this block is about. */
    readonly subject: string;
    readonly onCheck: () => void;
    /** Used for the buttons' accessible names, so that several blocks on one screen can be told apart. */
    readonly name: string;
}

function note(text: string, tone: 'info' | 'warn' | 'error' = 'info'): HTMLElement {
    const n = el('p', `dep-note${tone === 'warn' ? ' dep-note--warn' : tone === 'error' ? ' dep-note--error' : ''}`);
    n.append(icon(tone === 'warn' ? 'alert-triangle' : tone === 'error' ? 'x-circle' : 'info', 'icon--sm'), el('span', '', text));
    return n;
}

/** The spinner and a line saying what is being read: a wait is never only a dimmed label (T8). */
export function readingLine(text: string): HTMLElement {
    const line = el('p', 'dep-loading');
    line.setAttribute('role', 'status');
    line.setAttribute('aria-live', 'polite');
    const spin = el('span', 'spinner');
    spin.setAttribute('aria-hidden', 'true');
    line.append(spin, el('span', '', text));
    return line;
}

function stateChip(d: ResolvedDependent): HTMLElement | null {
    if (d.state === '') return null;
    return chip(d.state, d.state === 'On' ? 'success' : d.state === 'Suspended' ? 'warning' : 'neutral', d.state === 'Suspended' ? 'pause' : 'power');
}

function row(d: ResolvedDependent): HTMLElement {
    const li = el('li', `dep-row${d.inOpenSolution ? '' : ' is-outside'}`);
    const head = el('div', 'dep-row-head');
    head.append(el('span', 'dep-name', d.name));
    const tags = el('span', 'dep-tags');
    tags.append(chip(d.typeLabel, 'neutral'));
    const s = stateChip(d);
    if (s) tags.append(s);
    if (d.managed) tags.append(chip('Managed', 'neutral', 'lock'));
    tags.append(d.inOpenSolution ? chip('In this solution', 'info', 'folder') : chip('Outside this solution', 'warning', 'alert-triangle'));
    head.append(tags);
    li.append(head);
    const facts: string[] = [];
    if (d.parent !== '') facts.push(`Agent: ${d.parent}`);
    if (d.owner !== '') facts.push(`Owner: ${d.owner}`);
    if (d.solutions.length > 0) facts.push(`In ${d.solutions.length === 1 ? 'solution' : 'solutions'}: ${d.solutions.join(', ')}`);
    if (facts.length > 0) li.append(el('div', 'dep-facts', facts.join('  -  ')));
    return li;
}

/** The block: a button to read, a wait, an error with a retry, or the dependents grouped by kind. */
export function dependenciesBlock(a: DependenciesArgs): HTMLElement {
    const root = el('div', 'dep-block');
    const s = a.state;
    if (s === undefined) {
        const intro = el('div', 'dep-intro');
        intro.append(icon('layers', 'icon--sm icon--primary'), el('span', '', `What uses ${a.subject} in the whole environment, also outside this solution: flows of other solutions, agents, apps.`));
        const go = button('Check dependencies', 'primary', a.onCheck, true);
        go.prepend(icon('search', 'icon--sm'));
        go.setAttribute('aria-label', `Check dependencies of ${a.name}`);
        root.append(intro, go);
        return root;
    }
    if (s.status === 'loading') {
        root.append(readingLine('Reading what depends on it in the whole environment...'));
        return root;
    }
    if (s.status === 'failed') {
        root.append(note(`The dependencies could not be read: ${s.error}`, 'error'));
        const again = button('Try again', 'secondary', a.onCheck, true);
        again.setAttribute('aria-label', `Try again to check the dependencies of ${a.name}`);
        root.append(again);
        return root;
    }
    const sum = summarize(s.report);
    const top = el('div', 'dep-summary');
    top.append(icon(sum.total === 0 ? 'check-circle' : sum.outside > 0 ? 'alert-triangle' : 'info', `icon--sm ${sum.total === 0 ? 'icon--success' : sum.outside > 0 ? 'icon--warning' : 'icon--primary'}`), el('span', 'dep-summary-text', summaryLine(sum)));
    root.append(top);
    for (const g of groupDependents(s.report)) {
        const group = el('section', 'dep-group');
        const title = el('h5', 'dep-group-title');
        title.append(icon(g.icon, 'icon--sm icon--muted'), `${g.label} `, el('span', 'dep-count', String(g.items.length)));
        const list = el('ul', 'dep-list');
        for (const d of g.items) list.append(row(d));
        group.append(title, list);
        root.append(group);
    }
    for (const n of s.report.notes) root.append(note(n, 'warn'));
    const foot = el('div', 'dep-foot');
    foot.append(el('span', 'dep-source', 'From Dataverse dependency tracking, the source of Show dependencies in the maker portal. A component whose dependency is not tracked is not listed.'));
    const again = button('Check again', 'secondary', a.onCheck, true);
    again.prepend(icon('refresh', 'icon--sm'));
    again.setAttribute('aria-label', `Check the dependencies of ${a.name} again`);
    foot.append(again);
    root.append(foot);
    return root;
}

/** A short verdict for a row of a list: the spinner while reading, then "Nothing depends on it" or how many outside. Null before a check. */
export function dependencyChip(state: DependencyState | undefined): HTMLElement | null {
    if (state === undefined) return null;
    if (state.status === 'loading') {
        const c = chip('Checking...', 'neutral');
        const spin = el('span', 'spinner');
        spin.setAttribute('aria-hidden', 'true');
        c.prepend(spin);
        return c;
    }
    if (state.status === 'failed') return chip('Could not check', 'error', 'x-circle');
    const sum = summarize(state.report);
    if (sum.total === 0) return chip('Nothing depends on it', 'success', 'check-circle');
    if (sum.outside > 0) return chip(`Used by ${sum.outside} outside this solution`, 'warning', 'alert-triangle');
    return chip(`Used by ${sum.total} in this solution`, 'info', 'info');
}
