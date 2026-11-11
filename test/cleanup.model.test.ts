import { describe, expect, it } from 'vitest';
import { buildSnapshot } from '../src/model/analysis';
import { cleanupFigures, duplicateGroups, emptyCleanup, groupKeyOf, keeperOf, mergeInput, pruneCleanup, unreadableFlows, unusedReferences } from '../src/model/cleanup';
import { flow, guid, input, ref, solution } from './helpers/fixtures';

/** Feature 022: what is unused, what is duplicated, which one to keep and what a merge needs. Synthetic data only. */

const B = '/providers/Microsoft.PowerApps/apis/shared_b';
const snap = (refs: ReturnType<typeof ref>[], flows: ReturnType<typeof flow>[] = [], over = {}) =>
    buildSnapshot(input({ references: refs, memberReferenceIds: refs.map(r => r.id), flows, ...over }));

describe('unusedReferences', () => {
    it('lists the member references no flow uses, by name, and leaves out the used ones', () => {
        const refs = [ref(1), ref(2, { displayName: 'Alpha' }), ref(3, { displayName: 'Beta' })];
        const u = unusedReferences(snap(refs, [flow(10, ['sample_ref1'])]));
        expect(u.map(x => x.reference.displayName)).toEqual(['Alpha', 'Beta']);
    });
    it('knows the ones that were never connected, and the ones that duplicate another', () => {
        const refs = [ref(1, { connectionId: 'c' }), ref(2, { connectionId: 'C' }), ref(3, { connectionId: '' })];
        const u = unusedReferences(snap(refs, [flow(10, ['sample_ref1'])]));
        const by = (n: string) => u.find(x => x.reference.logicalName === n)!;
        expect(by('sample_ref3').neverConnected).toBe(true);
        expect(by('sample_ref2')).toMatchObject({ neverConnected: false, duplicateOf: 'Ref 1' });
        expect(by('sample_ref3').duplicateOf).toBeUndefined();
    });
    it('says a reference duplicates the one the user chose to keep, not only the suggested one', () => {
        const refs = [ref(1, { connectionId: 'c' }), ref(2, { connectionId: 'c' }), ref(3, { connectionId: 'c' })];
        const s = snap(refs, [flow(10, ['sample_other'])]);
        const key = duplicateGroups(s)[0]!.key;
        const u = unusedReferences(s, { ...emptyCleanup('unused'), keepers: { [key]: refs[2]!.id } });
        const by = (n: string) => u.find(x => x.reference.logicalName === n)!;
        expect(by('sample_ref1').duplicateOf).toBe('Ref 3');
        expect(by('sample_ref2').duplicateOf).toBe('Ref 3');
        expect(by('sample_ref3').duplicateOf).toBeUndefined(); // the one that is kept duplicates nobody
    });
    it('lists a managed reference but never lets it be ticked', () => {
        const [m] = unusedReferences(snap([ref(1, { managed: true })]));
        expect(m!.blocked).toBe('Managed: read-only.');
    });
    it('is empty when every reference is used', () => expect(unusedReferences(snap([ref(1)], [flow(10, ['sample_ref1'])]))).toEqual([]));
    it('counts the flows that could not be read, since they might use a reference that looks unused', () => {
        const bad = flow(11, [], { clientData: 'not json' });
        const s = snap([ref(1)], [bad]);
        expect(s.flows[0]!.unreadable).toBe(true);
        expect(unreadableFlows(s)).toBe(1);
    });
});

describe('duplicateGroups', () => {
    it('groups member references of one connector that hold the same connection, ignoring capitals', () => {
        const refs = [ref(1, { connectionId: 'abc' }), ref(2, { connectionId: 'ABC' }), ref(3, { connectionId: 'zzz' })];
        const g = duplicateGroups(snap(refs));
        expect(g).toHaveLength(1);
        expect(g[0]!.members.map(m => m.reference.logicalName)).toEqual(['sample_ref1', 'sample_ref2']);
        expect(g[0]!.key).toBe(groupKeyOf(refs[0]!));
    });
    it('never mixes connectors or custom connectors, and never compares references with no connection', () => {
        const refs = [ref(1, { connectionId: 'abc' }), ref(2, { connectionId: 'abc', connectorId: B }), ref(3, { connectionId: 'abc', customConnectorId: 'cc' }), ref(4, { connectionId: '' }), ref(5, { connectionId: '  ' })];
        expect(duplicateGroups(snap(refs))).toEqual([]);
    });
    it('only looks at the references of the solution (the others cannot be removed from it)', () => {
        const refs = [ref(1, { connectionId: 'abc' }), ref(2, { connectionId: 'abc' })];
        const s = buildSnapshot(input({ references: refs, memberReferenceIds: [refs[0]!.id], flows: [] }));
        expect(duplicateGroups(s)).toEqual([]);
    });
    it('suggests the most used member, then the first by logical name; the biggest group comes first', () => {
        const refs = [ref(1, { connectionId: 'a' }), ref(2, { connectionId: 'a' }), ref(3, { connectionId: 'b' }), ref(4, { connectionId: 'b' }), ref(5, { connectionId: 'b' })];
        const flows = [flow(10, ['sample_ref2']), flow(11, ['sample_ref2']), flow(12, ['sample_ref1'])];
        const g = duplicateGroups(snap(refs, flows));
        expect(g.map(x => x.members.length)).toEqual([3, 2]);
        expect(g[0]!.suggestedKeeper).toBe(guid(3)); // nobody uses them: the first by name
        expect(g[1]!.suggestedKeeper).toBe(guid(2)); // two flows against one
    });
    it('names, per member, the flows of the solution that use it', () => {
        const refs = [ref(1, { connectionId: 'a' }), ref(2, { connectionId: 'a' })];
        const g = duplicateGroups(snap(refs, [flow(10, ['sample_ref1'])]));
        expect(g[0]!.members.find(m => m.reference.id === guid(1))!.flows).toEqual(['Flow 10']);
    });
});

describe('keeperOf', () => {
    const refs = [ref(1, { connectionId: 'a' }), ref(2, { connectionId: 'a' })];
    const g = duplicateGroups(snap(refs, [flow(10, ['sample_ref1'])]))[0]!;
    it('is the suggestion, or the user\'s choice while it is still a member', () => {
        expect(keeperOf(g, null)).toBe(guid(1));
        expect(keeperOf(g, { ...emptyCleanup(), keepers: { [g.key]: guid(2) } })).toBe(guid(2));
        expect(keeperOf(g, { ...emptyCleanup(), keepers: { [g.key]: guid(99) } })).toBe(guid(1));
    });
});

describe('mergeInput', () => {
    const refs = [ref(1, { connectionId: 'a' }), ref(2, { connectionId: 'a' }), ref(3, { connectionId: 'a' })];
    const flows = [flow(10, ['sample_ref1']), flow(11, ['sample_ref2']), flow(12, ['sample_ref2', 'sample_ref1'])];
    const s = snap(refs, flows);
    const g = duplicateGroups(s)[0]!;
    it('re-points the flows of the others to the keeper, and only the others that flows use', () => {
        const m = mergeInput(s, g, guid(1))!;
        expect(m.keeper.id).toBe(guid(1));
        expect(m.duplicates.map(d => d.id)).toEqual([guid(2), guid(3)]);
        expect([...m.flowIds].sort()).toEqual([guid(11), guid(12)]);
        expect(m.group).toEqual({ connectorId: refs[0]!.connectorId, from: ['sample_ref2'], target: 'sample_ref1' }); // ref3 has no flow: nothing to re-point
    });
    it('has nothing to re-point when no flow uses the others', () => {
        const only = snap(refs, [flow(10, ['sample_ref1'])]);
        const m = mergeInput(only, duplicateGroups(only)[0]!, guid(1))!;
        expect(m.group).toBeNull();
        expect(m.flowIds).toEqual([]);
        expect(m.duplicates).toHaveLength(2);
    });
    it('keeps another member when asked, and refuses an unknown one', () => {
        expect(mergeInput(s, g, guid(2))!.group).toMatchObject({ from: ['sample_ref1'], target: 'sample_ref2' });
        expect(mergeInput(s, g, guid(99))).toBeUndefined();
    });
    it('leaves out a flow that could not be read', () => {
        const withBad = snap(refs, [...flows, flow(13, [], { clientData: 'nope' })]);
        expect([...mergeInput(withBad, duplicateGroups(withBad)[0]!, guid(1))!.flowIds].sort()).toEqual([guid(11), guid(12)]);
    });
});

describe('cleanupFigures', () => {
    it('counts the unused, the groups and the distinct flows a merge into the suggestions would re-point', () => {
        const refs = [ref(1, { connectionId: 'a' }), ref(2, { connectionId: 'a' }), ref(3, { connectionId: 'z' })];
        const f = cleanupFigures(snap(refs, [flow(10, ['sample_ref1']), flow(11, ['sample_ref1']), flow(12, ['sample_ref2'])]));
        expect(f).toEqual({ unused: 1, groups: 1, flows: 1 });
    });
    it('is all zero for a clean solution', () => expect(cleanupFigures(snap([ref(1)], [flow(10, ['sample_ref1'])]))).toEqual({ unused: 0, groups: 0, flows: 0 }));
});

describe('pruneCleanup', () => {
    const refs = [ref(1, { connectionId: 'a' }), ref(2, { connectionId: 'a' }), ref(3, { connectionId: 'z', managed: true })];
    const s = snap(refs, [flow(10, ['sample_ref1'])]);
    const g = duplicateGroups(s)[0]!;
    it('keeps what still holds, and returns the same object when nothing changed', () => {
        const c = { ...emptyCleanup('unused', [guid(2)]), keepers: { [g.key]: guid(1) } };
        expect(pruneCleanup(s, c)).toBe(c);
    });
    it('drops a tick on a reference that is used, one that is managed, and one that is gone', () => {
        const c = emptyCleanup('unused', [guid(1), guid(2), guid(3), guid(99)]);
        expect(pruneCleanup(s, c).picked).toEqual([guid(2)]);
    });
    it('forgets a keeper that is no longer in its group, and a group that no longer exists', () => {
        const c = { ...emptyCleanup(), keepers: { [g.key]: guid(99), 'old|group|key': guid(1) } };
        expect(pruneCleanup(s, c).keepers).toEqual({});
    });
    it('solution() is unmanaged in these fixtures', () => expect(solution().managed).toBe(false));
});
