import { describe, expect, it } from 'vitest';
import { allOk, mergeReport, type DepState, type SourceName, type SourceState } from '../src/model/connectionDeps';
import { backupRecords, blockReason, planConnectionDeletion, writableRows } from '../src/model/connectionPlan';
import type { ConnectionDependent, ConnectionRow } from '../src/types';

// Feature 024: the plan of a deletion of connections. Pure; synthetic data only.

const row = (name: string, over: Partial<ConnectionRow> = {}): ConnectionRow => ({
    name, connectorKey: 'alpha', connectorName: 'Alpha', displayName: `${name} display`, status: 'connected', statusDetail: '', createdTime: '2026-01-01T00:00:00Z', modifiedTime: '', creator: { name: 'Ann', email: 'ann@example.test' }, ...over,
});
const dep: ConnectionDependent = { kind: 'app', id: 'a1', name: 'An app', state: '', ownerName: '', solutions: [], via: '' };
const ready = (found: ConnectionDependent[] = [], over: Partial<Record<SourceName, SourceState>> = {}): DepState => ({ status: 'ready', report: mergeReport(found, { ...allOk(), ...over }) });

describe('planConnectionDeletion', () => {
    const rows = [row('free'), row('used'), row('failed'), row('unchecked'), row('loading'), row('broken', { status: 'error' })];
    const deps = {
        free: ready(),
        used: ready([dep]),
        failed: ready([], { apps: { status: 'failed', reason: 'denied' } }),
        loading: { status: 'loading' } as DepState,
        broken: ready(),
    };
    const plan = planConnectionDeletion(rows, deps, ['free', 'used', 'failed', 'unchecked', 'loading', 'broken']);

    it('a row that is not eligible is in the plan as blocked with the reason and is never writable', () => {
        const by = (n: string) => plan.rows.find(r => r.name === n)!;
        expect(by('free').blocked).toBeUndefined();
        expect(by('broken').blocked).toBeUndefined();
        expect(by('used').blocked).toContain('Something depends on it (1)');
        expect(by('failed').blocked).toContain('source could not be read');
        expect(by('unchecked').blocked).toContain('not read');
        expect(by('loading').blocked).toContain('not read');
        expect(writableRows(plan).map(r => r.name)).toEqual(['free', 'broken']);
    });
    it('only what was selected is in the plan, in the order of the list', () => {
        const p = planConnectionDeletion(rows, deps, ['broken', 'free', 'nope']);
        expect(p.rows.map(r => r.name)).toEqual(['free', 'broken']);
    });
    it('warns that it is permanent and what happens to references, and counts the blocked ones', () => {
        expect(plan.warnings[0]).toContain('permanent');
        expect(plan.warnings.join(' ')).toContain('show it as missing');
        expect(plan.warnings.join(' ')).toContain('4 connections are blocked');
    });
    it('repeats a not-scanned source in the warnings so it is read before confirming', () => {
        const p = planConnectionDeletion([row('free')], { free: ready([], { flows: { status: 'notScanned', reason: 'the environment refuses the search' } }) }, ['free']);
        expect(p.warnings.join(' ')).toContain('Not scanned: flows (the environment refuses the search)');
        expect(writableRows(p)).toHaveLength(1);
    });
    it('warns that the flow bindings the portal shows are not visible to this tool', () => {
        const p = planConnectionDeletion([row('free')], { free: ready() }, ['free']);
        expect(p.warnings.join(' ')).toContain('Flows using this connection');
        expect(planConnectionDeletion([row('used')], { used: ready([dep]) }, ['used']).warnings.join(' ')).not.toContain('Flows using this connection');
    });
    it('says nothing about references when nothing can be written', () => {
        const p = planConnectionDeletion([row('used')], { used: ready([dep]) }, ['used']);
        expect(p.warnings.join(' ')).not.toContain('show it as missing');
    });
});

describe('the backup', () => {
    it('holds the listed fields only, never an email and never a secret', () => {
        const p = planConnectionDeletion([row('free')], { free: ready() }, ['free']);
        const parsed = JSON.parse(p.backup) as { kind: string; connections: Record<string, string>[] };
        expect(parsed.kind).toBe('connections-before-delete');
        expect(Object.keys(parsed.connections[0]!).sort()).toEqual(['connector', 'createdTime', 'creator', 'displayName', 'name', 'status']);
        expect(p.backup).not.toContain('@example.test\n'.replace('\n', ''));
        expect(p.backup).not.toMatch(/ann@|email|secret|token|password/i);
        expect(parsed.connections[0]).toMatchObject({ name: 'free', creator: 'Ann', status: 'connected' });
    });
    it('backupRecords has the same fields for every row', () => {
        const recs = backupRecords([row('a'), row('b', { creator: { name: '', email: '' } })]);
        expect(recs.map(r => Object.keys(r).length)).toEqual([6, 6]);
    });
});

describe('blockReason', () => {
    it('is undefined only for an eligible row', () => {
        expect(blockReason(row('a'), { a: ready() })).toBeUndefined();
        expect(blockReason(row('a'), { a: ready([dep]) })).toBeDefined();
        expect(blockReason(row('a'), {})).toBeDefined();
        expect(blockReason(row('a'), { a: { status: 'failed', error: 'x' } })).toContain('could not be read');
    });
});
