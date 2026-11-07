import { describe, expect, it } from 'vitest';
import { connectionsOf, connectorKeyOfConnection, environmentIdFrom, normalizeConnectionName, parseConnections, verifyConnection, type LiveState } from '../src/model/liveConnections';

/** The connections as the Power Platform API lists them (Learn: Connectivity, List connections, 2024-10-01). Synthetic data. */
const A = '/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps';
const body = { value: [
    { id: '/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps/connections/c-1', name: 'c-1', type: 'x', properties: { displayName: 'one@example.test', createdTime: '2026-02-03T04:05:06Z', changedTime: 'x' } },
    { id: '/providers/Microsoft.PowerApps/apis/shared_office365/connections/c-2', name: 'c-2', properties: { displayName: 'two@example.test' } },
    { name: 'c-3' },
    { id: 'no name' },
] };

describe('parseConnections', () => {
    it('reads the documented fields and the connector from the resource id', () => {
        expect(parseConnections(body)).toEqual([
            { name: 'c-1', connectorKey: 'commondataserviceforapps', displayName: 'one@example.test', createdTime: '2026-02-03T04:05:06Z' },
            { name: 'c-2', connectorKey: 'office365', displayName: 'two@example.test', createdTime: '' },
            { name: 'c-3', connectorKey: '', displayName: '', createdTime: '' },
        ]);
    });
    it('finds the list in any envelope, and returns nothing for anything else', () => {
        expect(parseConnections({ data: body })).toHaveLength(3);
        expect(parseConnections({ body })).toHaveLength(3);
        expect(parseConnections(body.value)).toHaveLength(3);
        for (const odd of [null, undefined, 'x', 3, {}, { value: 'x' }]) expect(parseConnections(odd)).toEqual([]);
    });
});

describe('environmentIdFrom', () => {
    it('reads Detail.EnvironmentId wherever the host put it', () => {
        expect(environmentIdFrom({ Detail: { EnvironmentId: 'e1' } })).toBe('e1');
        expect(environmentIdFrom({ value: { Detail: { EnvironmentId: 'e2' } } })).toBe('e2');
        expect(environmentIdFrom({ value: [{ Detail: { EnvironmentId: 'e3' } }] })).toBe('e3');
        expect(environmentIdFrom({})).toBe('');
        expect(environmentIdFrom(null)).toBe('');
    });
});

describe('names and the verdict', () => {
    it('takes the name out of a whole resource id and trims', () => {
        expect(normalizeConnectionName('  c-1 ')).toBe('c-1');
        expect(normalizeConnectionName('/providers/Microsoft.PowerApps/apis/shared_x/connections/c-1')).toBe('c-1');
        expect(connectorKeyOfConnection('/providers/Microsoft.PowerApps/apis/shared_x/connections/c')).toBe('x');
        expect(connectorKeyOfConnection('nothing')).toBe('');
    });
    const live: LiveState = { status: 'ready', error: '', items: parseConnections(body) };
    it('found, missing, other connector, and unknown until the list is read', () => {
        expect(verifyConnection(live, A, 'C-1')).toBe('found');
        expect(verifyConnection(live, A, 'zzz')).toBe('missing');
        expect(verifyConnection(live, A, 'c-2')).toBe('other-connector');
        expect(verifyConnection(live, A, 'c-3')).toBe('found'); // its connector is not given: the name is all there is
        expect(verifyConnection({ ...live, status: 'loading' }, A, 'c-1')).toBe('unknown');
        expect(verifyConnection({ ...live, status: 'unavailable' }, A, 'c-1')).toBe('unknown');
    });
    it('connectionsOf keeps only the connections whose connector matches', () => expect(connectionsOf(live, A).map(c => c.name)).toEqual(['c-1']));
});
