// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { guid } from './helpers/fixtures';
import { app, buttonByText, q, qa, settle, type ConnectionSeed, type ScenarioOptions } from './helpers/scenario';

vi.mock('../src/features', () => ({ features: { connectionDelete: false } }));

/** Feature 024: the area with the deletion switched off (how it ships until the route is pinned): read only, Copy portal address. */

const TYPE_QUERY = "solutioncomponentdefinitions?$select=solutioncomponenttype&$filter=primaryentityname eq 'connectionreference'";
const answer: ScenarioOptions['answer'] = query => (query.startsWith(TYPE_QUERY) ? [{ solutioncomponenttype: 10001 }] : undefined);
const SEEDS: ConnectionSeed[] = [{ name: 'conn-1' }, { name: 'conn-free' }, { name: 'conn-other', connector: 'shared_b' }, { name: 'conn-dead', status: 'error' }];

async function open(opts: ScenarioOptions = {}) {
    const a = await app({ answer, connectionRows: SEEDS.map(s => ({ ...s })), dependents: { [guid(1)]: [{ id: guid(10), type: 29 }] }, ...opts });
    await a.controller.connections!.open();
    await a.controller.idle();
    await settle();
    return a;
}
const byLabel = (a: Awaited<ReturnType<typeof open>>, label: string) => qa(a.root, '[aria-label]').find(e => e.getAttribute('aria-label') === label) as HTMLButtonElement;
const openRow = async (a: Awaited<ReturnType<typeof open>>, label: string) => {
    byLabel(a, `Show details of ${label}`).click();
    await a.controller.idle();
    await settle();
};

describe('the deletion is switched off', () => {
    it('no Delete exists anywhere in the area and each connection offers Copy portal address', async () => {
        const a = await open();
        await a.controller.connections!.checkAll();
        await settle();
        buttonByText(a.root, 'Select the ones with no dependency found')!.click();
        expect(buttonByText(a.root, 'Delete...')).toBeUndefined();
        expect(qa(a.root, 'button').some(b => /delete/i.test(b.textContent ?? ''))).toBe(false);
        await openRow(a, 'conn-free@example.test');
        buttonByText(a.root, 'Copy portal address')!.click();
        await settle();
        expect(a.calls.copied).toEqual(['https://make.powerapps.com/environments/env-1/connections/shared_a/conn-free/details']);
        expect(q(a.root, '.cm-portal-hint')!.textContent).toContain('switched off');
        expect(q(a.root, '.cm-portal-hint')!.textContent).toContain('open this connection in the Maker portal');
    });
    it('the controller does nothing when a deletion is asked for anyway', async () => {
        const a = await open();
        await a.controller.connections!.checkAll();
        await settle();
        buttonByText(a.root, 'Select the ones with no dependency found')!.click();
        a.controller.connections!.openDeletion();
        expect(a.store.get().connections.deletion).toBeNull();
        expect(a.calls.deletedConnections).toEqual([]);
    });
    it('the whole area, driven end to end, never writes', async () => {
        const a = await open();
        await openRow(a, 'conn-1@example.test');
        await a.controller.connections!.checkAll();
        await settle();
        buttonByText(a.root, 'Select the ones with no dependency found')!.click();
        buttonByText(a.root, 'Refresh')!.click();
        await a.controller.idle();
        await settle();
        expect(a.calls.updates).toEqual([]);
        expect(a.calls.created).toEqual([]);
        expect(a.calls.added).toEqual([]);
        expect(a.calls.deletedConnections).toEqual([]);
    });
});

