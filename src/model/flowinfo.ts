/**
 * What can be read about a flow from its `clientdata` alone. Pure.
 *
 * Type rule (Microsoft Learn, "Triggers in Power Automate cloud flows" and the Logic Apps trigger schema reference):
 * a scheduled flow starts with the Recurrence trigger; an instant (manual) flow with the Request trigger, which Logic
 * Apps also calls the manual trigger; an automated flow with an event trigger (a connector trigger, an HTTP poll or a
 * webhook). No trigger, or a definition that cannot be read, is "unknown": nothing is guessed.
 */

export type FlowType = 'instant' | 'automated' | 'scheduled' | 'unknown';

export interface FlowInfo {
    readonly type: FlowType;
    /** The key of the first trigger in the definition, empty when there is none. */
    readonly triggerName: string;
    /** `type` of that trigger, for example Recurrence, Request or OpenApiConnection. */
    readonly triggerType: string;
    /** `kind` of that trigger when it has one, for example Button. */
    readonly triggerKind: string;
    /** Operation of a connector trigger, for example OnNewEmailV3. */
    readonly triggerOperation: string;
    /** Every action of the definition, nested ones included. */
    readonly actionCount: number;
}

export const TYPE_LABEL: Readonly<Record<FlowType, string>> = { instant: 'Instant', automated: 'Automated', scheduled: 'Scheduled', unknown: 'Unknown' };

const EMPTY: FlowInfo = { type: 'unknown', triggerName: '', triggerType: '', triggerKind: '', triggerOperation: '', actionCount: 0 };

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Actions inside one container: scope, loop, condition (both branches), switch (every case and the default). */
function countIn(container: unknown): number {
    if (!isObject(container)) return 0;
    let n = 0;
    for (const action of Object.values(container)) {
        if (!isObject(action)) continue;
        n += 1 + countIn(action['actions']);
        const otherwise = action['else'];
        if (isObject(otherwise)) n += countIn(otherwise['actions']);
        const fallback = action['default'];
        if (isObject(fallback)) n += countIn(fallback['actions']);
        const cases = action['cases'];
        if (isObject(cases)) for (const c of Object.values(cases)) if (isObject(c)) n += countIn(c['actions']);
    }
    return n;
}

export function typeOfTrigger(triggerType: string): FlowType {
    if (triggerType === '') return 'unknown';
    const t = triggerType.toLowerCase();
    if (t === 'recurrence') return 'scheduled';
    if (t === 'request') return 'instant';
    return 'automated';
}

export function flowInfo(clientData: string): FlowInfo {
    let doc: unknown;
    try {
        doc = JSON.parse(clientData);
    } catch {
        return EMPTY;
    }
    if (!isObject(doc)) return EMPTY;
    const props = doc['properties'];
    const definition = isObject(props) ? props['definition'] : undefined;
    if (!isObject(definition)) return EMPTY;
    const actionCount = countIn(definition['actions']);
    const triggers = definition['triggers'];
    const first = isObject(triggers) ? Object.entries(triggers)[0] : undefined;
    if (!first || !isObject(first[1])) return { ...EMPTY, actionCount };
    const trigger = first[1];
    const inputs = isObject(trigger['inputs']) ? trigger['inputs'] : {};
    const host = isObject(inputs['host']) ? inputs['host'] : {};
    const triggerType = text(trigger['type']);
    return {
        type: typeOfTrigger(triggerType),
        triggerName: first[0],
        triggerType,
        triggerKind: text(trigger['kind']),
        triggerOperation: text(host['operationId']),
        actionCount,
    };
}
