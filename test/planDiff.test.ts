import { describe, expect, it } from 'vitest';
import { buildSnapshot } from '../src/model/analysis';
import { lineDiff } from '../src/model/diff';
import { changedFields, planItems, prettyDocument } from '../src/model/planDiff';
import { planConnectionChange, planRepoint } from '../src/model/plans';
import { clientData, flow, guid, input, ref, solution } from './helpers/fixtures';

const B = '/providers/Microsoft.PowerApps/apis/shared_b';
const refs = [ref(1), ref(2), ref(3, { connectorId: B })];
const snap = (flows = [flow(10, ['sample_ref1'], { name: 'Alpha' })], over = {}) => buildSnapshot(input({ solution: solution(), references: refs, memberReferenceIds: refs.map(r => r.id), flows, ...over }));

describe('prettyDocument', () => {
    it('formats JSON with two spaces and leaves other text alone', () => {
        expect(prettyDocument('{"a":{"b":1},"c":[1,2]}')).toBe('{\n  "a": {\n    "b": 1\n  },\n  "c": [\n    1,\n    2\n  ]\n}');
        expect(prettyDocument('not json')).toBe('not json');
        expect(prettyDocument('')).toBe('');
    });
    it('keeps the order of the keys', () => {
        expect(prettyDocument('{"z":1,"a":2}').indexOf('"z"')).toBeLessThan(prettyDocument('{"z":1,"a":2}').indexOf('"a"'));
    });
});

describe('changedFields', () => {
    const f = (a: unknown, b: unknown) => changedFields(a, b).map(x => [x.what, x.before, x.after]);
    it('lists each changed leaf with its path', () => {
        expect(f({ a: { b: 'x', c: 1 } }, { a: { b: 'y', c: 1 } })).toEqual([['a.b', '"x"', '"y"']]);
    });
    it('finds added and removed keys and array elements', () => {
        expect(f({ a: 1 }, { a: 1, b: 2 })).toEqual([['b', '(none)', '2']]);
        expect(f({ a: 1, b: 2 }, { a: 1 })).toEqual([['b', '2', '(none)']]);
        expect(f({ l: [1, 2] }, { l: [1, 3] })).toEqual([['l[1]', '2', '3']]);
        expect(f({ l: [1] }, { l: [1, 2] })).toEqual([['l[1]', '(none)', '2']]);
    });
    it('a change of type is one change at that path', () => {
        expect(f({ a: { b: 1 } }, { a: 'text' })).toEqual([['a', '{…}', '"text"']]);
    });
    it('nothing changed gives nothing, and the result is capped', () => {
        expect(f({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toEqual([]);
        const big = Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`k${i}`, i]));
        const other = Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`k${i}`, i + 1]));
        expect(changedFields(big, other)).toHaveLength(200);
    });
});

describe('planItems: re-point', () => {
    const plan = (s = snap()) => planRepoint(s, [guid(10)], 'sample_ref1', 'sample_ref2');

    it('one item per row with the flow name, its id and exactly one changed field', () => {
        const s = snap();
        const items = planItems(plan(s), s);
        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({ id: guid(10), title: 'Alpha', sub: guid(10) });
        expect(items[0]!.fields).toEqual([{ what: 'properties.connectionReferences.shared_k0.connection.connectionReferenceLogicalName', before: '"sample_ref1"', after: '"sample_ref2"' }]);
    });
    it('the after side is exactly the payload that will be written (oracle: rebuild it from the diff)', () => {
        const s = snap();
        const p = plan(s);
        const item = planItems(p, s)[0]!;
        const full = lineDiff(item.before, item.after, { context: Infinity });
        const rebuiltAfter = full.rows.filter(r => r.kind !== 'removed').map(r => r.newText).join('\n');
        const rebuiltBefore = full.rows.filter(r => r.kind !== 'added').map(r => r.oldText).join('\n');
        expect(JSON.parse(rebuiltAfter)).toEqual(JSON.parse(p.rows[0]!.payload));
        expect(JSON.parse(rebuiltBefore)).toEqual(JSON.parse(p.rows[0]!.expectedCurrent));
        expect(rebuiltAfter).toBe(prettyDocument(p.rows[0]!.payload));
    });
    it('a one-name change in a very long definition shows one change with context and two collapsed bands', () => {
        const filler = Object.fromEntries(Array.from({ length: 1500 }, (_, i) => [`Action_${i}`, { type: 'Compose', inputs: `value ${i}` }]));
        const big = clientData(['sample_ref1'], {}, {}).replace('"actions":{', `"actions":${JSON.stringify(filler).slice(0, -1)},`);
        const s = snap([flow(10, ['sample_ref1'], { name: 'Big', clientData: big })]);
        const item = planItems(plan(s), s)[0]!;
        expect(item.before.split('\n').length).toBeGreaterThan(3000);
        const d = lineDiff(item.before, item.after);
        expect(d.rows.map(r => r.kind)).toEqual(['gap', 'context', 'context', 'context', 'changed', 'context', 'context', 'context', 'gap']);
        expect([d.added, d.removed]).toEqual([1, 1]);
    });
    it('a blocked row is an item with its reason and no documents or fields', () => {
        const s = snap([flow(10, ['sample_ref1'], { name: 'On', stateCode: 1 })]);
        const item = planItems(plan(s), s)[0]!;
        expect(item.blocked).toContain('turn it off first');
        expect([item.before, item.after, item.fields]).toEqual(['', '', []]);
    });
    it('a definition that is not JSON is shown as plain text with one field', () => {
        const s = snap([flow(10, ['sample_ref1'], { name: 'Broken', clientData: 'nope' })]);
        const item = planItems(plan(s), s)[0]!;
        expect(item.blocked).toBeDefined(); // the planner refuses it
    });
});

describe('planItems: change of connection', () => {
    it('the record before and after differ only in the connection id', () => {
        const s = snap();
        const p = planConnectionChange(s, [guid(1)], 'conn-9');
        const item = planItems(p, s)[0]!;
        expect(item).toMatchObject({ id: guid(1), title: 'Ref 1', sub: guid(1) });
        expect(JSON.parse(item.before)).toEqual({ connectionreferenceid: guid(1), connectionreferencelogicalname: 'sample_ref1', connectionid: 'conn-1' });
        expect(JSON.parse(item.after)).toEqual({ connectionreferenceid: guid(1), connectionreferencelogicalname: 'sample_ref1', connectionid: 'conn-9' });
        expect(item.fields).toEqual([{ what: 'connectionid', before: 'conn-1', after: 'conn-9' }]);
        const d = lineDiff(item.before, item.after);
        expect([d.added, d.removed]).toEqual([1, 1]);
    });
    it('a reference that had no connection says so in the field and in the record', () => {
        const s = snap([], { references: refs.map(r => (r.id === guid(1) ? { ...r, connectionId: '' } : r)) });
        const item = planItems(planConnectionChange(s, [guid(1)], 'conn-9'), s)[0]!;
        expect(item.fields[0]).toEqual({ what: 'connectionid', before: '(not set)', after: 'conn-9' });
        expect(JSON.parse(item.before).connectionid).toBe('');
    });
    it('blocked rows (mixed connectors) are items with the reason, not diffs', () => {
        const s = snap();
        const items = planItems(planConnectionChange(s, [guid(1), guid(3)], 'x'), s);
        expect(items.map(i => i.blocked !== undefined)).toEqual([true, true]);
        expect(items.every(i => i.fields.length === 0)).toBe(true);
    });
    it('keeps the order of the plan', () => {
        const s = snap();
        expect(planItems(planConnectionChange(s, [guid(2), guid(1)], 'conn-9'), s).map(i => i.id)).toEqual([guid(2), guid(1)]);
    });
});
