import { describe, expect, it } from 'vitest';
import { readReferenceNames, repointClientData } from '../src/model/clientdata';
import { clientData } from './helpers/fixtures';

// Oracle written from the spec (T9): the result equals the old JSON with exactly the matching reference names replaced.
function oracle(src: string, from: string, to: string): unknown {
    const doc = JSON.parse(src);
    for (const e of Object.values(doc.properties.connectionReferences ?? {}) as { connection: { connectionReferenceLogicalName: string } }[])
        if (e.connection.connectionReferenceLogicalName === from) e.connection.connectionReferenceLogicalName = to;
    return doc;
}

const shapes: Record<string, string[]> = { none: [], one: ['a'], several: ['a', 'b', 'c'], duplicated: ['a', 'a', 'b'] };

describe('readReferenceNames', () => {
    for (const [shape, names] of Object.entries(shapes))
        it(`reads ${shape}`, () => {
            const r = readReferenceNames(clientData(names));
            expect(r).toEqual({ ok: true, value: [...new Set(names)] });
        });
    it('returns empty when properties or the map are missing', () => {
        expect(readReferenceNames('{}')).toEqual({ ok: true, value: [] });
        expect(readReferenceNames('{"properties":{}}')).toEqual({ ok: true, value: [] });
    });
    it('ignores entries without a logical name', () => {
        const s = JSON.stringify({ properties: { connectionReferences: { k: { connection: {} }, j: 5, l: { connection: { connectionReferenceLogicalName: '' } } } } });
        expect(readReferenceNames(s)).toEqual({ ok: true, value: [] });
    });
    for (const bad of ['', 'not json', '[]', '"x"', 'null'])
        it(`fails on ${JSON.stringify(bad)}`, () => expect(readReferenceNames(bad).ok).toBe(false));
});

describe('repointClientData', () => {
    const targets = ['a', 'b', 'z'];
    for (const [shape, names] of Object.entries(shapes))
        for (const from of ['a', 'b', 'c', 'q'])
            for (const to of targets) {
                it(`${shape}: ${from} -> ${to}`, () => {
                    const src = clientData(names);
                    const r = repointClientData(src, from, to);
                    if (!names.includes(from) || from === to) {
                        expect(r.ok).toBe(false);
                        return;
                    }
                    expect(r.ok).toBe(true);
                    if (r.ok) expect(JSON.parse(r.value)).toEqual(oracle(src, from, to));
                });
            }
    it('keeps the definition untouched', () => {
        const src = clientData(['a', 'b']);
        const r = repointClientData(src, 'a', 'b');
        expect(r.ok && JSON.parse(r.value).properties.definition).toEqual(JSON.parse(src).properties.definition);
    });
    it('keeps the key order of the definition', () => {
        const src = clientData(['a']);
        const r = repointClientData(src, 'a', 'b');
        expect(r.ok && r.value.indexOf('"actions"') > 0 && r.value.indexOf('"triggers"') > r.value.indexOf('"actions"')).toBe(true);
    });
    it('fails on invalid input', () => {
        expect(repointClientData('nope', 'a', 'b').ok).toBe(false);
        expect(repointClientData('{}', 'a', 'b').ok).toBe(false);
    });

    it('changes nothing but the name: spacing, numbers and key order stay byte for byte', () => {
        const src = '{ "properties" :{"connectionReferences":{"k":{"connection":{"connectionReferenceLogicalName" : "a"},"x":1.0,"big":12345678901234567890}},"definition":{"n":1.50,"e":1e3}},  "z":0.10 }';
        const r = repointClientData(src, 'a', 'b');
        expect(r).toEqual({ ok: true, value: src.replace('"a"', '"b"') });
    });
    it('touches only the key of the matching entries, not the same text elsewhere', () => {
        const src = JSON.stringify({ properties: { connectionReferences: { k1: { connection: { connectionReferenceLogicalName: 'a' } }, k2: { connection: { connectionReferenceLogicalName: 'ab' } } }, definition: { note: '"connectionReferenceLogicalName":"a"' } } });
        const r = repointClientData(src, 'a', 'z');
        expect(r.ok && JSON.parse(r.value).properties.connectionReferences.k2.connection.connectionReferenceLogicalName).toBe('ab');
        expect(r.ok && JSON.parse(r.value).properties.definition.note).toBe('"connectionReferenceLogicalName":"a"');
    });
    it('handles regex characters in names and does not treat them as patterns', () => {
        const r = repointClientData(clientData(['a.b+c']), 'a.b+c', 'x$&y');
        expect(r.ok && JSON.parse(r.value).properties.connectionReferences.shared_k0.connection.connectionReferenceLogicalName).toBe('x$&y');
        expect(repointClientData(clientData(['aXb']), 'a.b', 'z').ok).toBe(false);
    });
    it('refuses a layout it cannot edit safely (escaped name) instead of guessing', () => {
        const src = '{"properties":{"connectionReferences":{"k":{"connection":{"connectionReferenceLogicalName":"s\\u0061"}}}}}';
        expect(repointClientData(src, 'sa', 'b').ok).toBe(false);
    });
    it('refuses empty names', () => {
        expect(repointClientData(clientData(['a']), '', 'b').ok).toBe(false);
        expect(repointClientData(clientData(['a']), 'a', '').ok).toBe(false);
    });
    it('refuses when the same text appears as a key outside the reference entries (the safety comparison catches it)', () => {
        // the entry holds "a" written with an escape, so the in-place edit would hit the other occurrence instead
        const src = '{"properties":{"connectionReferences":{"k":{"connection":{"connectionReferenceLogicalName":"\u0061"}}},"definition":{"x":{"connectionReferenceLogicalName":"a"}}}}';
        expect(repointClientData(src, 'a', 'b').ok).toBe(false);
    });
});
