import { lineDiff, type FileDiff } from '../model/diff';
import { planItems, type PlanItem } from '../model/planDiff';
import { blockReasons, writableRows } from '../model/plans';
import { PAGE_ITEMS, type DiffLayout, type ItemMode, type Wizard } from '../state/reducer';
import type { Plan, Snapshot } from '../types';
import { button, callout, chip, dataTable, diffFile, diffView, el, factStrip, icon, itemCard, segmented, tableWrap } from '../ui/components';
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
    setMode(id: string, mode: ItemMode): void;
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

/** A JSON string shown without its quotes (the value is what matters; the quotes only add noise). */
const unquote = (v: string): string => (v.length >= 2 && v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1) : v);

function itemBody(plan: Plan, item: PlanItem, mode: ItemMode, layout: DiffLayout, d: FileDiff | null): Node {
    if (item.blocked !== undefined) return callout('warning', 'Not written', [item.blocked]);
    if (mode === 'table') {
        const table = dataTable(['What', 'Before', 'After', 'State'], item.fields, f => {
            const what = el('span', 'what');
            const known = /^properties\.connectionReferences\.([^.]+)\.connection\.connectionReferenceLogicalName$/.exec(f.what);
            what.append(el('span', 'what-title', known ? `Connection reference ${known[1]}` : f.what), ...(known ? [el('span', 'what-path', f.what)] : []));
            return [what, el('span', 'mono value', unquote(f.before)), el('span', 'mono value', unquote(f.after)), chip('Changed', 'success', 'check')];
        });
        table.classList.add('fields-table');
        return tableWrap(table);
    }
    if (!d || !d.changed) return el('p', 'muted', 'No difference.');
    return diffFile(plan.kind === 'connection' ? 'connectionreference' : 'clientdata (formatted)', d.added, d.removed, diffView(d.rows, layout), d.tooLarge ? 'This definition is too large to compare line by line: the changed part is shown as replaced.' : undefined);
}

export function previewStep(a: PreviewArgs, h: PreviewHandlers): HTMLElement {
    const { plan, snapshot, wizard } = a;
    const hit = cached(plan, snapshot);
    const items = hit.items;
    const writable = writableRows(plan).length;
    const changes = items.reduce((n, i) => n + i.fields.length, 0);
    const shown = items.slice(0, wizard.shown);

    const strip = factStrip([
        { label: 'Items', value: String(writable), sub: items.length > writable ? `of ${items.length}` : undefined },
        { label: 'Changes', value: String(changes) },
        { label: 'Not changed', value: String(items.length - writable), tone: items.length > writable ? 'warning' : undefined },
    ]);

    const bar = el('div', 'layout-bar');
    bar.append(el('span', 'layout-bar-label', 'Layout'), segmented([{ key: 'split', label: 'Split' }, { key: 'unified', label: 'Unified' }], wizard.layout, k => h.setLayout(k as DiffLayout)));

    const cards = el('div', 'item-list');
    for (const item of shown) {
        const open = !wizard.collapsed.includes(item.id);
        const mode = wizard.modes[item.id] ?? 'diff';
        const n = item.fields.length;
        const controls = item.blocked !== undefined ? undefined : segmented([{ key: 'diff', label: 'Diff' }, { key: 'table', label: 'Table' }], mode, k => h.setMode(item.id, k as ItemMode));
        // the diff of a card that is closed is not computed
        const d = open && item.blocked === undefined && mode === 'diff' ? diffOf(hit, item) : null;
        cards.append(itemCard({
            title: item.title,
            sub: item.sub,
            countText: item.blocked !== undefined ? 'Blocked' : `${n} change${n === 1 ? '' : 's'}`,
            open,
            onToggle: () => h.toggle(item.id),
            controls,
            body: open ? itemBody(plan, item, mode, wizard.layout, d) : document.createDocumentFragment(),
            blocked: item.blocked !== undefined,
        }));
    }
    const body: Node[] = [];
    if (writable === 0 && plan.rows.length > 0) {
        const noun = plan.kind === 'connection' ? 'row' : 'flow';
        const reasons = blockReasons(plan);
        const lines = reasons.map(r => `${r.count} ${noun}${r.count === 1 ? '' : 's'}: ${r.reason}`);
        if (reasons.some(r => r.reason.includes('turned on'))) lines.push('Go back and allow the tool to turn the flows off for the change, or turn them off yourself, then choose again.');
        const none = callout('error', 'No row can be written', lines);
        none.classList.add('nothing-written');
        body.push(none);
    }
    body.push(strip, bar, cards);
    if (items.length > shown.length) {
        const more = button(`Show ${Math.min(PAGE_ITEMS, items.length - shown.length)} more (${items.length - shown.length} left)`, 'secondary', h.more);
        more.prepend(icon('plus'));
        body.push(more);
    }

    return stepFrame('preview', body, [
        stepButton('Back', 'secondary', 'arrow-left', h.back, { title: 'Back to the choices: nothing is written' }),
        spacer(),
        stepButton('Apply...', 'danger', 'check', h.apply, { disabled: writable === 0, title: writable === 0 ? 'No row can be written' : 'Opens the confirmation: nothing is written yet' }),
    ]);
}
