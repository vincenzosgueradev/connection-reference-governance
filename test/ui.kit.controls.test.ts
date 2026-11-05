// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { confirmDialog, toggle } from '../src/ui/components';

describe('kit controls (constitution VII, V)', () => {
    const kit = readFileSync('src/ui/ui.css', 'utf8');

    it('toggle is an accessible switch and its classes exist in the kit', () => {
        const t = toggle(true, 'Enabled', () => undefined);
        expect([t.getAttribute('role'), t.getAttribute('aria-checked'), t.className]).toEqual(['switch', 'true', 'toggle is-on']);
        expect(kit).toMatch(/\.toggle\.is-on/);
    });

    it('confirm dialog: labelled, buttons call back, Escape cancels, danger focuses Cancel', async () => {
        const onConfirm = vi.fn();
        const onCancel = vi.fn();
        const d = confirmDialog({ title: 'Apply 3 changes', message: 'Updates 3 rows.', confirmLabel: 'Apply', danger: true, onConfirm, onCancel });
        document.body.append(d);
        expect(d.getAttribute('role')).toBe('alertdialog');
        expect(d.querySelector(`#${d.getAttribute('aria-labelledby')}`)?.textContent).toBe('Apply 3 changes');
        expect(d.className).toBe('dialog dialog--danger');
        await Promise.resolve();
        expect(document.activeElement?.textContent).toBe('Cancel');
        const [cancel, confirm] = [...d.querySelectorAll('button')];
        confirm.click();
        expect(onConfirm).toHaveBeenCalledTimes(1);
        d.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        cancel.click();
        expect(onCancel).toHaveBeenCalledTimes(2);
        for (const c of ['dialog', 'dialog--danger', 'dialog-title', 'dialog-actions']) expect(kit).toMatch(new RegExp(`\.${c}(?![\w-])`));
    });
});

describe('selectable table', () => {
    type Row = { id: string; n: string };
    const rows: Row[] = [{ id: 'a', n: 'A' }, { id: 'b', n: 'B' }, { id: 'c', n: 'C' }];
    const base = { columns: ['Name'], rows, id: (r: Row) => r.id, label: (r: Row) => r.n, cells: (r: Row) => [r.n] };

    it('has a check per selectable row and a select-all that reports the shown ids', async () => {
        const { selectableTable } = await import('../src/ui/components');
        const onToggle = vi.fn();
        const onToggleAll = vi.fn();
        const t = selectableTable({ ...base, selected: ['a'], isBlocked: r => r.id === 'c', onToggle, onToggleAll });
        expect(t.querySelectorAll('tbody .check').length).toBe(2);
        expect(t.querySelectorAll('tr.is-selected').length).toBe(1);
        expect(t.querySelectorAll('tr.is-blocked').length).toBe(1);
        (t.querySelectorAll('tbody .check')[1] as HTMLElement).click();
        expect(onToggle).toHaveBeenCalledWith('b');
        (t.querySelector('thead .check') as HTMLElement).click();
        expect(onToggleAll).toHaveBeenCalledWith(['a', 'b'], false);
    });

    it('select-all reads as on only when every selectable row is selected; an empty table is off', async () => {
        const { selectableTable } = await import('../src/ui/components');
        const noop = () => undefined;
        const all = selectableTable({ ...base, selected: ['a', 'b', 'c'], onToggle: noop, onToggleAll: noop });
        expect(all.querySelector('thead .check')?.getAttribute('aria-checked')).toBe('true');
        const empty = selectableTable({ ...base, rows: [], selected: [], onToggle: noop, onToggleAll: noop });
        expect(empty.querySelector('thead .check')?.getAttribute('aria-checked')).toBe('false');
    });
});

describe('table helpers', () => {
    it('dataTable accepts nodes, keeps titles, and makes rows open with click and Enter', async () => {
        const { dataTable, lines, chip } = await import('../src/ui/components');
        const open = vi.fn();
        const t = dataTable(['A', 'B'], [1], () => ['text', lines(['one', 'two'])], { onOpen: open });
        const tr = t.querySelector('tbody tr')!;
        expect(tr.classList.contains('row-link')).toBe(true);
        expect(tr.querySelectorAll('td')[0].title).toBe('text');
        expect(tr.querySelectorAll('.cell-multi > div').length).toBe(2);
        (tr as HTMLElement).click();
        tr.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        expect(open).toHaveBeenCalledTimes(2);
        const withChip = dataTable(['A'], [1], () => [chip('On', 'success')]);
        expect(withChip.querySelector('td .chip--success')?.textContent).toBe('On');
    });

    it('segmented marks the active key and reports a pick; search reports input', async () => {
        const { segmented, searchBox } = await import('../src/ui/components');
        const pick = vi.fn();
        const s = segmented([{ key: 'a', label: 'A', count: 2 }, { key: 'b', label: 'B' }], 'a', pick);
        expect([...s.querySelectorAll('button')].map(b => [b.textContent, b.getAttribute('aria-pressed')])).toEqual([['A 2', 'true'], ['B', 'false']]);
        (s.querySelectorAll('button')[1] as HTMLElement).click();
        expect(pick).toHaveBeenCalledWith('b');
        const typed = vi.fn();
        const box = searchBox('x', 'Find', typed);
        const input = box.querySelector('input')!;
        input.value = 'abc';
        input.dispatchEvent(new Event('input'));
        expect(typed).toHaveBeenCalledWith('abc');
        (box.querySelector('.search-clear') as HTMLElement).click();
        expect(typed).toHaveBeenLastCalledWith('');
    });
});
