// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { addUsage, connectorIdOf, rowsOfUsagePage, skipTokenOf, usageText } from '../src/model/connectorUsage';
import { loadConnectorUsage } from '../src/services/connections';
import { guid } from './helpers/fixtures';
import { app, q, settle, type ConnectionSeed, type ScenarioOptions } from './helpers/scenario';

// Feature 024, FR-2425: the inventory hint (how many flows, apps and agents use a connector). Synthetic data only.

describe('the model of the inventory hint', () => {
    it('the same connector is named in all its forms', () => {
        expect(['shared_webcontents', '/providers/Microsoft.PowerApps/apis/shared_webcontents', 'webcontents', 'Shared-WebContents'].map(connectorIdOf)).toEqual(['webcontents', 'webcontents', 'webcontents', 'webcontents']);
    });
    it('counts a resource once per connector, by kind, from objects or from a JSON string', () => {
        const into = {};
        addUsage(into, [
            { type: 'microsoft.powerautomate/cloudflows', connectors: [{ connectorId: 'shared_a', operations: [{}, {}] }, { connectorId: 'shared_a' }] },
            { type: 'microsoft.powerautomate/agentflows', connectors: JSON.stringify([{ connectorId: 'shared_a' }]) },
            { type: 'microsoft.powerapps/canvasapps', properties: { powerPlatformConnectors: [{ connectorId: 'shared_a' }, { connectorId: 'shared_b' }] } },
            { type: 'microsoft.copilotstudio/agents', connectors: [{ connectorId: 'shared_b' }] },
            { type: 'something.else/x', connectors: [{ connectorId: 'shared_a' }] },
            { type: 'microsoft.powerautomate/cloudflows', connectors: 'not json' },
        ]);
        expect(into).toEqual({ a: { flows: 2, apps: 1, agents: 0 }, b: { flows: 0, apps: 1, agents: 1 } });
    });
    it('reads the rows and the next token whatever the envelope', () => {
        expect(rowsOfUsagePage({ data: [{ type: 'x' }] })).toHaveLength(1);
        expect(rowsOfUsagePage({ body: { data: [{}, {}] } })).toHaveLength(2);
        expect(rowsOfUsagePage('nope')).toEqual([]);
        expect(skipTokenOf({ skipToken: ' t ' })).toBe('t');
        expect(skipTokenOf({})).toBe('');
    });
    it('says it as a hint, in the singular and the plural, and is silent when nothing uses the connector', () => {
        const map = { a: { flows: 1, apps: 3, agents: 0 }, z: { flows: 0, apps: 0, agents: 0 } };
        expect(usageText(map, 'shared_a', 'Alpha')).toBe('In this environment 1 flow, 3 apps use the Alpha connector. The inventory does not say which connection each one uses, so some of them may use this one.');
        expect(usageText(map, 'shared_z', 'Zed')).toBeUndefined();
        expect(usageText(map, 'shared_q', 'Q')).toBeUndefined();
        expect(usageText(null, 'shared_a', 'Alpha')).toBeUndefined();
    });
});

describe('the service', () => {
    it('pages through the inventory with the token and returns the counts; a failure is a value', async () => {
        const pages = [{ data: [{ type: 'microsoft.powerautomate/cloudflows', connectors: [{ connectorId: 'shared_a' }] }], skipToken: 't1' }, { data: [{ type: 'microsoft.powerapps/canvasapps', connectors: [{ connectorId: 'shared_a' }] }] }];
        const seen: string[] = [];
        const host = { queryConnectorUsage: async (_e: string, t = '') => { seen.push(t); return pages[t === '' ? 0 : 1]; } } as never;
        const ok = await loadConnectorUsage(host, 'env-1');
        expect(ok).toMatchObject({ ok: true, value: { usage: { a: { flows: 1, apps: 1, agents: 0 } } } });
        expect(seen).toEqual(['', 't1']);
        const bad = await loadConnectorUsage({ queryConnectorUsage: async () => { throw new Error('ClientScopeAuthorizationFailed'); } } as never, 'env-1');
        expect(bad).toMatchObject({ ok: false, error: expect.stringContaining('not allowed to call this API') });
    });
});

const TYPE_QUERY = "solutioncomponentdefinitions?$select=solutioncomponenttype&$filter=primaryentityname eq 'connectionreference'";
const answer: ScenarioOptions['answer'] = query => (query.startsWith(TYPE_QUERY) ? [{ solutioncomponenttype: 10001 }] : undefined);
const SEEDS: ConnectionSeed[] = [{ name: 'conn-1', displayName: 'one@example.test', status: 'connected' }, { name: 'conn-free', displayName: 'free@example.test', status: 'connected' }];

describe('the area', () => {
    it('shows the hint under a connection that nothing was found for, and goes on when the inventory is refused', async () => {
        const usage = [{ type: 'microsoft.powerautomate/cloudflows', connectors: [{ connectorId: 'shared_a' }] }];
        const a = await app({ answer, connectionRows: SEEDS.map(s => ({ ...s })), dependents: { [guid(1)]: [{ id: guid(10), type: 29 }] }, usage });
        await a.controller.connections!.open();
        await a.controller.idle();
        await settle();
        expect(a.store.get().connections.usage.status).toBe('ready');
        (Array.from(a.root.querySelectorAll('[aria-label]')).find(e => e.getAttribute('aria-label') === 'Show details of free@example.test') as HTMLButtonElement).click();
        await a.controller.idle();
        await settle();
        // the inventory names a flow that has no row in the workflow table: it cannot be tied to a connection, and that is said
        expect(a.root.textContent).toContain('could not be tied to a connection');
        const refused = await app({ answer, connectionRows: SEEDS.map(s => ({ ...s })), usageFail: 'ClientScopeAuthorizationFailed' });
        await refused.controller.connections!.open();
        await refused.controller.idle();
        await settle();
        expect(refused.store.get().connections.usage.status).toBe('failed');
        expect(q(refused.root, '.cm-item')).not.toBeNull(); // the list and everything else work
    });
});

describe('the flows the inventory names are read and told apart (the author, 2026-11-12: do all the calls and cross the data)', () => {
    const W1 = '11111111-1111-4111-8111-111111111111';
    const W2 = '22222222-2222-4222-8222-222222222222';
    const W3 = '33333333-3333-4333-8333-333333333333';
    const W4 = '44444444-4444-4444-8444-444444444444';
    const row = (name: string) => ({ name, connectorKey: 'shared_a', connectorName: 'A', displayName: name, status: 'connected' as const, statusDetail: '', createdTime: '', modifiedTime: '', creator: { name: 'Ann', email: '' } });
    const flow = (id: string, name: string) => ({ type: 'microsoft.powerautomate/cloudflows', id: `res-${id}`, displayName: name, workflowId: id, connectors: [{ connectorId: 'shared_a' }] });
    const refOf = (logical: string) => `"connectionReferenceLogicalName":"${logical}"`;

    it('a flow that names the connection directly counts, one whose references hold another connection does not, an unreadable one blocks the verdict', async () => {
        const { emptyWorld, worldHost } = await import('./helpers/connectionsWorld');
        const { loadConnectionDependencies, makeContext } = await import('../src/services/connections');
        const w = emptyWorld({
            connections: [{ name: 'c-mine' }, { name: 'c-other' }],
            references: [{ id: '99999999-9999-4999-8999-999999999999', logicalName: 'ref_other', displayName: 'Other', connection: 'c-other' }],
            usage: [flow(W1, 'Direct'), flow(W2, 'Elsewhere'), flow(W3, 'Gone')],
            flowDefs: { [W1]: { name: 'Direct', clientdata: 'x shared-a-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa x' }, [W2]: { name: 'Elsewhere', clientdata: refOf('ref_other') } },
        });
        // the connection of the first flow is named exactly as it appears in the definition
        const mine = row('shared-a-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
        const h = worldHost(w);
        const report = await loadConnectionDependencies(h, makeContext(h, 'env-1'), mine);
        expect(report.dependents.map(d => [d.name, d.via])).toContainEqual(['Direct', 'the inventory']);
        expect(report.dependents.some(d => d.name === 'Elsewhere')).toBe(false);
        expect(report.sources.flows).toMatchObject({ status: 'failed' });
        expect(report.verdict).toBe('in-use'); // something was found, so it is in use whatever else is unclear
        expect(JSON.stringify(report.sources.flows)).toContain('Gone');
    });

    it('with nothing found and a flow that cannot be read the verdict is that it could not be checked, never No dependency found', async () => {
        const { emptyWorld, worldHost } = await import('./helpers/connectionsWorld');
        const { loadConnectionDependencies, makeContext } = await import('../src/services/connections');
        const h = worldHost(emptyWorld({ connections: [{ name: 'c-1' }], usage: [flow(W4, 'Hidden')] }));
        const report = await loadConnectionDependencies(h, makeContext(h, 'env-1'), row('c-1'));
        expect(report.verdict).toBe('unchecked-source');
        expect(JSON.stringify(report.sources.flows)).toContain('Hidden');
    });

    it('when every flow of the connector is read and none uses this connection, it stays No dependency found and says what was read', async () => {
        const { emptyWorld, worldHost } = await import('./helpers/connectionsWorld');
        const { loadConnectionDependencies, makeContext } = await import('../src/services/connections');
        const h = worldHost(emptyWorld({
            connections: [{ name: 'c-1' }, { name: 'c-x' }],
            references: [{ id: '99999999-9999-4999-8999-999999999999', logicalName: 'ref_x', displayName: 'X', connection: 'c-x' }],
            usage: [flow(W1, 'Other one')],
            flowDefs: { [W1]: { name: 'Other one', clientdata: refOf('ref_x') } },
        }));
        const report = await loadConnectionDependencies(h, makeContext(h, 'env-1'), row('c-1'));
        expect(report.verdict).toBe('none-found');
        expect(JSON.stringify(report.sources.flows)).toContain('1 flow of this connector read, 0 use it, 1 use another connection');
        expect(report.elsewhere).toEqual([{ name: 'Other one', references: [{ name: 'X', connection: 'c-x' }] }]); // named, with the reference and the connection it holds, to compare with the portal
    });

    it('a flow whose reference is unknown is not counted as using another connection: it blocks the verdict', async () => {
        const { emptyWorld, worldHost } = await import('./helpers/connectionsWorld');
        const { loadConnectionDependencies, makeContext } = await import('../src/services/connections');
        const h = worldHost(emptyWorld({
            connections: [{ name: 'c-1' }],
            usage: [flow(W1, 'Odd one')],
            flowDefs: { [W1]: { name: 'Odd one', clientdata: refOf('ref_nobody_knows') } }, // read, but its reference is not in the environment
        }));
        const report = await loadConnectionDependencies(h, makeContext(h, 'env-1'), row('c-1'));
        expect(report.verdict).toBe('unchecked-source');
        expect(report.elsewhere).toEqual([]);
        expect(JSON.stringify(report.sources.flows)).toContain('Odd one');
    });

    it('an inventory that is refused changes nothing about the verdict', async () => {
        const { emptyWorld, worldHost } = await import('./helpers/connectionsWorld');
        const { loadConnectionDependencies, makeContext } = await import('../src/services/connections');
        const h = worldHost(emptyWorld({ connections: [{ name: 'c-1' }] }));
        h.queryConnectorUsage = async () => { throw new Error('ClientScopeAuthorizationFailed'); };
        const report = await loadConnectionDependencies(h, makeContext(h, 'env-1'), row('c-1'));
        expect(report.verdict).toBe('none-found');
    });
});
