import { describe, expect, it } from 'vitest';
import { buildSnapshot } from '../src/model/analysis';
import type { DependencyReport } from '../src/model/dependencies';
import { initialState, reducer } from '../src/state/reducer';
import { flow, input, ref } from './helpers/fixtures';

/** Feature 023: the dependencies the screen holds, one entry per reference, dropped when the solution is read again. */

const report: DependencyReport = { items: [], notes: [] };
const snapshot = buildSnapshot(input({ references: [ref(1)], memberReferenceIds: [ref(1).id], flows: [flow(10, ['sample_ref1'])] }));

describe('dependencies in the state', () => {
    it('are loading, then ready or failed, one reference at a time', () => {
        let s = reducer(initialState(), { type: 'dependenciesLoading', ids: ['a', 'b'] });
        expect(s.dependencies).toEqual({ a: { status: 'loading' }, b: { status: 'loading' } });
        s = reducer(s, { type: 'dependenciesLoaded', id: 'a', report });
        s = reducer(s, { type: 'dependenciesFailed', id: 'b', error: 'privilege' });
        expect(s.dependencies).toEqual({ a: { status: 'ready', report }, b: { status: 'failed', error: 'privilege' } });
    });
    it('asking again puts one back to loading without touching the others', () => {
        let s = reducer(initialState(), { type: 'dependenciesLoaded', id: 'a', report });
        s = reducer(s, { type: 'dependenciesLoaded', id: 'b', report });
        s = reducer(s, { type: 'dependenciesLoading', ids: ['a'] });
        expect(s.dependencies['a']).toEqual({ status: 'loading' });
        expect(s.dependencies['b']!.status).toBe('ready');
    });
    it('are dropped when the solution is read again, and when another solution is opened (Principle VII)', () => {
        const withDeps = reducer(initialState(), { type: 'dependenciesLoaded', id: 'a', report });
        expect(reducer(withDeps, { type: 'snapshotLoaded', snapshot }).dependencies).toEqual({});
        expect(reducer(withDeps, { type: 'selectSolution', id: 'x' }).dependencies).toEqual({});
    });
    it('a row of Clean up can open and close its list of dependencies', () => {
        let s = reducer(reducer(initialState(), { type: 'solutionsLoaded', solutions: [input().solution] }), { type: 'selectSolution', id: input().solution.id });
        s = reducer(reducer(s, { type: 'snapshotLoaded', snapshot }), { type: 'setView', view: 'references' });
        s = reducer(s, { type: 'openCleanup' });
        s = reducer(s, { type: 'toggleCleanupDeps', id: 'x' });
        expect(s.cleanup!.open).toEqual(['x']);
        s = reducer(s, { type: 'toggleCleanupDeps', id: 'x' });
        expect(s.cleanup!.open).toEqual([]);
        expect(reducer(initialState(), { type: 'toggleCleanupDeps', id: 'x' }).cleanup).toBeNull();
    });
});
