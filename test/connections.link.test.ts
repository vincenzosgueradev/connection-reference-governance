// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { guid, ref } from './helpers/fixtures';
import { app, q, qa, settle, type ScenarioOptions } from './helpers/scenario';

/** Feature 024 (US5): from a reference to its connection. Synthetic data only. */

const TYPE_QUERY = "solutioncomponentdefinitions?$select=solutioncomponenttype&$filter=primaryentityname eq 'connectionreference'";
const answer: ScenarioOptions['answer'] = query => (query.startsWith(TYPE_QUERY) ? [{ solutioncomponenttype: 10001 }] : undefined);

async function inReferences(over: ScenarioOptions = {}) {
    const a = await app({ answer, connectionRows: [{ name: 'conn-1' }, { name: 'conn-2' }, { name: 'conn-3' }], dependents: { [guid(1)]: [{ id: guid(10), type: 29 }] }, ...over });
    a.store.dispatch({ type: 'setView', view: 'references' });
    await settle();
    return a;
}
const links = (a: Awaited<ReturnType<typeof inReferences>>) => qa(a.root, '.refs-table .conn-link') as HTMLButtonElement[];

describe('the connection chip of a reference', () => {
    it('is a real button with a name, and opens the Connections area on that connection with its dependencies read', async () => {
        const a = await inReferences();
        const link = links(a).find(l => l.getAttribute('aria-label') === 'Open the connection conn-1 in Connections')!;
        expect(link.tagName).toBe('BUTTON');
        link.click();
        await a.controller.idle();
        await settle();
        const s = a.store.get();
        expect(s.area).toBe('connections');
        expect(s.connections.open).toEqual(['conn-1']);
        expect(s.connections.deps['conn-1']).toMatchObject({ status: 'ready' });
        const item = q(a.root, '.cm-item.is-open')!;
        expect(item.textContent).toContain('Alpha flow');
        expect(q(item, '.cm-detail .dep-group-title')).not.toBeNull();
    });
    it('does not open or close the row of the reference when it is clicked', async () => {
        const a = await inReferences();
        const before = a.store.get().expanded;
        links(a)[0]!.click();
        await a.controller.idle();
        await settle();
        expect(a.store.get().expanded).toEqual(before);
    });
    it('the solution that was open is still open when the user comes back from the area', async () => {
        const a = await inReferences();
        a.store.dispatch({ type: 'toggle', id: guid(1) });
        links(a)[0]!.click();
        await a.controller.idle();
        await settle();
        a.controller.connections!.backToSolutions();
        await settle();
        const s = a.store.get();
        expect(s.area).toBe('solutions');
        expect(s.solutionId).not.toBe('');
        expect(s.view).toBe('references');
        expect(s.selected).toEqual([guid(1)]);
        expect(q(a.root, '.refs-table')).not.toBeNull();
    });
    it('a leftover filter, connector or search never hides the connection the chip opens: the list narrows to it', async () => {
        const a = await inReferences({ connectionRows: [{ name: 'conn-1' }, { name: 'conn-2', connector: 'shared_b' }, { name: 'conn-3' }] });
        await a.controller.connections!.open();
        a.store.dispatch({ type: 'cmSearch', text: 'conn-3' });
        a.store.dispatch({ type: 'cmFilter', filter: 'broken' });
        a.store.dispatch({ type: 'cmConnector', key: 'b' });
        a.controller.connections!.backToSolutions();
        await settle();
        const link = links(a).find(l => l.getAttribute('aria-label') === 'Open the connection conn-1 in Connections')!;
        link.click();
        await a.controller.idle();
        await settle();
        const cm = a.store.get().connections;
        expect(cm).toMatchObject({ filter: 'all', connector: '', search: 'conn-1', open: ['conn-1'] });
        expect(qa(a.root, '.cm-item').map(r => q(r, '.conn-name')!.textContent)).toEqual(['conn-1@example.test']);
        expect(q(a.root, '.cm-item.is-open .cm-detail')).not.toBeNull();
    });
    it('a connection that is not in the list the user can see says so and nothing else happens', async () => {
        const a = await inReferences({ connectionRows: [{ name: 'someone-elses' }] });
        links(a)[0]!.click();
        await a.controller.idle();
        await settle();
        expect(a.store.get().connections.open).toEqual([]);
    });
    it('a reference with no connection has a chip that does nothing and says why', async () => {
        const a = await inReferences({ references: [ref(1, { connectionId: '' }), ref(2), ref(3)] });
        const none = qa(a.root, '.refs-table .chip').find(c => c.textContent === 'No connection')!;
        expect(none.title).toContain('nothing to open');
        expect(none.closest('.conn-link')).toBeNull();
        none.click();
        expect(a.store.get().area).toBe('solutions');
    });
});
