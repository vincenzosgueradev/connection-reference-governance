// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { diffFile, diffView, factStrip, itemCard, pipeline, stepper, type DiffRowView, actionBox, breadcrumb, callout, changeList, figure, figures, modal, sectionTitle, detailBlock, emptyState, keyValues, selectableTable, button, check, chip, connectionBadge, countPill, dataTable, field, hero, panel, searchBox, segmented, setConnectionBadge, statTile, statusSlot } from '../src/ui/components';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

describe('shared UI kit (constitution VII)', () => {
    const kit = read('../src/ui/ui.css');
    const own = read('../src/styles.css');

    it('the tool stylesheet imports the kit and defines no colour of its own', () => {
        expect(own).toMatch(/@import\s+'\.\/ui\/ui\.css'/);
        expect(own).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
        expect(own).not.toMatch(/rgba?\(/);
        expect(own).not.toMatch(/--color-[a-z-]+\s*:/);
    });

    it('every class used by index.html and the helpers exists in the kit or in the tool stylesheet', () => {
        const html = read('../src/index.html');
        const used = new Set<string>();
        for (const m of html.matchAll(/class="([^"]+)"/g)) m[1].split(/\s+/).forEach(c => used.add(c));
        const helpers = [
            button('x', 'danger', undefined, true), chip('x', 'warning'), panel('h', 'n').root,
            breadcrumb([{ label: 'a', onClick: () => undefined }, { label: 'b' }]),
            dataTable(['c'], [1], () => ['v']), check(true, 'x', () => undefined),
            field('L', document.createElement('input')), actionBox('T', 'H', '0').root, statusSlot('w', false),
            keyValues([{ label: 'A', value: 'b', mono: true, wide: true }]), detailBlock('T', 2, document.createElement('div'), true),
            searchBox('x', 'Search', () => undefined), segmented([{ key: 'a', label: 'A', count: 1, icon: 'edit' }, { key: 'b', label: 'B', disabled: true }], 'a', () => undefined),
            hero('T', 'S', [statTile('L', '1', 'stack'), statTile('M', '2', 'zap', true)]), connectionBadge('DEV', 'connected'), countPill(0), countPill(2),
            dataTable(['A', 'B'], [1], () => ['x', 'y'], { sort: { columns: [0], active: 0, desc: false, onSort: () => undefined }, numeric: [1] }),
        ];
        for (const h of helpers) {
            h.classList.forEach(c => used.add(c));
            h.querySelectorAll('[class]').forEach(n => n.classList.forEach(c => used.add(c)));
        }
        const known = kit + own;
        const missing = [...used].filter(c => !new RegExp(`\\.${c}(?![\\w-])`).test(known));
        expect(missing).toEqual([]);
    });

    it('the helpers build the expected markup', () => {
        expect(button('Go', 'primary').className).toBe('btn btn--primary');
        expect(chip('ok', 'success').className).toBe('chip chip--success');
        const crumbs = breadcrumb([{ label: 'Home', onClick: () => undefined }, { label: 'Here' }]);
        expect(crumbs.querySelectorAll('.crumb--link').length).toBe(1);
        expect(crumbs.querySelector('.crumb--current')?.textContent).toBe('Here');
        const t = dataTable(['A', 'B'], [{ a: 1, b: 2 }], r => [String(r.a), String(r.b)]);
        expect(t.querySelectorAll('th').length).toBe(2);
        expect(t.querySelector('td')?.getAttribute('title')).toBe('1');
        const c = check(true, 'Select', () => undefined);
        expect([c.className, c.getAttribute('aria-checked'), c.getAttribute('role')]).toEqual(['check is-on', 'true', 'checkbox']);
    });

    it('no width depends on state: select and count are fixed, the status slot is always present', () => {
        expect(kit).toMatch(/\.select \{[^}]*\bwidth: \d+px/);
        expect(kit).toMatch(/\.action-count \{[^}]*\bmin-width: \d+ch/);
        const idle = statusSlot('Working...', false);
        const busy = statusSlot('Working...', true);
        expect(idle.textContent).toBe(busy.textContent);
        expect(idle.className).toContain('is-idle');
        expect(kit).toMatch(/\.status-slot\.is-idle \{ visibility: hidden/);
        const box = actionBox('Title', 'Hint', '0 selected');
        expect(box.count.className).toBe('action-count');
        expect(box.root.querySelector('.action-title')?.textContent).toBe('Title');
    });

    it('the home screen helpers build what the stylesheet styles', () => {
        const box = searchBox('abc', 'Search', () => undefined);
        expect(box.className).toBe('search-box');
        expect((box.querySelector('.search-clear') as HTMLElement).hidden).toBe(false);
        expect((searchBox('', 'Search', () => undefined).querySelector('.search-clear') as HTMLElement).hidden).toBe(true);
        const seg = segmented([{ key: 'a', label: 'Unmanaged', count: 3, icon: 'edit' }, { key: 'b', label: 'Managed', count: 0, disabled: true, title: 'why' }], 'a', () => undefined);
        expect([...seg.querySelectorAll('.segment')].map(b => b.textContent)).toEqual(['Unmanaged 3', 'Managed 0']);
        expect((seg.querySelectorAll('.segment')[1] as HTMLButtonElement).disabled).toBe(true);
        const h = hero('Solutions', 'Pick one', [statTile('Solutions', '20', 'stack'), statTile('Flows', '46', 'zap', true)]);
        expect(h.querySelector('.hero-title')!.textContent).toBe('Solutions');
        expect([...h.querySelectorAll('dt')].map(d => d.textContent)).toEqual(['Solutions', 'Flows']);
        const badge = connectionBadge('Connecting...', 'loading');
        setConnectionBadge(badge, 'DEV', 'connected');
        expect([badge.className, badge.textContent]).toEqual(['connection-badge connection-badge--connected', 'DEV']);
        expect(countPill(0).className).toContain('count-pill--zero');
    });
    it('sortable headers keep a reserved arrow slot and report the column', () => {
        const calls: number[] = [];
        const t = dataTable(['A', 'B', 'C'], [1], () => ['x', 'y', 'z'], { sort: { columns: [0, 2], active: 2, desc: true, onSort: c => calls.push(c) }, numeric: [2] });
        const ths = [...t.querySelectorAll('th')];
        expect(ths.map(th => th.classList.contains('sortable'))).toEqual([true, false, true]);
        expect(ths.every((th, i) => i === 1 || th.querySelector('.sort-arrow'))).toBe(true);
        expect(ths[2]!.getAttribute('aria-sort')).toBe('descending');
        expect(ths[0]!.getAttribute('aria-sort')).toBe('none');
        ths[0]!.click();
        expect(calls).toEqual([0]);
        expect(t.querySelector('td:nth-child(3)')!.classList.contains('col-num')).toBe(true);
    });
});

describe('responsive kit (constitution VII)', () => {
    const kit = read('../src/ui/ui.css');

    it('has narrow-pane rules, scrolls wide tables inside their wrapper, and sets no page-wide fixed width', () => {
        expect(kit).toMatch(/@media \(max-width: 720px\)/);
        expect(kit).toMatch(/@media \(max-width: 480px\)/);
        expect(kit).toMatch(/\.table-wrap \{[^}]*overflow-x: auto/);
        expect(kit).not.toMatch(/(?:body|\.main-content|\.app-header)\s*\{[^}]*(?<![-\w])width:\s*\d+px/);
    });

    it('a tool stylesheet sets no fixed pixel width on page-level containers', () => {
        const own = read('../src/styles.css');
        expect(own).not.toMatch(/\.(?:main-content|app-header|panel)\s*\{[^}]*(?<![-\w])(?:max-)?width:\s*\d+px/);
    });

    it('key-value pairs show the value in full and a dash when there is none', () => {
        const kv = keyValues([{ label: 'Flow ID', value: 'abc', mono: true }, { label: 'Description', value: '', wide: true }, { label: 'Node', value: Object.assign(document.createElement('b'), { textContent: 'x' }) }]);
        expect([...kv.querySelectorAll('dt')].map(d => d.textContent)).toEqual(['Flow ID', 'Description', 'Node']);
        expect([...kv.querySelectorAll('dd')].map(d => d.textContent)).toEqual(['abc', '-', 'x']);
        expect(kv.querySelectorAll('.kv-item--mono')).toHaveLength(1);
        expect(kv.querySelectorAll('.kv-item--wide')).toHaveLength(1);
    });
    it('a detail block has a title, an optional count and a body', () => {
        const body = document.createElement('p');
        const block = detailBlock('Connections', 3, body);
        expect(block.querySelector('.detail-title')!.textContent).toBe('Connections');
        expect(block.querySelector('.detail-head .chip')!.textContent).toBe('3');
        expect(block.contains(body)).toBe(true);
        expect(detailBlock('Only', undefined, body).querySelector('.detail-head .chip')).toBeNull();
    });
    it('rows open to a full-width details row, by chevron or by click, and a check does not open them', () => {
        const toggled: string[] = [];
        const expanded: string[] = [];
        const build = (open: string[]) => selectableTable({
            columns: ['Name', 'Kind'], rows: [{ id: 'a', n: 'A' }, { id: 'b', n: 'B' }], id: r => r.id, label: r => r.n,
            cells: r => [r.n, 'k'], selected: [], onToggle: id => toggled.push(id), onToggleAll: () => undefined,
            detail: r => Object.assign(document.createElement('div'), { textContent: `detail ${r.n}` }), expanded: open, onExpand: id => expanded.push(id),
        });
        const closed = build([]);
        expect(closed.querySelectorAll('tr.detail-row')).toHaveLength(0);
        expect(closed.querySelectorAll('.expand-btn[aria-expanded="false"]')).toHaveLength(2);
        (closed.querySelector('tbody tr .expand-btn') as HTMLElement).click();
        expect(expanded).toEqual(['a']);
        (closed.querySelector('tbody tr .check') as HTMLElement).click();
        expect(toggled).toEqual(['a']);
        expect(expanded).toEqual(['a']);
        const open = build(['b']);
        const detail = open.querySelector('tr.detail-row td') as HTMLTableCellElement;
        expect(detail.textContent).toBe('detail B');
        expect(detail.colSpan).toBe(4);
        expect(open.querySelectorAll('tr.is-open')).toHaveLength(1);
        expect(open.querySelector('tr.is-open .expand-btn')!.getAttribute('aria-expanded')).toBe('true');
    });
    it('without a detail callback the table has no chevron column', () => {
        const t = selectableTable({ columns: ['N'], rows: [{ id: 'a' }], id: r => r.id, label: r => r.id, cells: r => [r.id], selected: [], onToggle: () => undefined, onToggleAll: () => undefined });
        expect(t.querySelector('.col-expand')).toBeNull();
        expect(t.querySelectorAll('thead th')).toHaveLength(2);
    });

    it('icons can go in chips, key labels, block titles, action titles and empty states, and never change the text', () => {
        expect(chip('On', 'success', 'power').textContent).toBe('On');
        expect(chip('On', 'success', 'power').querySelector('.icon-power')).not.toBeNull();
        expect(chip('Plain').querySelector('.icon')).toBeNull();
        const kv = keyValues([{ label: 'Trigger', value: 'x', icon: 'zap' }]);
        expect(kv.querySelector('dt')!.textContent).toBe('Trigger');
        expect(kv.querySelector('dt .icon-zap')).not.toBeNull();
        expect(detailBlock('Flow', 1, document.createElement('p'), false, 'workflow').querySelector('.detail-title .icon-workflow')).not.toBeNull();
        expect(actionBox('Title', 'H', '0', 'link').root.querySelector('.action-title .icon-link')).not.toBeNull();
        const empty = emptyState('Nothing here', 'search');
        expect(empty.textContent).toBe('Nothing here');
        expect(empty.querySelector('.icon-search')).not.toBeNull();
    });
    it('every glyph the kit offers is a mask, and every colour class uses a token', () => {
        const rules = kit.match(/^\.icon-[a-z-]+ \{[^}]*\}/gm) ?? [];
        const glyphs = rules.filter(r => r.includes('mask-image'));
        expect(glyphs.length).toBeGreaterThanOrEqual(55);
        for (const g of glyphs) expect(g).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb/);
        for (const tone of ['primary', 'success', 'warning', 'error', 'info', 'muted'])
            expect(kit).toMatch(new RegExp(`\\.icon--${tone} \\{ color: var\\(--color-`));
    });

    it('a modal has a title, a badge, a body and a footer; Cancel is where focus starts and Confirm can be disabled', () => {
        const confirm = vi.fn();
        const cancel = vi.fn();
        const m = modal({ tone: 'error', icon: 'link', title: 'Change things', subtitle: 'Env', body: [document.createElement('p')], footNote: document.createElement('span'), confirm: { label: 'Apply', icon: 'check', danger: true, disabled: true, onConfirm: confirm }, onCancel: cancel });
        expect(m.className).toBe('modal-overlay');
        expect(m.querySelector('.modal')!.getAttribute('role')).toBe('alertdialog');
        expect(m.querySelector('.modal')!.getAttribute('aria-modal')).toBe('true');
        expect(m.querySelector('.modal-title')!.textContent).toBe('Change things');
        expect(m.querySelector('.modal-badge .icon-link')).not.toBeNull();
        expect((m.querySelector('[data-autofocus]') as HTMLElement).textContent).toBe('Cancel');
        const apply = m.querySelector('.btn--danger') as HTMLButtonElement;
        expect([apply.disabled, apply.textContent]).toEqual([true, 'Apply']);
        apply.disabled = false;
        apply.click();
        expect(confirm).toHaveBeenCalledOnce();
    });
    it('Cancel, the close button and Escape cancel; none of them confirms', () => {
        const confirm = vi.fn();
        const cancel = vi.fn();
        const m = modal({ tone: 'primary', icon: 'link', title: 'T', body: [], confirm: { label: 'Apply', onConfirm: confirm }, onCancel: cancel });
        document.body.append(m);
        (m.querySelector('[data-autofocus]') as HTMLElement).click();
        (m.querySelector('.modal-close') as HTMLElement).click();
        m.querySelector('.modal')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(cancel).toHaveBeenCalledTimes(3);
        expect(confirm).not.toHaveBeenCalled();
        m.remove();
    });
    it('Tab stays inside the modal: from the last control to the first and back', () => {
        const m = modal({ tone: 'primary', icon: 'link', title: 'T', body: [], confirm: { label: 'Apply', onConfirm: () => undefined }, onCancel: () => undefined });
        document.body.append(m);
        const controls = [...m.querySelectorAll<HTMLElement>('button')].filter(b => !(b as HTMLButtonElement).disabled);
        const first = controls[0]!;
        const last = controls[controls.length - 1]!;
        last.focus();
        const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
        last.dispatchEvent(tab);
        expect(tab.defaultPrevented).toBe(true);
        expect(document.activeElement).toBe(first);
        first.focus();
        const back = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
        first.dispatchEvent(back);
        expect(document.activeElement).toBe(last);
        m.remove();
    });
    it('figures, change rows and callouts build what the stylesheet styles', () => {
        const f = figure({ label: 'Flows affected', value: '7', icon: 'workflow', tone: 'info' });
        expect(f.className).toBe('fig fig--info');
        expect([f.querySelector('.fig-value')!.textContent, f.querySelector('.fig-label')!.textContent]).toEqual(['7', 'Flows affected']);
        expect(figures([{ label: 'A', value: '1', icon: 'zap', tone: 'success' }]).className).toBe('fig-row');
        const rows = changeList([{ name: 'Ref 1', sub: 'sample_ref1', from: 'old', to: 'new' }, { name: 'Ref 2', from: 'a', to: 'b', blocked: 'Managed' }]);
        expect(rows.querySelectorAll('.change-row')).toHaveLength(2);
        expect(rows.querySelectorAll('.change-row--blocked')).toHaveLength(1);
        expect(rows.querySelector('.change-arrow')).not.toBeNull();
        expect(rows.querySelector('.change-reason .chip')!.textContent).toBe('Managed');
        const c = callout('warning', 'Read this', ['one', 'two']);
        expect(c.className).toBe('callout callout--warning');
        expect(c.querySelector('.callout-icon.icon-alert-triangle')).not.toBeNull();
        expect(c.querySelectorAll('p')).toHaveLength(2);
        expect(callout('success', 'Done', [], undefined, document.createElement('button')).querySelector('.callout-action')).not.toBeNull();
        expect(sectionTitle('What changes', 'list').textContent).toBe('What changes');
    });
    it('every tone has its figure, callout and modal colours from the tokens', () => {
        for (const t of ['primary', 'success', 'warning', 'error', 'info']) {
            expect(kit).toMatch(new RegExp(`\\.fig--${t} \\{[^}]*var\\(--color-${t}\\)`));
            expect(kit).toMatch(new RegExp(`\\.callout--${t} \\{[^}]*var\\(--color-${t}\\)`));
            expect(kit).toMatch(new RegExp(`\\.modal--${t}::before \\{[^}]*var\\(--color-${t}\\)`));
        }
    });

    it('the stepper marks done, current and upcoming steps with a check, an enlarged number and plain numbers', () => {
        const s = stepper([{ key: 'a', label: 'One' }, { key: 'b', label: 'Two' }, { key: 'c', label: 'Three' }], 1);
        const items = [...s.querySelectorAll('.stepper-item')];
        expect(items.map(i => i.className.replace('stepper-item ', ''))).toEqual(['is-done', 'is-active', 'is-upcoming']);
        expect(items[0]!.querySelector('.stepper-dot .icon-check')).not.toBeNull();
        expect(items[1]!.querySelector('.stepper-dot')!.textContent).toBe('2');
        expect(items[1]!.getAttribute('aria-current')).toBe('step');
        expect(items[0]!.getAttribute('aria-current')).toBeNull();
        expect(items.map(i => i.querySelector('.stepper-label')!.textContent)).toEqual(['One', 'Two', 'Three']);
        const lines = [...s.querySelectorAll('.stepper-line')];
        expect(lines.map(l => l.classList.contains('is-done'))).toEqual([true, false]);
        expect(lines.every(l => l.getAttribute('aria-hidden') === 'true')).toBe(true);
        expect(s.getAttribute('aria-label')).toBe('Progress');
    });
    it('the stepper keeps only the current label on a narrow pane', () => {
        expect(kit).toMatch(/@media \(max-width: 700px\)[^@]*\.stepper-item:not\(\.is-active\) \.stepper-label \{ display: none; \}/s);
    });
    it('a fact strip has a label above each figure, a small note and an optional tone', () => {
        const strip = factStrip([{ label: 'Items', value: '3' }, { label: 'Duration', value: '14 s', sub: 'sync', tone: 'success' }]);
        expect([...strip.querySelectorAll('dt')].map(d => d.textContent)).toEqual(['Items', 'Duration']);
        expect([...strip.querySelectorAll('dd')].map(d => d.textContent)).toEqual(['3', '14 ssync']);
        expect(strip.querySelector('.stat--success')).not.toBeNull();
        expect(strip.querySelector('.stat-sub')!.textContent).toBe('sync');
    });
    it('a pipeline shows each phase done, active, pending or failed, and a status line that always exists', () => {
        const p = pipeline([{ label: 'A', state: 'done' }, { label: 'B', state: 'active' }, { label: 'C', state: 'pending' }, { label: 'D', state: 'error' }], 'writing 3 of 12');
        const steps = [...p.querySelectorAll('.pipe-step')];
        expect(steps.map(s => s.className.replace('pipe-step ', ''))).toEqual(['is-done', 'is-active', 'is-pending', 'is-error']);
        expect(steps[0]!.querySelector('.icon-check')).not.toBeNull();
        expect(steps[1]!.querySelector('.pipe-dot')!.textContent).toBe('2');
        expect(steps[3]!.querySelector('.icon-close')).not.toBeNull();
        expect(steps[1]!.getAttribute('aria-current')).toBe('step');
        expect(p.querySelector('.pipe-status')!.textContent).toBe('writing 3 of 12');
        expect(pipeline([{ label: 'A', state: 'done' }]).querySelector('.pipe-status')!.textContent).toBe('\u00a0');
    });
    const row = (over: Partial<DiffRowView>): DiffRowView => ({ kind: 'context', oldNo: 1, newNo: 1, oldText: 'a', newText: 'a', oldSpan: null, newSpan: null, skipped: 0, ...over });
    const rows: DiffRowView[] = [
        row({ oldNo: 4, newNo: 4, oldText: 'keep', newText: 'keep' }),
        row({ kind: 'changed', oldNo: 5, newNo: 5, oldText: 'name: one', newText: 'name: two', oldSpan: [6, 9], newSpan: [6, 9] }),
        row({ kind: 'removed', oldNo: 6, newNo: null, oldText: 'gone' }),
        row({ kind: 'added', oldNo: null, newNo: 6, newText: 'new' }),
        row({ kind: 'gap', oldNo: null, newNo: null, skipped: 17 }),
    ];
    it('a split diff has two columns per line, the sign of each side, the changed words marked and a collapsed band', () => {
        const d = diffView(rows, 'split');
        expect(d.className).toBe('diff diff--split');
        const trs = [...d.querySelectorAll('tbody tr')];
        expect(trs).toHaveLength(5);
        expect(trs[0]!.querySelectorAll('td')).toHaveLength(4);
        const changed = trs[1]!;
        expect(changed.querySelector('.diff-code--old .diff-mark')!.textContent).toBe('-');
        expect(changed.querySelector('.diff-code--new .diff-mark')!.textContent).toBe('+');
        expect(changed.querySelector('.diff-code--old .diff-hl')!.textContent).toBe('one');
        expect(changed.querySelector('.diff-code--new .diff-hl')!.textContent).toBe('two');
        expect(trs[2]!.querySelector('.diff-code--empty')).not.toBeNull();
        expect(trs[3]!.querySelector('.diff-code--empty')).not.toBeNull();
        expect(trs[4]!.textContent).toBe('17 unchanged lines');
        expect((trs[4]!.querySelector('td') as HTMLTableCellElement).colSpan).toBe(4);
        expect([...trs[0]!.querySelectorAll('.diff-no')].map(n => n.textContent)).toEqual(['4', '4']);
    });
    it('a unified diff has one column of code, two numbers, and shows a changed line as two lines', () => {
        const d = diffView(rows, 'unified');
        expect(d.className).toBe('diff diff--unified');
        const trs = [...d.querySelectorAll('tbody tr')];
        expect(trs).toHaveLength(6);
        expect(trs[0]!.querySelectorAll('td')).toHaveLength(3);
        expect(trs[1]!.querySelector('.diff-code--old')!.textContent).toBe('-name: one');
        expect(trs[2]!.querySelector('.diff-code--new')!.textContent).toBe('+name: two');
        expect(trs[3]!.querySelector('.diff-code--old')!.textContent).toBe('-gone');
        expect(trs[4]!.querySelector('.diff-code--new')!.textContent).toBe('+new');
        expect((trs[5]!.querySelector('td') as HTMLTableCellElement).colSpan).toBe(3);
    });
    it('a single unchanged line reads in the singular and a span with no width marks nothing', () => {
        const d = diffView([row({ kind: 'gap', skipped: 1 }), row({ kind: 'changed', oldText: 'x', newText: 'y', oldSpan: [0, 0], newSpan: null })], 'split');
        expect(d.querySelector('.diff-row--gap')!.textContent).toBe('1 unchanged line');
        expect(d.querySelector('.diff-hl')).toBeNull();
    });
    it('the diff colours come from the tokens, the code scrolls inside its frame, and no sign relies on colour alone', () => {
        expect(kit).toMatch(/\.diff \{[^}]*--diff-del-bg: color-mix\(in srgb, var\(--color-error\)/);
        expect(kit).toMatch(/\.diff \{[^}]*--diff-add-bg: color-mix\(in srgb, var\(--color-success\)/);
        expect(kit).toMatch(/\.diff-scroll \{ overflow-x: auto; \}/);
        expect(diffView(rows, 'unified').textContent).toContain('+name: two');
    });
    it('a diff with a file header shows the title and the added and removed counts', () => {
        const f = diffFile('flow.json', 3, 2, diffView(rows, 'split'), 'note');
        expect(f.querySelector('.diff-file')!.textContent).toBe('flow.json');
        expect([...f.querySelectorAll('.diff-stat span')].map(s => s.textContent)).toEqual(['+3', '-2']);
        expect(f.querySelector('.diff-note')!.textContent).toBe('note');
        expect(f.querySelectorAll('.diff-table')).toHaveLength(1);
    });
    it('an item card collapses and expands with its chevron, and shows its count and controls', () => {
        const toggled = vi.fn();
        const body = document.createElement('p');
        const open = itemCard({ title: 'Flow A', sub: 'id-1', countText: '2 changes', open: true, onToggle: toggled, controls: document.createElement('span'), body });
        expect(open.querySelector('.item-body')!.hasAttribute('hidden')).toBe(false);
        expect(open.querySelector('.expand-btn')!.getAttribute('aria-expanded')).toBe('true');
        expect(open.querySelector('.item-count')!.textContent).toBe('2 changes');
        (open.querySelector('.expand-btn') as HTMLElement).click();
        expect(toggled).toHaveBeenCalledOnce();
        const closed = itemCard({ title: 'Flow B', countText: 'Blocked', open: false, onToggle: () => undefined, body, blocked: true });
        expect(closed.querySelector('.item-body')!.hasAttribute('hidden')).toBe(true);
        expect(closed.className).toContain('item-card--blocked');
        expect(closed.querySelector('.expand-btn')!.getAttribute('aria-label')).toBe('Expand Flow B');
    });
});
