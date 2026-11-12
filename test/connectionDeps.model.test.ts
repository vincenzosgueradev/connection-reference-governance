import { describe, expect, it } from 'vitest';
import { allOk, coverageNote, groupOf, mergeReport, problemSources, verdictOf, type SourceName, type SourceState } from '../src/model/connectionDeps';
import type { ConnectionDependent } from '../src/types';

// Feature 024: the report of one connection, its verdict and its coverage note. Synthetic data only.

const d = (kind: ConnectionDependent['kind'], id: string, name = id): ConnectionDependent => ({ kind, id, name, state: '', ownerName: '', solutions: [], via: '' });
const sources = (over: Partial<Record<SourceName, SourceState>> = {}) => ({ ...allOk(), ...over });

describe('verdictOf', () => {
    it('is in-use when anything depends on it, whatever the sources say', () => {
        expect(verdictOf([d('app', '1')], sources())).toBe('in-use');
        expect(verdictOf([d('app', '1')], sources({ flows: { status: 'failed', reason: 'x' } }))).toBe('in-use');
    });
    it('is none-found only when nothing was found and no source failed', () => {
        expect(verdictOf([], sources())).toBe('none-found');
    });
    it('is unchecked-source when a source failed and nothing was found', () => {
        for (const n of ['apps', 'references', 'flows', 'agents'] as SourceName[]) expect(verdictOf([], sources({ [n]: { status: 'failed', reason: 'x' } })), n).toBe('unchecked-source');
    });
    it('a not-scanned source does not block none-found', () => {
        expect(verdictOf([], sources({ flows: { status: 'notScanned', reason: 'refused' } }))).toBe('none-found');
    });
});

describe('mergeReport', () => {
    it('keeps one of the same dependent found by two sources, by kind and id without case', () => {
        const r = mergeReport([d('flow', 'ABC'), d('flow', 'abc'), d('app', 'abc')], sources());
        expect(r.dependents.map(x => `${x.kind}:${x.id}`)).toEqual(['flow:ABC', 'app:abc']);
    });
    it('carries the sources and the note', () => {
        const r = mergeReport([], sources({ apps: { status: 'failed', reason: 'denied' } }));
        expect(r.sources.apps).toEqual({ status: 'failed', reason: 'denied' });
        expect(r.note).toContain('denied');
        expect(r.verdict).toBe('unchecked-source');
    });
});

describe('coverageNote', () => {
    it('names the sources that answered, the one that failed and the one not scanned, and the limit of the signed-in user', () => {
        const n = coverageNote(sources({ apps: { status: 'failed', reason: 'denied' }, flows: { status: 'notScanned', reason: 'the environment refuses the search' } }));
        expect(n).toContain('Looked at: connection references, agents.');
        expect(n).toContain('Could not read the apps (denied).');
        expect(n).toContain('Not scanned: flows (the environment refuses the search).');
        expect(n).toContain('Components that the signed-in user cannot read may still use this connection.');
    });
    it('says what was looked at when every source answered, and never says unused or free', () => {
        const n = coverageNote(sources());
        expect(n).toContain('Looked at: apps, connection references, flows, agents.');
        expect(n.toLowerCase()).not.toMatch(/unused|free/);
    });
});

describe('groupOf and problemSources', () => {
    it('groups in the order Apps, Flows, Connection references, Agents, each by name, and leaves empty groups out', () => {
        const r = mergeReport([d('agent', 'g', 'Zed'), d('flow', 'f2', 'Beta'), d('flow', 'f1', 'Alpha'), d('app', 'a')], sources());
        const g = groupOf(r);
        expect(g.map(x => x.label)).toEqual(['Apps', 'Flows', 'Agents']);
        expect(g[1]!.items.map(x => x.name)).toEqual(['Alpha', 'Beta']);
    });
    it('lists the sources that are not ok', () => {
        const r = mergeReport([], sources({ apps: { status: 'failed', reason: 'x' }, flows: { status: 'notScanned', reason: 'y' } }));
        expect(problemSources(r).map(p => p.name)).toEqual(['apps', 'flows']);
    });
});
