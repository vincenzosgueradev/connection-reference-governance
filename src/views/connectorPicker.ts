import { el, icon } from '../ui/components';
import { connectorTile } from './connections';

/**
 * The connector filter of the Connections area: a list in which every connector has its glyph (the same drawings as the rows),
 * its name and how many connections it has. A native select cannot show a drawing, so this is a small listbox. DOM only; it
 * closes on a click outside, on Escape and after a choice, and it can be used with the keyboard (arrows, Enter, Escape).
 */

export interface ConnectorChoice {
    readonly key: string;
    readonly name: string;
    readonly count: number;
}

let wired = false;

/** One document-level listener closes whatever picker is open when the click is outside of it. */
function wire(): void {
    if (wired || typeof document === 'undefined') return;
    wired = true;
    document.addEventListener('click', e => {
        for (const list of document.querySelectorAll<HTMLElement>('.cm-picker-list:not([hidden])')) {
            if (!list.parentElement?.contains(e.target as Node)) close(list);
        }
    });
}

function close(list: HTMLElement): void {
    list.hidden = true;
    list.parentElement?.querySelector('.cm-picker-btn')?.setAttribute('aria-expanded', 'false');
}

export function connectorPicker(choices: readonly ConnectorChoice[], total: number, selected: string, onPick: (key: string) => void): HTMLElement {
    wire();
    const root = el('div', 'cm-picker');
    const current = choices.find(c => c.key === selected);

    const btn = el('button', 'cm-picker-btn');
    btn.type = 'button';
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-label', 'Connector');
    const glyph = current ? connectorTile(`shared_${current.key}`, false, true) : (() => {
        const t = el('span', 'conn-tile conn-tile--muted conn-tile--sm');
        t.append(icon('layers'));
        return t;
    })();
    btn.append(glyph, el('span', 'cm-picker-label', current ? current.name : 'All connectors'), icon('chevron-down', 'icon--sm cm-picker-chevron'));

    const list = el('div', 'cm-picker-list');
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', 'Connectors');
    list.hidden = true;
    const option = (key: string, name: string, count: number, tile: HTMLElement) => {
        const o = el('button', key === selected ? 'cm-picker-opt is-on' : 'cm-picker-opt');
        o.type = 'button';
        o.setAttribute('role', 'option');
        o.setAttribute('aria-selected', String(key === selected));
        o.dataset['key'] = key;
        o.append(tile, el('span', 'cm-picker-name', name), el('span', 'cm-picker-count', String(count)));
        o.addEventListener('click', () => {
            close(list);
            onPick(key);
        });
        return o;
    };
    const all = el('span', 'conn-tile conn-tile--muted conn-tile--sm');
    all.append(icon('layers'));
    list.append(option('', 'All connectors', total, all));
    for (const c of choices) list.append(option(c.key, c.name, c.count, connectorTile(`shared_${c.key}`, false, true)));

    btn.addEventListener('click', () => {
        const opening = list.hidden;
        for (const other of document.querySelectorAll<HTMLElement>('.cm-picker-list:not([hidden])')) close(other);
        list.hidden = !opening;
        btn.setAttribute('aria-expanded', String(opening));
        if (opening) (list.querySelector('.is-on') ?? list.firstElementChild as HTMLElement | null)?.dispatchEvent(new Event('focus'));
    });
    root.addEventListener('keydown', e => {
        const k = (e as KeyboardEvent).key;
        const opts = [...list.querySelectorAll<HTMLElement>('.cm-picker-opt')];
        if (k === 'Escape' && !list.hidden) {
            close(list);
            btn.focus();
        } else if ((k === 'ArrowDown' || k === 'ArrowUp') && opts.length > 0) {
            e.preventDefault();
            if (list.hidden) {
                list.hidden = false;
                btn.setAttribute('aria-expanded', 'true');
            }
            const at = opts.indexOf(document.activeElement as HTMLElement);
            opts[Math.max(0, Math.min(opts.length - 1, at + (k === 'ArrowDown' ? 1 : -1)))]!.focus();
        }
    });
    root.append(btn, list);
    return root;
}
