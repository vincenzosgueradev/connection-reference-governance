import { describe, expect, it } from 'vitest';
import { flowInfo, typeOfTrigger } from '../src/model/flowinfo';
import { clientData } from './helpers/fixtures';

describe('typeOfTrigger', () => {
    // matrix: trigger type -> flow type (Learn: Recurrence is scheduled, Request is the manual trigger, events are automated)
    const cases: [string, string][] = [
        ['Recurrence', 'scheduled'], ['recurrence', 'scheduled'],
        ['Request', 'instant'], ['request', 'instant'],
        ['OpenApiConnection', 'automated'], ['OpenApiConnectionNotification', 'automated'], ['OpenApiConnectionWebhook', 'automated'],
        ['ApiConnection', 'automated'], ['ApiConnectionWebhook', 'automated'], ['Http', 'automated'], ['HttpWebhook', 'automated'],
        ['', 'unknown'],
    ];
    for (const [trigger, type] of cases) it(`${JSON.stringify(trigger)} -> ${type}`, () => expect(typeOfTrigger(trigger)).toBe(type));
});

describe('flowInfo', () => {
    it('reads the first trigger: name, type, kind and the connector operation', () => {
        const i = flowInfo(clientData([], {}, { manual: { type: 'Request', kind: 'Button' } }));
        expect(i).toMatchObject({ type: 'instant', triggerName: 'manual', triggerType: 'Request', triggerKind: 'Button', triggerOperation: '' });
        const e = flowInfo(clientData([], {}, { On_new: { type: 'OpenApiConnectionNotification', inputs: { host: { operationId: 'OnNewEmailV3' } } } }));
        expect(e).toMatchObject({ type: 'automated', triggerOperation: 'OnNewEmailV3' });
    });
    it('a definition with no trigger is unknown, not guessed', () => {
        expect(flowInfo(clientData([])).type).toBe('unknown');
    });
    it('counts every action including nested ones', () => {
        const doc = JSON.stringify({ properties: { definition: { triggers: {}, actions: {
            A: { type: 'Compose' },
            Scope: { type: 'Scope', actions: { B: { type: 'Compose' }, Loop: { type: 'Foreach', actions: { C: { type: 'Compose' } } } } },
            If: { type: 'If', actions: { D: { type: 'Compose' } }, else: { actions: { E: { type: 'Compose' }, F: { type: 'Compose' } } } },
            Sw: { type: 'Switch', cases: { one: { actions: { G: { type: 'Compose' } } }, two: { actions: { H: { type: 'Compose' } } } }, default: { actions: { I: { type: 'Compose' } } } },
        } } } });
        expect(flowInfo(doc).actionCount).toBe(13);
    });
    it('the fixture definition has two actions', () => {
        expect(flowInfo(clientData(['a'])).actionCount).toBe(2);
    });
    // negative matrix: input that is not a flow definition
    for (const bad of ['', 'nope', '[]', '"x"', 'null', '{}', '{"properties":{}}', '{"properties":{"definition":[]}}', '{"properties":{"definition":{"triggers":[]}}}', '{"properties":{"definition":{"triggers":{"t":5}}}}'])
        it(`${JSON.stringify(bad)} is unknown with no actions`, () => {
            const i = flowInfo(bad);
            expect(i.type).toBe('unknown');
            expect(i.actionCount).toBe(0);
        });
    it('a trigger with odd field types does not throw', () => {
        expect(flowInfo(JSON.stringify({ properties: { definition: { triggers: { t: { type: 5, kind: [], inputs: { host: 'x' } } } } } })).type).toBe('unknown');
    });
});
