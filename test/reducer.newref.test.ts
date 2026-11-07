import { describe, expect, it } from 'vitest';
import { buildSnapshot } from '../src/model/analysis';
import { initialState, reducer, type State } from '../src/state/reducer';
import { guid, input, ref } from './helpers/fixtures';

const A = '/providers/Microsoft.PowerApps/apis/shared_a';

function ready(): State {
    let s = initialState();
    s = reducer(s, { type: 'solutionsLoaded', solutions: [input().solution] });
    s = reducer(s, { type: 'selectSolution', id: input().solution.id });
    s = reducer(s, { type: 'snapshotLoaded', snapshot: buildSnapshot(input()) });
    s = reducer(s, { type: 'selectAll', ids: [guid(10), guid(11)] });
    return reducer(s, { type: 'openStudio' });
}

describe('state of the new reference form', () => {
    it('opens only in an open studio of an unmanaged solution', () => {
        expect(reducer(initialState(), { type: 'openNewReference', connectorId: A }).newReference).toBeNull();
        expect(reducer(ready(), { type: 'openNewReference', connectorId: A }).newReference).toMatchObject({ connectorId: A, reviewing: false });
        const managed = ready();
        const m = { ...managed, snapshot: { ...managed.snapshot!, solution: { ...managed.snapshot!.solution, managed: true } } };
        expect(reducer(m, { type: 'openNewReference', connectorId: A }).newReference).toBeNull();
    });
    it('closing the studio, leaving the solution or going to another step drops the form', () => {
        const open = reducer(ready(), { type: 'openNewReference', connectorId: A });
        expect(reducer(open, { type: 'closeStudio' }).newReference).toBeNull();
        expect(reducer(open, { type: 'selectSolution', id: '' }).newReference).toBeNull();
    });
    it('writing starts only from a reviewed form, and a form that is saving cannot be edited or closed', () => {
        let s = reducer(ready(), { type: 'openNewReference', connectorId: A });
        s = reducer(s, { type: 'setNewReferenceField', field: 'displayName', value: 'X' });
        expect(reducer(s, { type: 'newReferenceSaving' }).newReference!.saving).toBe(false);
        s = reducer(s, { type: 'reviewNewReference', on: true });
        s = reducer(s, { type: 'newReferenceSaving' });
        expect(s.newReference!.saving).toBe(true);
        expect(reducer(s, { type: 'setNewReferenceField', field: 'displayName', value: 'Y' }).newReference!.displayName).toBe('X');
        expect(reducer(s, { type: 'closeNewReference' }).newReference).not.toBeNull();
    });
    it('a failure keeps the typing and leaves the review', () => {
        let s = reducer(ready(), { type: 'openNewReference', connectorId: A });
        s = reducer(s, { type: 'setNewReferenceField', field: 'displayName', value: 'X' });
        s = reducer(s, { type: 'reviewNewReference', on: true });
        s = reducer(s, { type: 'newReferenceSaving' });
        s = reducer(s, { type: 'newReferenceFailed', error: 'no' });
        expect(s.newReference).toMatchObject({ displayName: 'X', saving: false, reviewing: false, error: 'no' });
    });
    it('a created reference joins the snapshot (member, used by no flow) and becomes the target of its group', () => {
        let s = reducer(ready(), { type: 'setGroup', group: { connectorId: A, from: ['sample_ref1'], target: '' } });
        s = reducer(s, { type: 'openNewReference', connectorId: A });
        const made = ref(50, { logicalName: 'sample_new', displayName: 'New', connectionId: '' });
        s = reducer(s, { type: 'referenceCreated', reference: made });
        expect(s.newReference).toBeNull();
        expect(s.snapshot!.allReferences).toContain(made);
        const view = s.snapshot!.references.find(r => r.reference.id === made.id)!;
        expect(view.flowIds).toEqual([]);
        expect(view.flags.map(f => f.kind)).toEqual(['no-connection']);
        expect(s.repointGroups[0]!.target).toBe('sample_new');
    });
    it('the same reference is never added twice', () => {
        let s = ready();
        const made = ref(50, { logicalName: 'sample_new' });
        s = reducer(s, { type: 'referenceCreated', reference: made });
        s = reducer(s, { type: 'referenceCreated', reference: made });
        expect(s.snapshot!.allReferences.filter(r => r.id === made.id)).toHaveLength(1);
    });
    it('the Used by sections open and close one by one and are kept while the form is open', () => {
        let s = reducer(ready(), { type: 'openNewReference', connectorId: A });
        s = reducer(s, { type: 'toggleNewReferenceConnection', id: 'c1' });
        s = reducer(s, { type: 'toggleNewReferenceConnection', id: 'c2' });
        s = reducer(s, { type: 'setNewReferenceField', field: 'displayName', value: 'X' });
        expect(s.newReference!.openConnections).toEqual(['c1', 'c2']);
        s = reducer(s, { type: 'toggleNewReferenceConnection', id: 'c1' });
        expect(s.newReference!.openConnections).toEqual(['c2']);
        expect(reducer(initialState(), { type: 'toggleNewReferenceConnection', id: 'c1' }).newReference).toBeNull();
    });
    it('opens already reading the connections, so the panel is drawn once', () => {
        const s = reducer(ready(), { type: 'openNewReference', connectorId: A, seed: 'abc12' });
        expect(s.newReference).toMatchObject({ seed: 'abc12', live: { status: 'loading', items: [] } });
        expect(reducer(s, { type: 'connectionsLoading' })).toBe(s); // nothing changes, so nothing is drawn again
    });
    it('the connections arrive, or fail, or are asked again', () => {
        let s = reducer(ready(), { type: 'openNewReference', connectorId: A });
        s = reducer(s, { type: 'connectionsLoaded', items: [{ name: 'c1', connectorKey: 'a', displayName: 'x', createdTime: '' }] });
        expect(s.newReference!.live).toMatchObject({ status: 'ready', error: '' });
        expect(s.newReference!.live.items).toHaveLength(1);
        s = reducer(s, { type: 'connectionsLoading' });
        expect(s.newReference!.live.status).toBe('loading');
        s = reducer(s, { type: 'connectionsFailed', error: 'denied' });
        expect(s.newReference!.live).toEqual({ status: 'unavailable', items: [], error: 'denied' });
    });
    it('an answer with no form open changes nothing', () => {
        const s = ready();
        for (const a of [{ type: 'connectionsLoaded', items: [] }, { type: 'connectionsFailed', error: 'x' }, { type: 'connectionsLoading' }] as const) expect(reducer(s, a)).toBe(s);
    });
    it('a suggestion fills the three fields, and is refused while the row is being written', () => {
        let s = reducer(ready(), { type: 'openNewReference', connectorId: A });
        const suggestion = { label: 'x', displayName: 'D', name: 'N', description: 'T' };
        s = reducer(s, { type: 'applySuggestion', suggestion });
        expect(s.newReference).toMatchObject({ displayName: 'D', name: 'N', description: 'T', nameTouched: true });
        s = reducer(s, { type: 'reviewNewReference', on: true });
        s = reducer(s, { type: 'newReferenceSaving' });
        expect(reducer(s, { type: 'applySuggestion', suggestion: { ...suggestion, displayName: 'Other' } }).newReference!.displayName).toBe('D');
    });
    it('a created reference keeps its component type in the snapshot, so it can be removed or deleted without a refresh', () => {
        const made = ref(50, { logicalName: 'sample_new' });
        const s = reducer(ready(), { type: 'referenceCreated', reference: made, componentType: 10150 });
        expect(s.snapshot!.componentTypes[made.id.toLowerCase()]).toBe(10150);
        expect(s.snapshot!.componentTypes[guid(1).toLowerCase()] ?? 'other types are kept').toBeDefined();
        expect(reducer(ready(), { type: 'referenceCreated', reference: made }).snapshot!.componentTypes[made.id.toLowerCase()]).toBeUndefined(); // no type given, none invented (T5)
    });
    it('a suggestion folds the list; it can be opened and folded again', () => {
        let s = reducer(ready(), { type: 'openNewReference', connectorId: A });
        expect(s.newReference!.suggestOpen).toBe(true);
        s = reducer(s, { type: 'applySuggestion', suggestion: { label: 'x', displayName: 'D', name: 'N', description: 'T' } });
        expect(s.newReference!.suggestOpen).toBe(false);
        s = reducer(s, { type: 'toggleSuggestions' });
        expect(s.newReference!.suggestOpen).toBe(true);
        expect(reducer(initialState(), { type: 'toggleSuggestions' }).newReference).toBeNull();
    });
    it('a card or "none" is picked; typing makes the id typed and not yet searched; a search result applies only to the text searched', () => {
        let s = reducer(ready(), { type: 'openNewReference', connectorId: A });
        s = reducer(s, { type: 'connectionsLoaded', items: [{ name: 'c1', connectorKey: 'a', displayName: 'x', createdTime: '' }] });
        s = reducer(s, { type: 'pickConnection', id: 'c1' });
        expect(s.newReference).toMatchObject({ connectionId: 'c1', connectionSource: 'card' });
        s = reducer(s, { type: 'pickConnection', id: '' });
        expect(s.newReference).toMatchObject({ connectionId: '', connectionSource: 'none' });
        s = reducer(s, { type: 'setNewReferenceField', field: 'connectionId', value: 'ghost' });
        expect(s.newReference).toMatchObject({ connectionSource: 'typed', checked: null });
        s = reducer(s, { type: 'connectionChecked', typed: 'other', verdict: 'found' }); // not what is in the field
        expect(s.newReference!.connectionSource).toBe('typed');
        s = reducer(s, { type: 'connectionChecked', typed: 'ghost', verdict: 'missing' });
        expect(s.newReference!.checked).toEqual({ id: 'ghost', verdict: 'missing' });
        s = reducer(s, { type: 'setNewReferenceField', field: 'connectionId', value: 'c1' });
        s = reducer(s, { type: 'connectionChecked', typed: 'c1', verdict: 'found' });
        expect(s.newReference).toMatchObject({ connectionSource: 'card', connectionId: 'c1' });
    });
    it('neither is accepted while the row is being written', () => {
        let s = reducer(ready(), { type: 'openNewReference', connectorId: A });
        s = reducer(s, { type: 'setNewReferenceField', field: 'displayName', value: 'X' });
        s = reducer(s, { type: 'reviewNewReference', on: true });
        s = reducer(s, { type: 'newReferenceSaving' });
        expect(reducer(s, { type: 'pickConnection', id: 'c1' })).toBe(s);
        expect(reducer(s, { type: 'connectionChecked', typed: 'c1', verdict: 'found' })).toBe(s);
    });
    it('the step starts at "check" when the write starts, follows the service, and is cleared by a failure', () => {
        let s = reducer(ready(), { type: 'openNewReference', connectorId: A });
        s = reducer(s, { type: 'setNewReferenceField', field: 'displayName', value: 'X' });
        expect(reducer(s, { type: 'newReferenceStep', step: 'write' })).toBe(s); // not writing: ignored
        s = reducer(s, { type: 'reviewNewReference', on: true });
        s = reducer(s, { type: 'newReferenceSaving' });
        expect(s.newReference!.step).toBe('check');
        s = reducer(s, { type: 'newReferenceStep', step: 'write' });
        s = reducer(s, { type: 'newReferenceStep', step: 'readback' });
        expect(s.newReference!.step).toBe('readback');
        s = reducer(s, { type: 'newReferenceStep', step: 'done' });
        expect(s.newReference!.step).toBe('done');
        expect(reducer(s, { type: 'newReferenceFailed', error: 'no' }).newReference).toMatchObject({ step: '', saving: false });
    });
});
