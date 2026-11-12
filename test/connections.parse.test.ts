import { describe, expect, it } from 'vitest';
import { nextOf, parseConnectionRows, statusOf } from '../src/model/liveConnections';

// Feature 024: the richer reading of the list of connections. Synthetic data only.

const conn = (over: Record<string, unknown> = {}, props: Record<string, unknown> = {}) => ({
    name: 'conn-1',
    id: '/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps/connections/conn-1',
    properties: { displayName: 'a@example.test', createdTime: '2026-01-01T00:00:00Z', lastModifiedTime: '2026-02-01T00:00:00Z', statuses: [{ status: 'Connected' }], createdBy: { displayName: 'Ann', email: 'ann@example.test' }, ...props },
    ...over,
});

describe('statusOf', () => {
    it('is connected only when the list is not empty and every entry says so', () => {
        expect(statusOf([{ status: 'Connected' }]).status).toBe('connected');
        expect(statusOf([{ status: 'Connected' }, { status: 'Connected' }]).status).toBe('connected');
    });
    it('is unknown for an empty or missing list and for a shape it does not understand, never connected', () => {
        for (const v of [undefined, null, [], 'Connected', 3, [{ status: 'Pending' }], [{}]]) expect(statusOf(v).status, JSON.stringify(v)).toBe('unknown');
    });
    it('reports an error with its message', () => {
        const s = statusOf([{ status: 'Error', error: { code: 'Forbidden', message: 'Access denied' } }]);
        expect(s.status).toBe('error');
        expect(s.detail).toContain('Access denied');
    });
    it('says needs reconnect when the service says the connection must be signed in again, whatever the case', () => {
        expect(statusOf([{ status: 'Error', error: { code: 'Unauthenticated', message: 'Token expired' } }]).status).toBe('reconnect');
        expect(statusOf([{ status: 'REAUTHENTICATE' }]).status).toBe('reconnect');
    });
    it('one broken entry makes the whole connection broken even when another says connected', () => {
        expect(statusOf([{ status: 'Connected' }, { status: 'Error', error: { code: 'x' } }]).status).toBe('error');
    });
});

describe('parseConnectionRows', () => {
    it('reads every field the answer carries', () => {
        const [r] = parseConnectionRows({ value: [conn()] });
        expect(r).toMatchObject({ name: 'conn-1', connectorKey: 'commondataserviceforapps', displayName: 'a@example.test', status: 'connected', createdTime: '2026-01-01T00:00:00Z', modifiedTime: '2026-02-01T00:00:00Z', creator: { name: 'Ann', email: 'ann@example.test' } });
        expect(r!.connectorName).not.toBe('');
    });
    it('leaves absent fields empty and never invents them', () => {
        const [r] = parseConnectionRows({ value: [{ name: 'only-name' }] });
        expect(r).toMatchObject({ name: 'only-name', connectorKey: '', connectorName: '', displayName: '', status: 'unknown', statusDetail: '', createdTime: '', modifiedTime: '', creator: { name: '', email: '' } });
    });
    it('falls back to the creator principal name, and to the connector of apiId when the id has none', () => {
        const [r] = parseConnectionRows({ value: [conn({ id: '' }, { apiId: '/providers/Microsoft.PowerApps/apis/shared_office365', createdBy: { userPrincipalName: 'ann@example.test' } })] });
        expect(r!.creator.name).toBe('ann@example.test');
        expect(r!.connectorKey).toBe('office365');
    });
    it('skips an entry with no name and accepts the envelopes of the host', () => {
        expect(parseConnectionRows({ value: [{ properties: {} }, conn()] })).toHaveLength(1);
        expect(parseConnectionRows({ data: { value: [conn()] } })).toHaveLength(1);
        expect(parseConnectionRows({ body: { value: [conn()] } })).toHaveLength(1);
        expect(parseConnectionRows([conn()])).toHaveLength(1);
        expect(parseConnectionRows(null)).toEqual([]);
    });
    it('does not break an answer where properties is not an object', () => {
        expect(parseConnectionRows({ value: [{ name: 'x', properties: 'oops' }] })[0]!.status).toBe('unknown');
    });
});

describe('nextOf', () => {
    it('is the next page token however the host wrapped it, and empty at the last page', () => {
        expect(nextOf({ value: [], nextLink: 'https://example.test/next?$skiptoken=abc' })).toContain('skiptoken=abc');
        expect(nextOf({ data: { nextLink: 'n1' } })).toBe('n1');
        expect(nextOf({ body: { nextLink: 'n2' } })).toBe('n2');
        expect(nextOf({ '@odata.nextLink': 'n3' })).toBe('n3');
        expect(nextOf({ value: [] })).toBe('');
        expect(nextOf(undefined)).toBe('');
    });
});
