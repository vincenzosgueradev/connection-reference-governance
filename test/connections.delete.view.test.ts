// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ref } from './helpers/fixtures';
import type { ConnectionSeed, ScenarioOptions } from './helpers/scenario';

/**
 * Feature 024: the deletion dialog, with the declared flag mocked ON (it ships off). Preview, backup, the locked Apply, the
 * run with its checks, the Result and the list read again. Synthetic data only.
 */

const TYPE_QUERY = "solutioncomponentdefinitions?$select=solutioncomponenttype&$filter=primaryentityname eq 'connectionreference'";
const SEEDS: ConnectionSeed[] = [{ name: 'conn-1' }, { name: 'conn-free' }, { name: 'conn-other', connector: 'shared_b' }, { name: 'conn-dead', status: 'error' }];

async function load() {
    vi.resetModules();
    vi.doMock('../src/features', () => ({ features: { connectionDelete: true } }));
    return import('./helpers/scenario');
}

async function ready(over: ScenarioOptions = {}) {
    const m = await load();
    const answer: ScenarioOptions['answer'] = q => (q.startsWith(TYPE_QUERY) ? [{ solutioncomponenttype: 10001 }] : undefined);
    const a = await m.app({ answer, connectionRows: SEEDS.map(s => ({ ...s })), ...over });
    await a.controller.connections!.open();
    await a.controller.idle();
    await m.settle();
    await a.controller.connections!.checkAll();
    await m.settle();
    return { a, m };
}
type Ctx = Awaited<ReturnType<typeof ready>>;

const click = (c: Ctx, text: string) => c.m.buttonByText(c.a.root, text)!.click();
const dialog = (c: Ctx) => c.m.q(c.a.root, '.cm-deletion');
const confirmButton = (c: Ctx) => c.m.qa(c.a.root, '.cm-deletion .modal-actions button').find(b => /^Delete \d/.test(b.textContent!.trim())) as HTMLButtonElement;
const unlock = (c: Ctx) => {
    const code = c.a.store.get().connections.deletion!.code;
    const field = c.m.q(c.a.root, '.removal-input') as HTMLInputElement;
    field.value = code;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    (c.m.q(c.a.root, '.cm-deletion .ack .toggle') as HTMLElement).click();
    for (const name of c.a.store.get().connections.deletion!.plan.rows.filter(r => r.blocked === undefined).map(r => r.name)) c.a.store.dispatch({ type: 'cmDeletionPortal', name, on: true });
};

afterEach(() => {
    vi.doUnmock('../src/features');
});

describe('opening the dialog', () => {
    it('Delete... appears with the flag on, is off until something is ticked, and opens the Preview of the ticked ones', async () => {
        const c = await ready();
        const del = c.m.buttonByText(c.a.root, 'Delete...')!;
        expect(del.disabled).toBe(true);
        click(c, 'Select the ones with no dependency found');
        expect(c.m.buttonByText(c.a.root, 'Delete...')!.disabled).toBe(false);
        click(c, 'Delete...');
        const d = dialog(c)!;
        expect(d.textContent).toContain('Delete 3 connections permanently');
        expect(c.m.qa(d, '.cm-del-item')).toHaveLength(3);
        expect(c.m.qa(d, '.cm-del-step')).toHaveLength(3); // backup, portal, code
        expect(d.textContent).toContain('permanently removed');
        expect(c.a.calls.deletedConnections).toEqual([]); // nothing is written by opening it
    });
    it('Apply is locked until the code is pasted and the acknowledgement is on, and the wrong code keeps it locked', async () => {
        const c = await ready();
        click(c, 'Select the ones with no dependency found');
        click(c, 'Delete...');
        expect(confirmButton(c).disabled).toBe(true);
        const field = c.m.q(c.a.root, '.removal-input') as HTMLInputElement;
        field.value = 'DELETE-WRONG';
        field.dispatchEvent(new Event('input', { bubbles: true }));
        (c.m.q(c.a.root, '.cm-deletion .ack .toggle') as HTMLElement).click();
        expect(confirmButton(c).disabled).toBe(true);
        unlock(c); // fills the right code; the toggle was on, this turns it off again
        (c.m.q(c.a.root, '.cm-deletion .ack .toggle') as HTMLElement).click();
        expect(confirmButton(c).disabled).toBe(false);
    });
    it('Save backup writes the records, without an email and without any secret', async () => {
        const c = await ready();
        click(c, 'Select the ones with no dependency found');
        click(c, 'Delete...');
        click(c, 'Save backup');
        await c.m.settle();
        expect(c.a.calls.saved).toHaveLength(1);
        const saved = c.a.calls.saved[0]!;
        expect(saved.name).toMatch(/^connections-backup-\d{14}\.json$/);
        expect(saved.content).toContain('connections-before-delete');
        expect(saved.content).not.toMatch(/ann@|email|token|secret|password/i);
        expect(c.a.store.get().connections.deletion!.backupSaved).toBe(true);
        expect(dialog(c)!.textContent).toContain('Saved');
    });
    it('Cancel and Escape close it without deleting and keep the selection', async () => {
        const c = await ready();
        click(c, 'Select the ones with no dependency found');
        click(c, 'Delete...');
        click(c, 'Cancel');
        expect(dialog(c)).toBeNull();
        expect(c.a.store.get().connections.selected).toHaveLength(3);
        expect(c.a.calls.deletedConnections).toEqual([]);
    });
    it('the dialog has a name, traps focus and starts on Cancel so Enter never confirms by accident', async () => {
        const c = await ready();
        click(c, 'Select the ones with no dependency found');
        click(c, 'Delete...');
        const modal = c.m.q(c.a.root, '.cm-deletion .modal')!;
        expect(modal.getAttribute('aria-modal')).toBe('true');
        expect(modal.getAttribute('aria-labelledby')).not.toBeNull();
        expect((c.m.q(c.a.root, '.cm-deletion [data-autofocus]') as HTMLElement).textContent).toBe('Cancel');
    });
});

describe('the run and the result', () => {
    it('deletes each connection after checking it again, shows the result and reads the list again', async () => {
        const c = await ready();
        click(c, 'Select the ones with no dependency found');
        click(c, 'Delete...');
        unlock(c);
        confirmButton(c).click();
        await c.a.controller.idle();
        await c.m.settle(30);
        expect(c.a.calls.deletedConnections.map(x => x.name).sort()).toEqual(['conn-dead', 'conn-free', 'conn-other']);
        const d = dialog(c)!;
        expect(d.textContent).toContain('All changes were written');
        expect(d.textContent).toContain('Deleted and read back.');
        const figs = Object.fromEntries(c.m.qa(d, '.fig').map(f => [c.m.q(f, '.fig-label')!.textContent, c.m.q(f, '.fig-value')!.textContent]));
        expect(figs).toMatchObject({ Deleted: '3', Skipped: '0', Failed: '0' });
        // the list was read again: only the one in use is left
        expect(c.a.store.get().connections.list.items.map(r => r.name)).toEqual(['conn-1']);
        c.m.buttonByText(d, 'Close')!.click();
        expect(dialog(c)).toBeNull();
        expect(c.a.store.get().connections.selected).toEqual([]);
        expect(c.m.qa(c.a.root, '.cm-item')).toHaveLength(1);
    });
    it('a dependency that appeared since Check all skips that connection and the others go on', async () => {
        const c = await ready();
        click(c, 'Select the ones with no dependency found');
        click(c, 'Delete...');
        unlock(c);
        c.a.refs.push(ref(9, { connectionId: 'conn-free' })); // someone made a reference to it in the meantime
        confirmButton(c).click();
        await c.a.controller.idle();
        await c.m.settle(30);
        expect(c.a.calls.deletedConnections.map(x => x.name).sort()).toEqual(['conn-dead', 'conn-other']);
        const d = dialog(c)!;
        expect(d.textContent).toContain('Partly done');
        expect(d.textContent).toContain('Checked again just before');
    });
    it('a failure of one row is reported on that row and the run goes on', async () => {
        const c = await ready({ deleteConnectionError: name => (name === 'conn-free' ? 'Forbidden: not your connection' : undefined) });
        click(c, 'Select the ones with no dependency found');
        click(c, 'Delete...');
        unlock(c);
        confirmButton(c).click();
        await c.a.controller.idle();
        await c.m.settle(30);
        const d = dialog(c)!;
        expect(d.textContent).toContain('Forbidden: not your connection');
        expect(c.a.calls.deletedConnections.map(x => x.name).sort()).toEqual(['conn-dead', 'conn-other']);
    });
    it('while it runs nothing can be left: no buttons, every control disabled, the state refuses a close', async () => {
        let release!: () => void;
        const gate = new Promise<void>(r => { release = r; });
        const c = await ready({ beforeDeleteConnection: () => gate });
        click(c, 'Select the ones with no dependency found');
        click(c, 'Delete...');
        unlock(c);
        confirmButton(c).click();
        await c.m.settle();
        const d = dialog(c)!;
        expect(d.textContent).toContain('Deleting connections');
        expect(c.m.q(d, '.run-ring')).not.toBeNull();
        expect(c.m.q(d, '.cm-runlog')).not.toBeNull();
        expect(c.m.qa(d, '.modal-actions button')).toHaveLength(0);
        expect(c.m.q(d, '.modal-close')).toBeNull(); // no cross while it runs (the author, 2026-11-12)
        for (const b of c.m.qa(c.a.root, 'button') as HTMLButtonElement[]) expect(b.disabled, b.textContent ?? '').toBe(true);
        c.a.controller.connections!.closeDeletion();
        expect(c.a.store.get().connections.deletion).not.toBeNull();
        release();
        await c.a.controller.idle();
        await c.m.settle(30);
        expect(c.a.store.get().connections.deletion!.step).toBe('result');
    });
    it('Delete stays locked until every connection is confirmed in the portal, one by one', async () => {
        const c = await ready();
        click(c, 'Select the ones with no dependency found');
        click(c, 'Delete...');
        const code = c.a.store.get().connections.deletion!.code;
        const field = c.m.q(c.a.root, '.removal-input') as HTMLInputElement;
        field.value = code;
        field.dispatchEvent(new Event('input', { bubbles: true }));
        (c.m.q(c.a.root, '.cm-deletion .ack .toggle') as HTMLElement).click();
        expect(confirmButton(c).disabled).toBe(true); // code and acknowledgement are not enough
        const boxes = c.m.qa(c.a.root, '.cm-portal-pick') as HTMLElement[];
        expect(boxes.length).toBeGreaterThan(0);
        expect(c.m.qa(c.a.root, '.cm-portal-item button').some(b => b.textContent!.includes('Copy address'))).toBe(true);
        for (const b of boxes.slice(0, -1)) b.click();
        expect(confirmButton(c).disabled).toBe(boxes.length > 1);
        (c.m.qa(c.a.root, '.cm-portal-pick') as HTMLElement[]).at(-1)!.click();
        expect(confirmButton(c).disabled).toBe(false);
    });
    it('Save report saves a file with every row', async () => {
        const c = await ready();
        click(c, 'Select the ones with no dependency found');
        click(c, 'Delete...');
        unlock(c);
        confirmButton(c).click();
        await c.a.controller.idle();
        await c.m.settle(30);
        click(c, 'Save report');
        await c.m.settle();
        const report = c.a.calls.saved.find(s => s.name.startsWith('report-delete-connections'))!;
        expect(report).toBeDefined();
        expect(JSON.parse(report.content).rows).toHaveLength(3);
    });
});

describe('the list of the portal confirmation keeps its place on every tick (the author, 2026-11-12: it jumped to the top)', () => {
    it('is redrawn with the same scroll position', async () => {
        const c = await ready();
        click(c, 'Select the ones with no dependency found');
        click(c, 'Delete...');
        const list = c.m.q(c.a.root, '.cm-portal-list') as HTMLElement;
        list.scrollTop = 40;
        (c.m.qa(c.a.root, '.cm-portal-pick') as HTMLElement[])[0]!.click();
        const after = c.m.q(c.a.root, '.cm-portal-list') as HTMLElement;
        expect(after.scrollTop).toBe(40);
    });
});

describe('the toggle keeps its shape (the author, 2026-11-12: the knob was deformed)', () => {
    it('never shrinks in a row and its knob stays a circle', async () => {
        const css = (await import('node:fs')).readFileSync(`${process.cwd()}/src/styles.css`, 'utf8');
        expect(css).toMatch(/\.toggle \{ flex: none; box-sizing: border-box; min-width: 66px; \}/);
        expect(css).toMatch(/\.toggle::after \{[^}]*aspect-ratio: 1 \/ 1/);
    });
});

describe('Select all in the portal confirmation (the author, 2026-11-12)', () => {
    it('confirms every connection of the list in one go and Clear all takes them back', async () => {
        const c = await ready();
        click(c, 'Select the ones with no dependency found');
        click(c, 'Delete...');
        const total = c.a.store.get().connections.deletion!.plan.rows.filter(r => r.blocked === undefined).length;
        expect(total).toBeGreaterThan(1);
        click(c, 'Select all');
        expect(c.a.store.get().connections.deletion!.portalChecked).toHaveLength(total);
        expect(c.m.buttonByText(c.a.root, 'Clear all')).toBeDefined();
        click(c, 'Clear all');
        expect(c.a.store.get().connections.deletion!.portalChecked).toEqual([]);
        expect(c.m.buttonByText(c.a.root, 'Select all')).toBeDefined();
    });
});

describe('the lists of the dialog keep their place on the toggle (the author, 2026-11-12: it scrolled to the top)', () => {
    it('keeps the scroll of the list of what goes when the acknowledgement is switched', async () => {
        const c = await ready();
        click(c, 'Select the ones with no dependency found');
        click(c, 'Delete...');
        (c.m.q(c.a.root, '.cm-del-list') as HTMLElement).scrollTop = 55;
        (c.m.q(c.a.root, '.cm-deletion .ack .toggle') as HTMLElement).click();
        expect((c.m.q(c.a.root, '.cm-del-list') as HTMLElement).scrollTop).toBe(55);
    });
});
