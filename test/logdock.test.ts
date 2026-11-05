// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearLog, getEntries, log, MAX_ENTRIES } from '../src/services/log';
import { mountLogDock } from '../src/views/logDock';

/** Feature 018: the log dock. */

const q = (root: ParentNode, sel: string) => root.querySelector<HTMLElement>(sel);
const button = (root: ParentNode, text: string) => [...root.querySelectorAll('button')].find(b => b.textContent?.includes(text))!;

const stops: (() => void)[] = [];
afterEach(() => { stops.splice(0).forEach(s => s()); document.body.replaceChildren(); });

function dock(save = vi.fn(async () => true)) {
    clearLog();
    window.localStorage.clear();
    const root = document.createElement('div');
    document.body.append(root);
    const stop = mountLogDock(root, save);
    stops.push(stop);
    return { root, save, stop };
}

describe('the log dock', () => {
    beforeEach(() => window.localStorage.clear());

    it('is closed at first: the count, the last message, no list', () => {
        const { root } = dock();
        log('Ready.');
        log('Read 6 flows.', 'success');
        expect(q(root, '.log-dock')!.className).not.toContain('is-open');
        expect(q(root, '.log-dock-toggle')!.getAttribute('aria-expanded')).toBe('false');
        expect(q(root, '.log-dock-toggle .chip')!.textContent).toBe('2');
        expect(q(root, '.log-dock-last')!.textContent).toContain('Read 6 flows.');
        expect(q(root, '.log-dock-list')).toBeNull();
    });

    it('opens and closes, shows every entry with its level, and remembers the choice', () => {
        const { root } = dock();
        log('one');
        log('two', 'error');
        q(root, '.log-dock-toggle')!.click();
        expect(q(root, '.log-dock')!.className).toContain('is-open');
        expect([...root.querySelectorAll('.log-dock-list .log-entry')].map(r => r.className)).toEqual(['log-entry log-entry--info', 'log-entry log-entry--error']);
        expect(q(root, '.log-dock-last')).toBeNull();
        expect(window.localStorage.getItem('crg.logOpen')).toBe('1');
        q(root, '.log-dock-toggle')!.click();
        expect(q(root, '.log-dock-list')).toBeNull();
    });

    it('counts warnings and errors as things to check', () => {
        const { root } = dock();
        log('a', 'warning');
        log('b', 'error');
        log('c', 'success');
        expect(q(root, '.log-dock-toggle .chip--warning')!.textContent).toContain('2 to check');
    });

    it('a new entry appears in an open dock without closing it', () => {
        const { root } = dock();
        q(root, '.log-dock-toggle')!.click();
        expect(q(root, '.log-dock-empty')!.textContent).toBe('Nothing logged yet.');
        log('later');
        expect(root.querySelectorAll('.log-dock-list .log-entry')).toHaveLength(1);
    });

    it('Clear empties the log; Save writes the entries as JSON through the host; both are closed when there is nothing', async () => {
        const { root, save } = dock();
        expect((button(root, 'Clear') as HTMLButtonElement).disabled).toBe(true);
        expect((button(root, 'Save') as HTMLButtonElement).disabled).toBe(true);
        log('x');
        button(root, 'Save').click();
        expect(save).toHaveBeenCalledTimes(1);
        const [name, content] = save.mock.calls[0] as unknown as [string, string];
        expect(name).toBe('log.json');
        expect(JSON.parse(content)).toHaveLength(1);
        button(root, 'Clear').click();
        expect(getEntries()).toHaveLength(0);
        expect(q(root, '.log-dock-toggle .chip')!.textContent).toBe('0');
    });

    it('keeps only the newest entries', () => {
        clearLog();
        for (let i = 0; i < MAX_ENTRIES + 10; i++) log(`m${i}`);
        expect(getEntries()).toHaveLength(MAX_ENTRIES);
        expect(getEntries()[0]!.message).toBe('m10');
    });

    it('works when the browser storage is blocked', () => {
        const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
        const { root } = dock();
        expect(q(root, '.log-dock')).not.toBeNull();
        spy.mockRestore();
    });
});
