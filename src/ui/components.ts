/**
 * Shared DOM helpers for the UI kit. SOURCE: templates/tool-template/src/ui in the parent folder; do not edit
 * this copy inside a tool (see scripts/sync-template.ps1). They build the classes of ui.css and nothing else,
 * so every tool renders the same buttons, chips, panels, tables and breadcrumbs.
 * No decisions here: DOM only (architecture, views layer).
 */

export type ButtonKind = 'primary' | 'secondary' | 'danger';
export type ChipKind = 'neutral' | 'success' | 'warning' | 'error' | 'info';

export function el<K extends keyof HTMLElementTagNameMap>(
    tag: K, className = '', text?: string,
): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

/** `<span class="icon icon-NAME">`; the shape is a CSS mask defined in ui.css (add the rule when adding a name). */
export function icon(name: string, extra = ''): HTMLElement {
    const node = el('span', `icon icon-${name}${extra ? ` ${extra}` : ''}`);
    node.setAttribute('aria-hidden', 'true');
    return node;
}

export function button(label: string, kind: ButtonKind = 'secondary', onClick?: () => void, small = false): HTMLButtonElement {
    const node = el('button', `btn btn--${kind}${small ? ' btn--sm' : ''}`, label);
    node.type = 'button';
    if (onClick) node.addEventListener('click', onClick);
    return node;
}

export function chip(label: string, kind: ChipKind = 'neutral', iconName?: string): HTMLElement {
    const node = el('span', kind === 'neutral' ? 'chip' : `chip chip--${kind}`);
    if (iconName) node.append(icon(iconName));
    node.append(label);
    return node;
}

/** Round check used instead of a browser checkbox (constitution VII). */
export function check(checked: boolean, label: string, onChange: () => void): HTMLButtonElement {
    const node = el('button', checked ? 'check is-on' : 'check');
    node.type = 'button';
    node.setAttribute('role', 'checkbox');
    node.setAttribute('aria-checked', String(checked));
    node.setAttribute('aria-label', label);
    node.addEventListener('click', onChange);
    return node;
}

/** A panel with a heading and an optional right-hand note; returns the body to fill. */
export function panel(heading: string, note?: string): { root: HTMLElement; body: HTMLElement } {
    const root = el('section', 'panel');
    const head = el('div', 'panel-head');
    head.append(el('h2', 'panel-heading', heading));
    if (note) head.append(el('span', 'panel-sub', note));
    const body = el('div', 'panel-body');
    root.append(head, body);
    return { root, body };
}

export interface Crumb { label: string; onClick?: () => void }

/** The last crumb is the current place; earlier ones are links that go back keeping the parent context. */
export function breadcrumb(crumbs: Crumb[]): HTMLElement {
    const nav = el('nav', 'breadcrumb');
    nav.setAttribute('aria-label', 'Breadcrumb');
    crumbs.forEach((c, i) => {
        const last = i === crumbs.length - 1;
        if (i > 0) nav.append(el('span', 'crumb-sep', '/'));
        if (last || !c.onClick) {
            const current = el('span', 'crumb crumb--current', c.label);
            current.title = c.label;
            nav.append(current);
        } else {
            const link = el('button', 'crumb crumb--link', c.label);
            link.type = 'button';
            link.title = c.label;
            link.addEventListener('click', c.onClick);
            nav.append(link);
        }
    });
    return nav;
}

/** A table cell: text (truncated with the full value in `title`) or a node built by the caller (chips, lines). */
export type Cell = string | Node;

export interface DataTableOptions<T> {
    /** Makes each row open something: click and Enter, focusable, styled as a link row. */
    onOpen?: (row: T) => void;
    /** Sortable columns by index; the arrow keeps a reserved width so the header never moves when the order changes. */
    sort?: { columns: readonly number[]; active: number; desc: boolean; onSort: (column: number) => void };
    /** Column indices whose cells are centred numbers. */
    numeric?: readonly number[];
}

function fillCell(td: HTMLElement, value: Cell): void {
    if (typeof value === 'string') {
        td.textContent = value;
        td.title = value;
    } else {
        td.append(value);
        if (value.textContent) td.title = value.textContent;
    }
}

/** A dense table: header cells from `columns`, one row per item. Long text truncates with the full text in `title`. */
export function dataTable<T>(columns: string[], rows: readonly T[], cells: (row: T) => Cell[], options: DataTableOptions<T> = {}): HTMLTableElement {
    const table = el('table', 'data-table');
    const head = el('thead');
    const headRow = el('tr');
    columns.forEach((c, i) => {
        const th = el('th');
        const sort = options.sort;
        if (options.numeric?.includes(i)) th.classList.add('col-num');
        if (sort && sort.columns.includes(i)) {
            const on = sort.active === i;
            th.classList.add('sortable');
            if (on) th.classList.add('sorted');
            th.setAttribute('aria-sort', on ? (sort.desc ? 'descending' : 'ascending') : 'none');
            th.tabIndex = 0;
            const label = el('span', 'th-label');
            const arrow = el('span', on && !sort.desc ? 'sort-arrow sort-arrow--asc' : 'sort-arrow');
            if (on) arrow.append(icon('chevron-down'));
            label.append(c, arrow);
            th.append(label);
            th.addEventListener('click', () => sort.onSort(i));
            th.addEventListener('keydown', e => { if (e.key === 'Enter') sort.onSort(i); });
        } else {
            th.textContent = c;
        }
        headRow.append(th);
    });
    head.append(headRow);
    const body = el('tbody');
    rows.forEach(r => {
        const tr = el('tr');
        cells(r).forEach((value, i) => {
            const td = el('td');
            if (options.numeric?.includes(i)) td.classList.add('col-num');
            fillCell(td, value);
            tr.append(td);
        });
        const open = options.onOpen;
        if (open) {
            tr.classList.add('row-link');
            tr.tabIndex = 0;
            tr.setAttribute('role', 'link');
            tr.addEventListener('click', () => open(r));
            tr.addEventListener('keydown', e => { if (e.key === 'Enter') open(r); });
        }
        body.append(tr);
    });
    table.append(head, body);
    return table;
}

/** Wraps a table so it scrolls inside its panel with the header kept in view. */
export function tableWrap(table: HTMLElement): HTMLElement {
    const wrap = el('div', 'table-wrap');
    wrap.append(table);
    return wrap;
}

/** Several short lines in one cell (for example the references of a flow); each keeps its full text in `title`. */
export function lines(texts: readonly string[], className = ''): HTMLElement {
    const box = el('div', 'cell-multi');
    for (const t of texts) {
        const line = el('div', className, t);
        line.title = t;
        box.append(line);
    }
    return box;
}

/** Search field with the glyph on the left and a clear button; the wrapper is what callers place. */
export function searchBox(value: string, placeholder: string, onInput: (v: string) => void): HTMLElement {
    const box = el('div', 'search-box');
    const input = el('input');
    input.type = 'text';
    input.autocomplete = 'off';
    input.placeholder = placeholder;
    input.value = value;
    input.setAttribute('aria-label', placeholder);
    input.addEventListener('input', () => onInput(input.value));
    const clear = el('button', 'search-clear');
    clear.type = 'button';
    clear.title = 'Clear search';
    clear.hidden = value === '';
    clear.append(icon('close', 'icon--xs'));
    clear.addEventListener('click', () => onInput(''));
    box.append(icon('search', 'icon--sm search-icon'), input, clear);
    return box;
}

export interface SegmentItem {
    key: string;
    label: string;
    count?: number;
    /** Name of a kit icon shown before the label. */
    icon?: string;
    /** A segment that exists but cannot be used (say why in `title`). */
    disabled?: boolean;
    title?: string;
}

/** A segmented control (tabs that filter one list): optional icon, label and a counted pill. */
export function segmented(items: readonly SegmentItem[], active: string, onPick: (key: string) => void): HTMLElement {
    const box = el('div', 'segmented');
    box.setAttribute('role', 'group');
    for (const it of items) {
        const b = el('button', it.key === active ? 'segment is-active' : 'segment');
        b.type = 'button';
        b.setAttribute('aria-pressed', String(it.key === active));
        if (it.icon) b.append(icon(it.icon, 'icon--sm'));
        b.append(it.label);
        if (it.count !== undefined) b.append(' ', el('span', 'segment-count', String(it.count)));
        if (it.disabled) b.disabled = true;
        if (it.title) b.title = it.title;
        b.addEventListener('click', () => onPick(it.key));
        box.append(b);
    }
    return box;
}

/** An empty or error state that says why (name the active filter or search term in `why`). */
export function emptyState(why: string, iconName?: string): HTMLElement {
    const box = el('div', 'empty-state');
    if (iconName) box.append(icon(iconName));
    box.append(why);
    return box;
}

/** Styled switch used instead of a browser checkbox for on/off settings (constitution VII). */
export function toggle(on: boolean, label: string, onChange: () => void): HTMLButtonElement {
    const node = el('button', on ? 'toggle is-on' : 'toggle');
    node.type = 'button';
    node.setAttribute('role', 'switch');
    node.setAttribute('aria-checked', String(on));
    node.setAttribute('aria-label', label);
    node.addEventListener('click', onChange);
    return node;
}

export interface ConfirmOptions {
    title: string;
    /** What will happen, in plain words (for a write: how many rows, which field). */
    message: string;
    confirmLabel: string;
    danger?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

let dialogSeq = 0;

/**
 * Inline confirmation block (not a browser dialog): used to confirm a plan before apply (constitution V).
 * Escape cancels. For a danger action the focus starts on Cancel, so Enter never confirms by accident.
 * The caller places it in the page and removes it on either callback.
 */
export function confirmDialog(o: ConfirmOptions): HTMLElement {
    const id = `dialog-${++dialogSeq}`;
    const root = el('section', o.danger ? 'dialog dialog--danger' : 'dialog');
    root.setAttribute('role', 'alertdialog');
    root.setAttribute('aria-labelledby', `${id}-title`);
    root.setAttribute('aria-describedby', `${id}-text`);
    const title = el('h3', 'dialog-title', o.title);
    title.id = `${id}-title`;
    const text = el('p', '', o.message);
    text.id = `${id}-text`;
    const cancel = button('Cancel', 'secondary', o.onCancel);
    const confirm = button(o.confirmLabel, o.danger ? 'danger' : 'primary', o.onConfirm);
    root.append(title, text, el('div', 'dialog-actions'));
    root.lastElementChild!.append(cancel, confirm);
    root.addEventListener('keydown', e => { if (e.key === 'Escape') o.onCancel(); });
    queueMicrotask(() => (o.danger ? cancel : confirm).focus());
    return root;
}

export interface SelectableTableOptions<T> {
    columns: string[];
    rows: readonly T[];
    id: (row: T) => string;
    /** Accessible name of the row's check, for example the flow name. */
    label: (row: T) => string;
    cells: (row: T) => Cell[];
    selected: readonly string[];
    /** Rows that cannot be selected (for example a managed solution): shown muted, no check. */
    isBlocked?: (row: T) => boolean;
    onToggle: (id: string) => void;
    /** Called with the ids of the selectable rows shown; the caller decides select-all or clear. */
    onToggleAll: (ids: string[], allSelected: boolean) => void;
    /** Rows open to show their details: a click on the row or its chevron. Needs `onExpand`. */
    detail?: (row: T) => Node;
    expanded?: readonly string[];
    onExpand?: (id: string) => void;
}

/**
 * A dense table whose first column is a round check, with a select-all check in the header. With `detail` every row
 * also has a chevron and opens a full-width details row under it.
 */
export function selectableTable<T>(o: SelectableTableOptions<T>): HTMLTableElement {
    const expandable = o.detail !== undefined && o.onExpand !== undefined;
    const lead = expandable ? ['', ''] : [''];
    const table = dataTable([...lead, ...o.columns], o.rows, r => [...lead, ...o.cells(r)]);
    const ids = o.rows.filter(r => !o.isBlocked?.(r)).map(o.id);
    const allSelected = ids.length > 0 && ids.every(id => o.selected.includes(id));
    const headCells = table.querySelectorAll('th');
    headCells[0]!.className = 'col-check';
    headCells[0]!.append(check(allSelected, 'Select all shown', () => o.onToggleAll(ids, allSelected)));
    if (expandable) headCells[1]!.className = 'col-expand';
    const total = lead.length + o.columns.length;
    const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>(':scope > tbody > tr'));
    rows.forEach((tr, i) => {
        const row = o.rows[i]!;
        const first = tr.children[0] as HTMLElement;
        first.className = 'col-check';
        first.removeAttribute('title');
        const id = o.id(row);
        if (!o.isBlocked?.(row)) {
            const on = o.selected.includes(id);
            if (on) tr.classList.add('is-selected');
            first.append(check(on, `Select ${o.label(row)}`, () => o.onToggle(id)));
        } else {
            tr.classList.add('is-blocked');
        }
        if (!expandable) return;
        const open = o.expanded?.includes(id) ?? false;
        const second = tr.children[1] as HTMLElement;
        second.className = 'col-expand';
        second.removeAttribute('title');
        const chevron = el('button', 'icon-btn expand-btn');
        chevron.type = 'button';
        chevron.setAttribute('aria-expanded', String(open));
        chevron.setAttribute('aria-label', `${open ? 'Hide' : 'Show'} details of ${o.label(row)}`);
        chevron.append(icon('chevron-down'));
        second.append(chevron);
        tr.classList.add('is-expandable');
        tr.addEventListener('click', e => {
            if ((e.target as HTMLElement).closest('.check')) return;
            o.onExpand!(id);
        });
        if (open) {
            tr.classList.add('is-open');
            const detailRow = el('tr', 'detail-row');
            const cell = el('td');
            cell.colSpan = total;
            cell.append(o.detail!(row));
            detailRow.append(cell);
            tr.after(detailRow);
        }
    });
    return table;
}

/** The line above a table that says how many rows are selected and what that affects. */
export function selectionBar(text: string): HTMLElement {
    const bar = el('div', 'toolbar');
    bar.append(el('span', 'count', text));
    return bar;
}

/** A labelled control: the label above, the control below, both in a fixed-width column (constitution VII). */
export function field(label: string, control: HTMLElement): HTMLElement {
    const box = el('label', 'field');
    box.append(el('span', 'field-label', label), control);
    return box;
}

/**
 * The block for a bulk action: a framed section with a title, a count whose width never changes (`countText` may
 * change, the box does not), a one-line hint, and a row for the fields and the button.
 */
export function actionBox(title: string, hint: string, countText: string, iconName?: string): { root: HTMLElement; fields: HTMLElement; count: HTMLElement } {
    const root = el('section', 'action-box');
    const head = el('div', 'action-head');
    const count = el('span', 'action-count', countText);
    count.setAttribute('aria-live', 'polite');
    const heading = el('h3', 'action-title');
    if (iconName) heading.append(icon(iconName));
    heading.append(title);
    head.append(heading, count);
    const fields = el('div', 'action-fields');
    root.append(head, el('p', 'action-hint', hint), fields);
    return { root, fields, count };
}

/** A status text with a spinner and a reserved width: hidden when idle, never added or removed, so nothing moves. */
export function statusSlot(text: string, visible: boolean): HTMLElement {
    const slot = el('span', visible ? 'status-slot' : 'status-slot is-idle');
    slot.setAttribute('role', 'status');
    slot.append(el('span', 'spinner'), text);
    return slot;
}

/** A pill with a count (a number is centred in its column). */
export function countPill(n: number): HTMLElement {
    return el('span', n === 0 ? 'count-pill count-pill--zero' : 'count-pill', String(n));
}

/** A big number with a gradient tile and a small caption, for the hero of a home screen. */
export function statTile(label: string, value: string, iconName: string, alt = false): HTMLElement {
    const tile = el('div', 'stat stat--icon');
    const badge = el('span', alt ? 'stat-badge stat-badge--alt' : 'stat-badge');
    badge.append(icon(iconName));
    const text = el('div', 'stat-text');
    text.append(el('dt', '', label), el('dd', '', value));
    tile.append(badge, text);
    return tile;
}

/** The banner at the top of a home screen: title, one line of text and the stat tiles. */
export function hero(title: string, subtitle: string, stats: HTMLElement[]): HTMLElement {
    const root = el('section', 'hero');
    const text = el('div', 'hero-text');
    text.append(el('h2', 'hero-title', title), el('p', 'hero-subtitle', subtitle));
    const list = el('dl', 'hero-stats');
    list.append(...stats);
    root.append(text, list);
    return root;
}

export type ConnectionStatus = 'connected' | 'loading' | 'error';

/** The pill in the header that names the connected environment; `setConnectionBadge` updates it. */
export function connectionBadge(name: string, status: ConnectionStatus): HTMLElement {
    const badge = el('div', `connection-badge connection-badge--${status}`);
    badge.append(el('span', 'connection-dot'), el('span', 'connection-name', name));
    return badge;
}

export function setConnectionBadge(badge: HTMLElement, name: string, status: ConnectionStatus): void {
    badge.className = `connection-badge connection-badge--${status}`;
    const label = badge.querySelector('.connection-name');
    if (label) label.textContent = name;
}

export interface KeyValue {
    label: string;
    value: string | Node;
    /** Name of a kit icon shown before the label. */
    icon?: string;
    /** Monospace, for ids. */
    mono?: boolean;
    /** Takes the whole row (long text). */
    wide?: boolean;
}

/** Key-value pairs in a responsive grid: the key small above, the value in full below (it wraps, never truncates). */
export function keyValues(items: readonly KeyValue[]): HTMLElement {
    const list = el('dl', 'kv');
    for (const it of items) {
        const item = el('div', `kv-item${it.mono ? ' kv-item--mono' : ''}${it.wide ? ' kv-item--wide' : ''}`);
        const dd = el('dd');
        dd.append(it.value === '' ? '-' : it.value);
        const dt = el('dt');
        if (it.icon) dt.append(icon(it.icon));
        dt.append(it.label);
        item.append(dt, dd);
        list.append(item);
    }
    return list;
}

/** A framed block with a small title and an optional count, for one part of a record's details. */
export function detailBlock(title: string, count: number | undefined, body: Node, padded = false, iconName?: string): HTMLElement {
    const block = el('section', 'detail-block');
    const head = el('div', 'detail-head');
    const heading = el('h4', 'detail-title');
    if (iconName) heading.append(icon(iconName));
    heading.append(title);
    head.append(heading);
    if (count !== undefined) head.append(chip(String(count)));
    const inner = padded ? el('div', 'detail-body') : block;
    if (padded) { inner.append(body); block.append(head, inner); } else { block.append(head, body); }
    return block;
}


export type Tone = 'primary' | 'success' | 'warning' | 'error' | 'info';

export interface FigureOptions { label: string; value: string; icon: string; tone: Tone }

/** A big number with a gradient badge: how many of something, at a glance. */
export function figure(o: FigureOptions): HTMLElement {
    const box = el('div', `fig fig--${o.tone}`);
    const badge = el('span', 'fig-badge');
    badge.append(icon(o.icon));
    const text = el('div');
    text.append(el('div', 'fig-value', o.value), el('div', 'fig-label', o.label));
    box.append(badge, text);
    return box;
}

export function figures(list: readonly FigureOptions[]): HTMLElement {
    const row = el('div', 'fig-row');
    row.append(...list.map(figure));
    return row;
}

/** A small title for a section of a dialog, with an icon. */
export function sectionTitle(text: string, iconName: string): HTMLElement {
    const t = el('h4', 'section-title');
    t.append(icon(iconName), text);
    return t;
}

export interface ChangeRow {
    name: string;
    /** A second, smaller line under the name. */
    sub?: string;
    /** What it is now and what it will be: text or nodes (chips, tiles). */
    from: Node | string;
    to: Node | string;
    /** When set the row will not change: this is why. */
    blocked?: string;
}

/** One line per item: name, what it is now, an arrow, what it will be. A blocked row says why and is not counted. */
export function changeList(rows: readonly ChangeRow[]): HTMLElement {
    const list = el('div', 'change-list');
    for (const r of rows) {
        const row = el('div', r.blocked ? 'change-row change-row--blocked' : 'change-row');
        const name = el('div', 'change-name');
        name.append(el('strong', '', r.name));
        if (r.sub) name.append(el('span', '', r.sub));
        const from = el('div', 'change-old');
        from.append(r.from);
        const to = el('div', 'change-new');
        to.append(r.to);
        row.append(name, from, icon('arrow-big-right', 'change-arrow'), to);
        if (r.blocked) {
            const why = el('div', 'change-reason');
            why.append(chip(r.blocked, 'warning', 'alert-triangle'));
            row.append(why);
        }
        list.append(row);
    }
    return list;
}

/** A highlighted note with an icon: a warning to read, a fact to know, something that went well. */
export function callout(tone: Tone, title: string, lines: readonly string[], iconName?: string, action?: HTMLElement): HTMLElement {
    const box = el('div', `callout callout--${tone}`);
    const glyph = iconName ?? ({ primary: 'info', info: 'info', success: 'check-circle', warning: 'alert-triangle', error: 'x-circle' } as Record<Tone, string>)[tone];
    box.append(icon(glyph, 'callout-icon'));
    const body = el('div', 'callout-body');
    body.append(el('strong', 'callout-title', title));
    for (const l of lines) body.append(el('p', '', l));
    box.append(body);
    if (action) {
        action.classList.add('callout-action');
        box.append(action);
    }
    return box;
}

export interface ModalOptions {
    tone: 'primary' | 'error' | 'warning' | 'success';
    icon: string;
    title: string;
    subtitle?: Node | string;
    body: readonly Node[];
    /** Left of the buttons in the footer: for example the acknowledgement. */
    footNote?: Node;
    confirm: { label: string; icon?: string; disabled?: boolean; danger?: boolean; onConfirm: () => void };
    cancelLabel?: string;
    onCancel: () => void;
}

let modalSeq = 0;

/**
 * A confirmation dialog over the whole screen (constitution V: a write is confirmed here first). The overlay is the
 * element to place in the page. Escape, the close button and Cancel call `onCancel`; focus is kept inside and the
 * element marked `data-autofocus` (Cancel) is where it starts, so Enter never confirms by accident.
 */
export function modal(o: ModalOptions): HTMLElement {
    const id = `modal-${++modalSeq}`;
    const overlay = el('div', 'modal-overlay');
    const box = el('div', `modal modal--${o.tone}`);
    box.setAttribute('role', 'alertdialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-labelledby', `${id}-title`);

    const head = el('div', 'modal-head');
    const badge = el('span', 'modal-badge');
    badge.append(icon(o.icon));
    const titles = el('div', 'modal-titles');
    const title = el('h2', 'modal-title', o.title);
    title.id = `${id}-title`;
    titles.append(title);
    if (o.subtitle !== undefined) {
        const sub = el('div', 'modal-subtitle');
        sub.append(o.subtitle);
        titles.append(sub);
    }
    const close = el('button', 'icon-btn modal-close');
    close.type = 'button';
    close.title = 'Close';
    close.setAttribute('aria-label', 'Close');
    close.append(icon('close'));
    close.addEventListener('click', o.onCancel);
    head.append(badge, titles, close);

    const body = el('div', 'modal-body');
    body.append(...o.body);

    const foot = el('div', 'modal-foot');
    if (o.footNote) {
        const note = el('div', 'modal-foot-note');
        note.append(o.footNote);
        foot.append(note);
    }
    const cancel = button(o.cancelLabel ?? 'Cancel', 'secondary', o.onCancel);
    cancel.dataset['autofocus'] = 'true';
    const confirm = button(o.confirm.label, o.confirm.danger ? 'danger' : 'primary', o.confirm.onConfirm);
    if (o.confirm.icon) confirm.prepend(icon(o.confirm.icon));
    confirm.disabled = o.confirm.disabled === true;
    const actions = el('div', 'modal-actions');
    actions.append(cancel, confirm);
    foot.append(actions);

    box.append(head, body, foot);
    overlay.append(box);
    box.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            e.stopPropagation();
            o.onCancel();
            return;
        }
        if (e.key !== 'Tab') return;
        const focusable = [...box.querySelectorAll<HTMLElement>('button, input, select, [tabindex]:not([tabindex="-1"])')].filter(n => !(n as HTMLButtonElement).disabled && !n.hidden);
        if (focusable.length === 0) return;
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        const active = document.activeElement;
        if (e.shiftKey && (active === first || !box.contains(active))) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && (active === last || !box.contains(active))) { e.preventDefault(); first.focus(); }
    });
    return overlay;
}


export interface StepperItem { key: string; label: string }

/** The progress of a guided path: done steps are green checks, the current one is enlarged and glowing, the rest grey. */
export function stepper(steps: readonly StepperItem[], current: number): HTMLElement {
    const list = el('ol', 'stepper');
    list.setAttribute('aria-label', 'Progress');
    steps.forEach((s, i) => {
        const state = i < current ? 'is-done' : i === current ? 'is-active' : 'is-upcoming';
        const item = el('li', `stepper-item ${state}`);
        if (i === current) item.setAttribute('aria-current', 'step');
        item.dataset['step'] = s.key;
        const dot = el('span', 'stepper-dot');
        if (i < current) dot.append(icon('check')); else dot.append(String(i + 1));
        item.append(dot, el('span', 'stepper-label', s.label));
        list.append(item);
        if (i < steps.length - 1) {
            const line = el('li', i < current ? 'stepper-line is-done' : 'stepper-line');
            line.setAttribute('aria-hidden', 'true');
            list.append(line);
        }
    });
    return list;
}

export interface Fact { label: string; value: string; sub?: string; tone?: 'success' | 'warning' | 'error' }

/** A strip of big facts (label above, figure below), for the top of a step. */
export function factStrip(items: readonly Fact[]): HTMLElement {
    const strip = el('dl', 'strip');
    for (const f of items) {
        const stat = el('div', f.tone ? `stat stat--${f.tone}` : 'stat');
        const dd = el('dd', '', f.value);
        if (f.sub) dd.append(el('span', 'stat-sub', f.sub));
        stat.append(el('dt', '', f.label), dd);
        strip.append(stat);
    }
    return strip;
}

export type PipelineState = 'done' | 'active' | 'pending' | 'error';
export interface PipelineStep { label: string; state: PipelineState }

/** A timeline of the phases of a run, evenly spread, with a status line under it (the line keeps its height). */
export function pipeline(steps: readonly PipelineStep[], status?: Node | string): HTMLElement {
    const box = el('div', 'pipeline-box');
    const list = el('ol', 'pipeline');
    list.setAttribute('aria-label', 'Phases');
    steps.forEach((s, i) => {
        const item = el('li', `pipe-step is-${s.state === 'pending' ? 'pending' : s.state}`);
        if (s.state === 'active') item.setAttribute('aria-current', 'step');
        const dot = el('span', 'pipe-dot');
        if (s.state === 'done') dot.append(icon('check'));
        else if (s.state === 'error') dot.append(icon('close'));
        else dot.append(String(i + 1));
        item.append(dot, el('span', 'pipe-label', s.label));
        list.append(item);
    });
    const line = el('div', 'pipe-status');
    line.setAttribute('role', 'status');
    line.append(status ?? '\u00a0');
    box.append(list, line);
    return box;
}

export type DiffLayout = 'split' | 'unified';

export interface DiffRowView {
    kind: 'context' | 'changed' | 'removed' | 'added' | 'gap';
    oldNo: number | null;
    newNo: number | null;
    oldText: string;
    newText: string;
    oldSpan: [number, number] | null;
    newSpan: [number, number] | null;
    skipped: number;
}

function withSpan(text: string, span: [number, number] | null): DocumentFragment {
    const frag = document.createDocumentFragment();
    if (!span || span[0] >= span[1]) { frag.append(text); return frag; }
    const mark = el('mark', 'diff-hl', text.slice(span[0], span[1]));
    frag.append(text.slice(0, span[0]), mark, text.slice(span[1]));
    return frag;
}

function codeCell(kind: 'old' | 'new' | 'ctx' | 'empty', text: string, span: [number, number] | null): HTMLTableCellElement {
    const td = el('td', `diff-code${kind === 'old' ? ' diff-code--old' : kind === 'new' ? ' diff-code--new' : kind === 'empty' ? ' diff-code--empty' : ''}`);
    if (kind === 'old' || kind === 'new') td.append(el('span', 'diff-mark', kind === 'old' ? '-' : '+'));
    if (kind !== 'empty') td.append(withSpan(text, span));
    return td;
}

const noCell = (n: number | null): HTMLTableCellElement => el('td', 'diff-no', n === null ? '' : String(n));

/** The rows of a line diff as a table: two columns (split) or one (unified). Signs and numbers, not colour alone. */
export function diffView(rows: readonly DiffRowView[], layout: DiffLayout): HTMLElement {
    const table = el('table', 'diff-table');
    const cols = layout === 'split' ? ['c-no', 'c-code', 'c-no', 'c-code'] : ['c-no', 'c-no', 'c-code'];
    const group = el('colgroup');
    for (const c of cols) group.append(el('col', c));
    table.append(group);
    const body = el('tbody');
    for (const r of rows) {
        const tr = el('tr', `diff-row diff-row--${r.kind}`);
        if (r.kind === 'gap') {
            tr.className = 'diff-row diff-row--gap';
            const td = el('td', '', `${r.skipped} unchanged line${r.skipped === 1 ? '' : 's'}`);
            td.colSpan = cols.length;
            tr.append(td);
        } else if (layout === 'split') {
            const left = r.kind === 'added' ? codeCell('empty', '', null) : codeCell(r.kind === 'context' ? 'ctx' : 'old', r.oldText, r.oldSpan);
            const right = r.kind === 'removed' ? codeCell('empty', '', null) : codeCell(r.kind === 'context' ? 'ctx' : 'new', r.newText, r.newSpan);
            tr.append(noCell(r.oldNo), left, noCell(r.newNo), right);
        } else if (r.kind === 'changed') {
            // one changed line is two lines in the unified view: the old one, then the new one
            tr.append(noCell(r.oldNo), noCell(null), codeCell('old', r.oldText, r.oldSpan));
            body.append(tr);
            const second = el('tr', 'diff-row diff-row--changed');
            second.append(noCell(null), noCell(r.newNo), codeCell('new', r.newText, r.newSpan));
            body.append(second);
            continue;
        } else {
            const kind = r.kind === 'context' ? 'ctx' : r.kind === 'removed' ? 'old' : 'new';
            tr.append(noCell(r.oldNo), noCell(r.newNo), codeCell(kind, r.kind === 'added' ? r.newText : r.oldText, r.kind === 'added' ? r.newSpan : r.oldSpan));
        }
        body.append(tr);
    }
    table.append(body);
    const scroll = el('div', 'diff-scroll');
    scroll.append(table);
    const box = el('div', `diff diff--${layout}`);
    box.append(scroll);
    return box;
}

/** A diff with a file-like header: the title and how many lines were added and removed. */
export function diffFile(title: string, added: number, removed: number, view: HTMLElement, note?: string): HTMLElement {
    const box = el('div', view.className);
    const head = el('div', 'diff-head');
    const stat = el('span', 'diff-stat');
    stat.append(el('span', 'diff-add', `+${added}`), el('span', 'diff-del', `-${removed}`));
    head.append(el('span', 'diff-file', title), stat);
    box.append(head);
    if (note) box.append(el('p', 'diff-note', note));
    for (const child of [...view.children]) box.append(child);
    return box;
}

export interface ItemCardOptions {
    title: string;
    sub?: string;
    countText: string;
    open: boolean;
    onToggle: () => void;
    /** A Diff / Table switch or any control for the right of the head. */
    controls?: Node;
    body: Node;
    blocked?: boolean;
}

/** A collapsible card for one item of a list of changes: chevron, title, id, count, controls and a body. */
export function itemCard(o: ItemCardOptions): HTMLElement {
    const card = el('section', o.blocked ? 'item-card item-card--blocked' : 'item-card');
    const head = el('div', 'item-head');
    const chevron = el('button', 'icon-btn expand-btn');
    chevron.type = 'button';
    chevron.setAttribute('aria-expanded', String(o.open));
    chevron.setAttribute('aria-label', `${o.open ? 'Collapse' : 'Expand'} ${o.title}`);
    chevron.append(icon('chevron-down'));
    chevron.addEventListener('click', o.onToggle);
    head.append(chevron, el('span', 'item-title', o.title));
    if (o.sub) head.append(el('span', 'item-sub', o.sub));
    head.append(el('span', 'item-count', o.countText));
    if (o.controls) head.append(o.controls);
    const body = el('div', 'item-body');
    body.hidden = !o.open;
    body.append(o.body);
    card.append(head, body);
    return card;
}
