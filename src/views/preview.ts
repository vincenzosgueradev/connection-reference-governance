import { lineDiff, type FileDiff } from '../model/diff';
import { planItems, type PlanItem } from '../model/planDiff';
import { blockReasons, unlockableRows, writableRows } from '../model/plans';
import { PAGE_ITEMS, type DiffLayout, type PreviewTab, type Wizard } from '../state/reducer';
import type { Plan, Snapshot } from '../types';
import { button, callout, changeList, diffFile, diffView, el, icon, itemCard, segmented } from '../ui/components';
import { rowsOf } from './confirm';
import { spacer, stepButton, stepFrame } from './workflow';

/** Step 3: exactly what will be stored, item by item, as a diff or as a table of fields. DOM only. */

export interface PreviewArgs {
    plan: Plan;
    snapshot: Snapshot;
    wizard: Wizard;
}

export interface PreviewHandlers {
    back(): void;
    apply(): void;
    setLayout(layout: DiffLayout): void;
    setTab(tab: PreviewTab): void;
    toggle(id: string): void;
    more(): void;
}

// The view is rebuilt on every change: the documents and the diffs of one plan are computed once.
const cache = new WeakMap<Plan, { items: PlanItem[]; diffs: Map<string, FileDiff> }>();

function cached(plan: Plan, snapshot: Snapshot) {
    let hit = cache.get(plan);
    if (!hit) {
        hit = { items: planItems(plan, snapshot), diffs: new Map() };
        cache.set(plan, hit);
    }
    return hit;
}

function diffOf(hit: { diffs: Map<string, FileDiff> }, item: PlanItem): FileDiff {
    let d = hit.diffs.get(item.id);
    if (!d) {
        d = lineDiff(item.before, item.after);
        hit.diffs.set(item.id, d);
    }
    return d;
}

function itemBody(plan: Plan, item: PlanItem, layout: DiffLayout, d: FileDiff | null): Node {
    if (item.blocked !== undefined) return callout('warning', 'Not written', [item.blocked]);
    if (!d || !d.changed) return el('p', 'muted', 'No difference.');
    return diffFile(plan.kind === 'connection' ? 'connectionreference' : plan.kind === 'remove' ? 'solution membership' : plan.kind === 'delete' ? 'row' : 'clientdata (formatted)', d.added, d.removed, diffView(d.rows, layout), d.tooLarge ? 'This definition is too large to compare line by line: the changed part is shown as replaced.' : undefined);
}

export function previewStep(a: PreviewArgs, h: PreviewHandlers): HTMLElement {
    const { plan, snapshot, wizard } = a;
    const hit = cached(plan, snapshot);
    const items = hit.items;
    const writable = writableRows(plan).length;
    const changes = items.reduce((n, i) => n + i.fields.length, 0);
    const shown = items.slice(0, wizard.shown);

    // one muted line, not a banner: what the plan holds
    const summary = el('span', 'preview-summary', [
        `${writable === items.length ? items.length : `${writable} of ${items.length}`} item${items.length === 1 ? '' : 's'}`,
        `${changes} change${changes === 1 ? '' : 's'}`,
        ...(items.length > writable ? [`${items.length - writable} not changed`] : []),
    ].join(' · '));

    const bar = el('div', 'layout-bar');
    bar.append(el('span', 'layout-bar-label', 'Layout'), segmented([{ key: 'split', label: 'Split' }, { key: 'unified', label: 'Unified' }], wizard.layout, k => h.setLayout(k as DiffLayout)));

    const cards = el('div', 'item-list');
    for (const item of shown) {
        const open = !wizard.collapsed.includes(item.id);
        const n = item.fields.length;
        // the diff of a card that is closed is not computed
        const d = open && item.blocked === undefined ? diffOf(hit, item) : null;
        cards.append(itemCard({
            title: item.title,
            sub: item.sub,
            countText: item.blocked !== undefined ? 'Blocked' : `${n} change${n === 1 ? '' : 's'}`,
            open,
            onToggle: () => h.toggle(item.id),
            body: open ? itemBody(plan, item, wizard.layout, d) : document.createDocumentFragment(),
            blocked: item.blocked !== undefined,
        }));
    }
    const body: Node[] = [];
    if (writable === 0 && plan.rows.length > 0) {
        const noun = plan.kind === 'repoint' ? 'flow' : plan.kind === 'connection' ? 'row' : 'item';
        const reasons = blockReasons(plan);
        const lines = reasons.map(r => `${r.count} ${noun}${r.count === 1 ? '' : 's'}: ${r.reason}`);
        if (reasons.some(r => r.reason.includes('turned on'))) lines.push('Apply... lets you allow the tool to turn the flows off for the change; or turn them off yourself and choose again.');
        const none = callout('error', 'No row can be written', lines);
        none.classList.add('nothing-written');
        body.push(none);
    }
    // one line: the tabs on the left, the layout of the diff on the right
    const tabs = el('div', 'preview-tabs');
    tabs.append(segmented([{ key: 'diff', label: 'Code diff', icon: 'code' }, { key: 'table', label: 'Table', icon: 'list' }], wizard.tab, k => h.setTab(k as PreviewTab)), summary);
    if (wizard.tab === 'diff') tabs.append(bar);
    body.push(tabs);
    if (wizard.tab === 'table') {
        body.push(changeList(rowsOf(plan, snapshot)));
    } else {
        body.push(cards);
    }
    if (wizard.tab === 'diff' && items.length > shown.length) {
        const more = button(`Show ${Math.min(PAGE_ITEMS, items.length - shown.length)} more (${items.length - shown.length} left)`, 'secondary', h.more);
        more.prepend(icon('plus'));
        body.push(more);
    }

    return stepFrame('preview', body, [
        stepButton('Back', 'secondary', 'arrow-left', h.back, { title: 'Back to the choices: nothing is written' }),
        spacer(),
        stepButton('Apply...', plan.kind === 'delete' ? 'danger' : 'primary', 'check', h.apply, { disabled: writable === 0 && unlockableRows(plan).length === 0, title: writable === 0 && unlockableRows(plan).length === 0 ? 'No row can be written' : 'Opens the confirmation: nothing is written yet' }),
    ]);
}
