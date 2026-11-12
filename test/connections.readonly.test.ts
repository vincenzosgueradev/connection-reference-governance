// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createController } from '../src/controller';
import type { Host } from '../src/host';
import { initialState } from '../src/state/reducer';
import { createStore } from '../src/state/store';
import { mountMain } from '../src/views/main';
import { guid } from './helpers/fixtures';
import { buttonByText, q, qa, scenario, settle } from './helpers/scenario';

/**
 * Feature 024, FR-2411 and FR-2412: the Connections area never writes. Every member of the host that changes something is
 * wrapped, the area is driven through everything it offers, and none of them may be called.
 */

vi.mock('../src/features', () => ({ features: { connectionDelete: false } }));

const WRITE_MEMBERS = ['update', 'create', 'remove', 'addToSolution', 'removeFromSolution', 'deleteConnection'] as const;

describe('the Connections area writes nothing', () => {
    it('open, read rows, check all, select, copy the address, refresh, ask for a deletion: no write member is ever called', async () => {
        document.body.innerHTML = '<nav id="breadcrumb" class="breadcrumb" hidden></nav><main class="main-content"><div id="content"></div></main>';
        const TYPE_QUERY = "solutioncomponentdefinitions?$select=solutioncomponenttype&$filter=primaryentityname eq 'connectionreference'";
        const sc = scenario({
            answer: query => (query.startsWith(TYPE_QUERY) ? [{ solutioncomponenttype: 10001 }] : undefined),
            connectionRows: [{ name: 'conn-1' }, { name: 'conn-free' }, { name: 'conn-dead', status: 'error' }],
            dependents: { [guid(1)]: [{ id: guid(10), type: 29 }] },
            apps: [{ name: 'app-1', displayName: 'Orders app', connections: ['conn-1'] }],
        });
        const spies = Object.fromEntries(WRITE_MEMBERS.map(m => [m, vi.fn()])) as Record<(typeof WRITE_MEMBERS)[number], ReturnType<typeof vi.fn>>;
        const host: Host = { ...sc.host };
        for (const m of WRITE_MEMBERS) {
            const real = (sc.host as unknown as Record<string, (...a: unknown[]) => unknown>)[m]!;
            (host as unknown as Record<string, unknown>)[m] = (...args: unknown[]) => {
                (spies[m]! as unknown as (...a: unknown[]) => void)(...args);
                return real.apply(sc.host, args);
            };
        }
        const store = createStore(initialState());
        const controller = createController(host, store, () => 1_000_000, 5, undefined, 0);
        const root = document.getElementById('content')!;
        mountMain(root, store, controller, controller.environment);
        await controller.start();

        const c = controller.connections!;
        await c.open();
        await settle();
        await c.toggleOpen('conn-1');
        await c.toggleOpen('conn-free');
        await c.checkAll();
        await settle();
        buttonByText(root, 'Select the ones with no dependency found')!.click();
        await c.copyAddress();
        c.openDeletion(); // the flag is off: nothing happens
        c.confirmDeletion();
        await c.saveBackup();
        await c.checkAgain('conn-1');
        await c.refresh();
        await settle();

        for (const m of WRITE_MEMBERS) expect(spies[m]!, m).not.toHaveBeenCalled();
        expect(q(root, '.cm-list')).not.toBeNull();
        expect(qa(root, 'button').some(b => /^delete/i.test((b.textContent ?? '').trim()))).toBe(false);
        expect(store.get().connections.deletion).toBeNull();
    });
});
