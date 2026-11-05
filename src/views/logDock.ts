import { clearLog, getEntries, subscribeLog, toJson, type LogEntry, type LogLevel } from '../services/log';
import { button, chip, el, icon } from '../ui/components';

/**
 * The log dock: a bar that is always at the bottom of the window. Closed it shows the number of entries, how many are
 * warnings or errors, and the last message; open it shows the whole list, newest at the bottom. It can be cleared and
 * saved to a file the user chooses. DOM only; the entries come from services/log.
 */

const KEY = 'crg.logOpen';

function readOpen(): boolean {
    try {
        return window.localStorage.getItem(KEY) === '1';
    } catch {
        return false; // storage can be blocked: the dock still works
    }
}

function writeOpen(open: boolean): void {
    try {
        window.localStorage.setItem(KEY, open ? '1' : '0');
    } catch {
        // a convenience only
    }
}

const GLYPH: Record<LogLevel, string> = { info: 'info', success: 'check-circle', warning: 'alert-triangle', error: 'x-circle' };

const clock = (e: LogEntry): string => new Date(e.timestamp).toTimeString().slice(0, 8);

export function mountLogDock(root: HTMLElement, save: (name: string, content: string) => Promise<boolean>): () => void {
    let open = readOpen();
    let stick = true; // the list follows the newest entry until the user scrolls up

    const draw = () => {
        const entries = getEntries();
        const problems = entries.filter(e => e.level === 'warning' || e.level === 'error').length;
        const last = entries[entries.length - 1];
        const previousList = root.querySelector<HTMLElement>('.log-dock-list');
        if (previousList) stick = previousList.scrollTop + previousList.clientHeight >= previousList.scrollHeight - 8;
        const keptTop = previousList?.scrollTop ?? 0;
        // the bar is rebuilt on every entry: the button that had the focus gets it back
        const focusedKey = root.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset['dock'] : undefined;

        const dock = el('section', open ? 'log-dock is-open' : 'log-dock');
        dock.setAttribute('aria-label', 'Log');

        const bar = el('div', 'log-dock-bar');
        const toggle = el('button', 'log-dock-toggle');
        toggle.type = 'button';
        toggle.dataset['dock'] = 'toggle';
        toggle.setAttribute('aria-expanded', String(open));
        toggle.setAttribute('aria-controls', 'log-dock-list');
        toggle.title = open ? 'Close the log' : 'Open the log';
        toggle.append(icon('list'), el('span', 'log-dock-title', 'Log'), chip(String(entries.length), 'info'));
        if (problems > 0) toggle.append(chip(`${problems} to check`, 'warning', 'alert-triangle'));
        if (!open && last) {
            const line = el('span', `log-dock-last log-entry--${last.level}`);
            line.append(el('span', 'log-dock-time', clock(last)), last.message);
            toggle.append(line);
        }
        toggle.append(icon('chevron-down', 'log-dock-caret'));
        toggle.addEventListener('click', () => {
            open = !open;
            stick = true;
            writeOpen(open);
            draw();
        });
        bar.append(toggle);

        const actions = el('div', 'log-dock-actions');
        const clear = button('Clear', 'secondary', () => clearLog(), true);
        clear.prepend(icon('trash', 'icon--sm'));
        clear.dataset['dock'] = 'clear';
        clear.disabled = entries.length === 0;
        const saveBtn = button('Save', 'secondary', () => void save('log.json', toJson()).catch(() => false), true);
        saveBtn.prepend(icon('save', 'icon--sm'));
        saveBtn.dataset['dock'] = 'save';
        saveBtn.disabled = entries.length === 0;
        actions.append(clear, saveBtn);
        bar.append(actions);
        dock.append(bar);

        if (open) {
            const list = el('div', 'log-dock-list');
            list.id = 'log-dock-list';
            list.setAttribute('role', 'log');
            list.setAttribute('aria-live', 'polite');
            if (entries.length === 0) list.append(el('p', 'muted log-dock-empty', 'Nothing logged yet.'));
            for (const e of entries) {
                const row = el('div', `log-entry log-entry--${e.level}`);
                row.append(icon(GLYPH[e.level], 'icon--sm'), el('span', 'log-timestamp', clock(e)), el('span', 'log-message', e.message));
                list.append(row);
            }
            dock.append(list);
            queueMicrotask(() => {
                list.scrollTop = stick ? list.scrollHeight : keptTop; // a reader who scrolled up keeps the place
            });
        }
        root.replaceChildren(dock);
        if (focusedKey) root.querySelector<HTMLElement>(`[data-dock="${focusedKey}"]:not(:disabled)`)?.focus();
    };

    const stop = subscribeLog(draw);
    draw();
    return stop;
}
