import { describe, expect, it } from 'vitest';
import { buildSnapshot } from '../src/model/analysis';
import { checkForm, connectionChoices, customConnectorOf, emptyForm, newReferenceRecord, prefixFor, isApplied, randomSeed, suggestName, suggestions, withChecked, withField, withPick, withSuggestion } from '../src/model/newReference';
import type { LiveState } from '../src/model/liveConnections';
import { input, ref, solution } from './helpers/fixtures';

const A = '/providers/Microsoft.PowerApps/apis/shared_a';
const snap = (over = {}) => buildSnapshot(input(over));
const ready = (...names: [string, string, string?][]): LiveState => ({ status: 'ready', error: '', items: names.map(([name, connectorKey, displayName]) => ({ name, connectorKey, displayName: displayName ?? '', createdTime: '2026-01-01T00:00:00Z' })) });
const form = (over = {}) => ({ ...emptyForm(A), displayName: 'My Ref', name: 'MyRef', ...over });

describe('suggestName', () => {
    it('keeps letters and digits, drops accents and spaces, never starts with a digit', () => {
        expect(suggestName('Dataverse prod - città')).toBe('Dataverseprodcitta');
        expect(suggestName('123 abc')).toBe('abc');
        expect(suggestName('   ')).toBe('');
    });
    it('is cut to 50 characters', () => expect(suggestName('a'.repeat(80))).toHaveLength(50));
});

describe('prefixFor', () => {
    it('uses the publisher prefix that was read', () => expect(prefixFor(snap({ solution: { ...solution(), prefix: 'ava' } }))).toBe('ava'));
    it('falls back to the prefix shared by the references of the solution', () => expect(prefixFor(snap({ solution: { ...solution(), prefix: '' } }))).toBe('sample'));
    it('is empty when the references disagree and nothing was read', () => {
        const refs = [ref(1, { logicalName: 'aa_x' }), ref(2, { logicalName: 'bb_y' })];
        expect(prefixFor(snap({ solution: { ...solution(), prefix: '' }, references: refs, memberReferenceIds: refs.map(r => r.id), flows: [] }))).toBe('');
    });
});

describe('checkForm', () => {
    it('accepts a good form and warns that no connection is set', () => {
        const c = checkForm(snap(), form());
        expect(c.ok).toBe(true);
        expect(c.warnings.join(' ')).toContain('No connection is set');
    });
    it('requires a display name and a name', () => {
        const c = checkForm(snap(), form({ displayName: ' ', name: '' }));
        expect(c.errors).toMatchObject({ displayName: expect.any(String), name: expect.any(String) });
        expect(c.ok).toBe(false);
    });
    it('rejects a name with odd characters, one starting with a digit, and one that is too long', () => {
        for (const name of ['my ref', '1abc', 'a-b', 'a'.repeat(51)]) expect(checkForm(snap(), form({ name })).errors.name, name).toBeDefined();
    });
    it('rejects a name that exists in the environment, whatever the case and whatever the solution', () => {
        expect(checkForm(snap(), form({ name: 'REF1' })).errors.name).toContain('already exists');
        const outside = ref(7, { logicalName: 'sample_elsewhere' });
        const s = snap({ references: [...input().references, outside] }); // not a member of the solution
        expect(checkForm(s, form({ name: 'elsewhere' })).errors.name).toContain('already exists');
    });
    it('blocks when the prefix cannot be found', () => {
        const refs = [ref(1, { logicalName: 'aa_x' }), ref(2, { logicalName: 'bb_y' })];
        const s = snap({ solution: { ...solution(), prefix: '' }, references: refs, memberReferenceIds: refs.map(r => r.id), flows: [] });
        expect(checkForm(s, form()).errors.prefix).toBeDefined();
    });
    it('accepts a connection picked from a card (it was listed), whatever the capitals or a whole resource id', () => {
        const live = ready(['shared-x_1.a', 'a', 'acc@example.test']);
        const picked = (id: string) => withPick(form({ live }), id);
        expect(checkForm(snap(), picked('shared-x_1.a')).ok).toBe(true);
        expect(checkForm(snap(), picked('SHARED-X_1.A')).ok).toBe(true); // names are not case sensitive
        expect(checkForm(snap(), picked('/providers/Microsoft.PowerApps/apis/shared_a/connections/shared-x_1.a')).ok).toBe(true); // a whole resource id is accepted
    });
    it('a typed id is never accepted before it was searched, and the verdict only counts for the text that was searched', () => {
        const live = ready(['c1', 'a', 'acc@example.test']);
        const typed = withField(form({ live }), 'connectionId', 'c1');
        expect(typed.connectionSource).toBe('typed');
        expect(checkForm(snap(), typed).errors.connectionId).toContain('Press Enter or the search icon');
        const found = withChecked(typed, 'c1', 'found');
        expect(found).toMatchObject({ connectionSource: 'card', connectionId: 'c1' }); // a found one becomes the selected card
        expect(checkForm(snap(), found).ok).toBe(true);
        const missing = withChecked(withField(form({ live }), 'connectionId', 'ghost'), 'ghost', 'missing');
        expect(checkForm(snap(), missing).errors.connectionId).toContain('not found');
        expect(checkForm(snap(), withField(missing, 'connectionId', 'ghost2')).errors.connectionId).toContain('Press Enter'); // other text: not searched
        const other = withChecked(withField(form({ live }), 'connectionId', 'c9'), 'c9', 'other-connector');
        expect(checkForm(snap(), other).errors.connectionId).toContain('another connector');
        const unknown = withChecked(withField(form({ live: { status: 'unavailable', items: [], error: 'denied' } }), 'connectionId', 'c9'), 'c9', 'unknown');
        expect(checkForm(snap(), unknown).errors.connectionId).toContain('cannot be verified');
    });
    it('a result for text that is no longer in the field is ignored', () => {
        const typed = withField(form({ live: ready(['c1', 'a']) }), 'connectionId', 'c1x');
        expect(withChecked(typed, 'c1', 'found')).toBe(typed);
        expect(withChecked(withPick(form(), 'c1'), 'c1', 'found').connectionSource).toBe('card'); // not typed: nothing to apply
    });
    it('a found connection is selected under its listed name', () => {
        const live = ready(['Conn-A', 'a']);
        expect(withChecked(withField(form({ live }), 'connectionId', 'conn-a'), 'conn-a', 'found').connectionId).toBe('Conn-A');
    });
    it('blocks a connection that does not exist, one of another connector, and one that cannot be verified', () => {
        const pick = (id: string, live: LiveState) => withPick(form({ live }), id);
        expect(checkForm(snap(), pick('ghost', ready(['other', 'a']))).errors.connectionId).toContain('not found');
        expect(checkForm(snap(), pick('c9', ready(['c9', 'b']))).errors.connectionId).toContain('another connector');
        expect(checkForm(snap(), pick('c9', { status: 'unavailable', items: [], error: 'denied' })).errors.connectionId).toContain('cannot be verified');
        expect(checkForm(snap(), pick('c9', { status: 'loading', items: [], error: '' })).errors.connectionId).toContain('Reading');
        expect(checkForm(snap(), pick('c9', ready())).ok).toBe(false); // listed: no
    });
    it('blocks odd characters before looking anything up', () => {
        expect(checkForm(snap(), withPick(form({ live: ready(["x'; drop", 'a']) }), "x'; drop")).errors.connectionId).toContain('Letters');
    });
    it('needs no verification when no connection is chosen', () => expect(checkForm(snap(), form({ connectionId: '' })).ok).toBe(true));
    it('only warns about a display name already used in this solution (Learn: it should be unique, it is not enforced)', () => {
        const c = checkForm(snap(), form({ displayName: 'ref 1' }));
        expect(c.ok).toBe(true);
        expect(c.warnings.join(' ')).toContain('in this solution has the same display name');
    });
    it('warns more gently about a display name used elsewhere in the environment', () => {
        const outside = ref(7, { logicalName: 'sample_elsewhere', displayName: 'Elsewhere' });
        const s = snap({ references: [...input().references, outside] });
        const c = checkForm(s, form({ displayName: 'elsewhere' }));
        expect(c.ok).toBe(true);
        expect(c.warnings.join(' ')).toContain('elsewhere in this environment');
    });
    it('uses the Dataverse limits: display name 200, description 2000', () => {
        expect(checkForm(snap(), form({ displayName: 'x'.repeat(200) })).ok).toBe(true);
        expect(checkForm(snap(), form({ displayName: 'x'.repeat(201) })).errors.displayName).toBeDefined();
        expect(checkForm(snap(), form({ description: 'x'.repeat(2001) })).errors.description).toBeDefined();
    });
});

describe('newReferenceRecord', () => {
    it('carries the connector of the category and only what was filled in', () => {
        expect(newReferenceRecord(snap(), form())).toEqual({ connectionreferencelogicalname: 'sample_MyRef', connectionreferencedisplayname: 'My Ref', connectorid: A });
        expect(newReferenceRecord(snap(), form({ description: ' d ', connectionId: ' c1 ' }))).toMatchObject({ description: 'd', connectionid: 'c1' });
    });
    it('binds the custom connector when every reference of the connector shares one', () => {
        const refs = [ref(1, { customConnectorId: 'cc-1' }), ref(2, { customConnectorId: 'cc-1' })];
        const s = snap({ references: refs, memberReferenceIds: refs.map(r => r.id), flows: [] });
        expect(customConnectorOf(s, A)).toBe('cc-1');
        expect(newReferenceRecord(s, form())['customconnectorid@odata.bind']).toBe('/connectors(cc-1)');
        const mixed = snap({ references: [ref(1, { customConnectorId: 'cc-1' }), ref(2, { customConnectorId: 'cc-2' })], memberReferenceIds: [], flows: [] });
        expect(customConnectorOf(mixed, A)).toBe('');
    });
});

describe('connectionChoices', () => {
    const live = ready(['conn-1', 'a', 'one@example.test'], ['conn-2', 'a', 'two@example.test'], ['conn-free', 'a', 'free@example.test'], ['conn-b', 'b', 'b@example.test']);
    it('is empty until the connections have been read', () => expect(connectionChoices(snap(), form())).toEqual([]));
    it('lists the connections of the connector as listed, never those of another connector', () => {
        expect(connectionChoices(snap(), form({ live })).map(c => c.id).sort()).toEqual(['conn-1', 'conn-2', 'conn-free']);
    });
    it('names, per connection, every reference that holds it (any solution) with its owner and email, and the flows of the solution', () => {
        const refs = [ref(1, { connectionId: 'conn-1', ownerName: 'Ann', ownerEmail: 'ann@example.test' }), ref(2, { connectionId: 'CONN-1' })];
        const outside = ref(9, { connectionId: 'conn-1', logicalName: 'sample_elsewhere' }); // holds it but is not in the solution
        const s = snap({ references: [...refs, outside], memberReferenceIds: refs.map(r => r.id) });
        const c = connectionChoices(s, form({ live })).find(x => x.id === 'conn-1')!;
        expect(c.users.map(u => u.logicalName)).toEqual(['sample_ref1', 'sample_ref2', 'sample_elsewhere']);
        expect(c.users[0]).toMatchObject({ ownerName: 'Ann', ownerEmail: 'ann@example.test', flows: ['Flow 10', 'Flow 11'] });
        expect(c).toMatchObject({ displayName: 'one@example.test', flowCount: 2 });
    });
    it('puts the connection used by most references first, then by name; one nobody uses has no users', () => {
        const s = snap({ references: [ref(1, { connectionId: 'conn-2' }), ref(2, { connectionId: 'conn-2' }), ref(3, { connectionId: 'conn-1' })], memberReferenceIds: [] , flows: [] });
        const c = connectionChoices(s, form({ live }));
        expect(c.map(x => x.id)).toEqual(['conn-2', 'conn-1', 'conn-free']);
        expect(c[2]!.users).toEqual([]);
    });
});

describe('suggestions (Learn: connector, solution for context, random suffix)', () => {
    const base = () => form({ displayName: '', name: '', seed: '3f9a1' });
    it('offers the Maker style and a readable one, all free in the environment', () => {
        const [maker, readable] = suggestions(snap(), base());
        expect(maker).toMatchObject({ label: 'Maker style', displayName: 'A Sample-3f9a1', name: 'shareda_3f9a1' });
        expect(readable).toMatchObject({ label: 'Readable', displayName: 'A - Sample', name: 'ASample' });
        expect(maker!.description).toContain('Sample');
    });
    it('adds one by account when a connection is chosen and listed', () => {
        const live = ready(['c1', 'a', 'acc@example.test']);
        const all = suggestions(snap(), withPick({ ...base(), live }, 'c1'));
        expect(all.map(s => s.label)).toEqual(['Maker style', 'Readable', 'By account']);
        expect(all[2]!.displayName).toBe('A (acc@example.test)');
        expect(all[2]!.name).toBe('Aaccexampletest');
    });
    it('never offers a name that exists: it adds the seed, then a counter', () => {
        const refs = [ref(1, { logicalName: 'sample_ASample' }), ref(2, { logicalName: 'sample_ASample_3f9a1' })];
        const s = snap({ references: refs, memberReferenceIds: refs.map(r => r.id), flows: [] });
        const readable = suggestions(s, base()).find(x => x.label === 'Readable')!;
        expect(readable.name).toBe('ASample_3f9a11');
    });
    it('adds the seed to a display name that already exists', () => {
        const s = snap({ references: [ref(1, { displayName: 'A - Sample' })], memberReferenceIds: [], flows: [] });
        expect(suggestions(s, base()).find(x => x.label === 'Readable')!.displayName).toBe('A - Sample-3f9a1');
    });
    it('offers nothing when the prefix is unknown, and never a name longer than the limit', () => {
        const refs = [ref(1, { logicalName: 'aa_x' }), ref(2, { logicalName: 'bb_y' })];
        const unknown = snap({ solution: { ...solution(), prefix: '' }, references: refs, memberReferenceIds: refs.map(r => r.id), flows: [] });
        expect(suggestions(unknown, base())).toEqual([]);
        const long = snap({ solution: { ...solution(), name: 'S'.repeat(120) } });
        for (const x of suggestions(long, base())) expect(x.name.length).toBeLessThanOrEqual(50);
    });
    it('applying one fills the three fields, and the name then stays when the display name changes', () => {
        const [maker] = suggestions(snap(), base());
        let f = withSuggestion(base(), maker!);
        expect(f).toMatchObject({ displayName: maker!.displayName, name: maker!.name, description: maker!.description, nameTouched: true });
        f = withField(f, 'displayName', 'Changed');
        expect(f.name).toBe(maker!.name);
    });
    it('every suggestion passes the form check', () => {
        for (const x of suggestions(snap(), base())) expect(checkForm(snap(), withSuggestion(base(), x)).errors).toEqual({});
    });
    it('the seed is five hex characters', () => expect(randomSeed()).toMatch(/^[0-9a-f]{5}$/));
});

describe('withField', () => {
    it('the name follows the display name until it is edited by hand', () => {
        let f = withField(emptyForm(A), 'displayName', 'Hello World');
        expect(f.name).toBe('HelloWorld');
        f = withField(f, 'name', 'Custom');
        f = withField(f, 'displayName', 'Other');
        expect(f.name).toBe('Custom');
        f = withField(f, 'name', '');
        f = withField(f, 'displayName', 'Again One');
        expect(f.name).toBe('AgainOne');
    });
    it('any edit leaves the review', () => expect(withField({ ...emptyForm(A), reviewing: true }, 'description', 'x').reviewing).toBe(false));
});

describe('isApplied', () => {
    it('is true only while the three fields hold exactly what the suggestion offers', () => {
        const [maker] = suggestions(snap(), form({ displayName: '', name: '', seed: '3f9a1' }));
        const f = withSuggestion(form({ seed: '3f9a1' }), maker!);
        expect(isApplied(f, maker!)).toBe(true);
        for (const field of ['displayName', 'name', 'description'] as const) expect(isApplied(withField(f, field, f[field] + 'x'), maker!), field).toBe(false);
    });
});
