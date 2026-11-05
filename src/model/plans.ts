import type { ConnectionReferenceRow, Plan, PlanRow, Snapshot } from '../types';
import { repointClientData } from './clientdata';
import type { RepointGroup } from './repoint';

export type { RepointGroup } from './repoint';

/** Pure planners (constitution T2, T3, T4). Nothing here writes; the caller shows the plan and asks to confirm. */

/** Only a flow that is off (draft) is rewritten: constitution T4 until active flows are verified. */
export const REWRITABLE_STATE = 0;

function ownerWarning(refs: readonly ConnectionReferenceRow[], currentUserId: string): string[] {
    if (currentUserId === '') return [];
    const others = refs.filter(r => r.ownerId !== '' && r.ownerId !== currentUserId);
    return others.length === 0
        ? []
        : [`${others.length} of these references are owned by someone else. The environment may refuse changes that involve a reference you do not own; each refusal is reported on its row.`];
}

export function planConnectionChange(snapshot: Snapshot, referenceIds: readonly string[], newConnectionId: string, currentUserId = ''): Plan {
    const views = referenceIds.map(id => snapshot.references.find(r => r.reference.id === id)).filter((v): v is NonNullable<typeof v> => v !== undefined);
    const connectors = new Set(views.map(v => v.reference.connectorId));
    const mixed = connectors.size > 1;
    const target = newConnectionId.trim();

    const rows: PlanRow[] = views.map(view => {
        const ref = view.reference;
        let blocked: string | undefined;
        if (snapshot.solution.managed || ref.managed) blocked = 'Managed: read-only.';
        else if (mixed) blocked = 'The selected references use different connectors: a connection belongs to one connector.';
        else if (target === '') blocked = 'No connection chosen.';
        else if (target === ref.connectionId) blocked = 'Already uses this connection.';
        return {
            id: ref.id,
            label: ref.displayName || ref.logicalName,
            field: 'connectionid',
            oldValue: ref.connectionId,
            newValue: target,
            payload: target,
            affectedFlows: view.flowIds.length,
            affectedOn: view.flowIds.filter(fid => snapshot.flows.find(f => f.flow.id === fid)?.flow.stateCode === 1).length,
            expectedCurrent: ref.connectionId,
            ...(blocked !== undefined ? { blocked } : {}),
        };
    });

    const warnings: string[] = [];
    if (target !== '' && !mixed && views.length > 0) {
        const connector = views[0]!.reference.connectorId;
        const known = snapshot.allReferences.some(r => r.connectorId === connector && r.connectionId === target);
        if (!known) warnings.push('This connection id is not used by any reference of this connector in the environment. Check that it is a connection of the right connector before applying.');
    }
    const on = rows.filter(r => r.blocked === undefined).reduce((n, r) => n + r.affectedOn, 0);
    if (on > 0) warnings.push(`${on} affected flows are turned on and will use the new connection immediately.`);
    warnings.push(...ownerWarning(views.map(v => v.reference), currentUserId));
    return { kind: 'connection', entity: 'connectionreference', rows, warnings };
}

/** Re-point `flowIds` from `fromLogicalName` to the reference `targetLogicalName`. */
/** One category: why it cannot be applied (undefined when it can). */
function groupBlock(snapshot: Snapshot, from: readonly string[], targetLogicalName: string): string | undefined {
    const froms = from.map(n => snapshot.allReferences.find(r => r.logicalName === n));
    const missing = from.find((_, i) => !froms[i]);
    if (missing !== undefined) return `The reference ${missing} does not exist.`;
    if (new Set(froms.map(f => f!.connectorId)).size > 1) return 'The chosen references belong to different connectors.';
    const target = snapshot.allReferences.find(r => r.logicalName === targetLogicalName);
    if (!target) return `The target reference ${targetLogicalName} does not exist.`;
    if (!snapshot.references.some(r => r.reference.logicalName === targetLogicalName)) return 'The target reference is not in this solution.';
    if (froms[0]!.connectorId !== target.connectorId) return 'The target uses a different connector.';
    if (from.every(n => n === targetLogicalName)) return 'Same reference.';
    return undefined;
}

/**
 * Re-points flows by category: each group replaces its references by its own new reference. A flow is rewritten once,
 * every step verified (constitution T3); groups the flow does not hold are not applied to it.
 */
export function planRepointGroups(snapshot: Snapshot, flowIds: readonly string[], groups: readonly RepointGroup[], currentUserId = '', manageState = false): Plan {
    const rows: PlanRow[] = [];
    const active = groups
        .map(g => ({ target: g.target, chosen: [...new Set(g.from)] }))
        .filter(g => g.chosen.length > 0)
        .map(g => ({ ...g, effective: g.chosen.filter(n => n !== g.target) }));
    const groupBlocked = active.map(g => groupBlock(snapshot, g.chosen, g.target)).find(b => b !== undefined);
    let several = 0;
    for (const id of flowIds) {
        const view = snapshot.flows.find(f => f.flow.id === id);
        if (!view) continue;
        const flow = view.flow;
        const heldBy = active.map(g => g.effective.filter(n => view.uses.some(u => u.logicalName === n)));
        const held = heldBy.flat();
        let blocked: string | undefined;
        let payload = flow.clientData;
        if (snapshot.solution.managed || flow.managed) blocked = 'Managed: read-only.';
        else if (flow.stateCode !== REWRITABLE_STATE && !(manageState && flow.stateCode === 1)) blocked = flow.stateCode === 1 ? 'The flow is turned on: turn it off first.' : 'The flow is not off (suspended): turn it off first.';
        else if (active.length === 0) blocked = 'No reference to replace was chosen.';
        else if (groupBlocked !== undefined) blocked = groupBlocked;
        else if (held.length === 0) blocked = active.some(g => g.chosen.includes(g.target) && view.uses.some(u => u.logicalName === g.target)) ? 'Already uses the new reference: nothing to change.' : 'The flow does not use any of the chosen references.';
        else {
            let text = flow.clientData;
            for (let i = 0; i < active.length && blocked === undefined; i++) {
                if (heldBy[i]!.length === 0) continue;
                const res = repointClientData(text, active[i]!.effective, active[i]!.target);
                if (res.ok) text = res.value;
                else blocked = res.error;
            }
            if (blocked === undefined) {
                payload = text;
                if (heldBy.some(h => h.length > 1)) several++;
            }
        }
        const shownFrom = held.length > 0 ? held : active.flatMap(g => g.effective.length > 0 ? g.effective : g.chosen);
        const shownTo = [...new Set(active.filter((_, i) => heldBy[i]!.length > 0 || held.length === 0).map(g => g.target))];
        rows.push({
            id,
            label: flow.name,
            field: 'clientdata',
            oldValue: shownFrom.join(', '),
            newValue: shownTo.join(', '),
            payload,
            affectedFlows: 1,
            affectedOn: flow.stateCode === 1 ? 1 : 0,
            expectedCurrent: flow.clientData,
            ...(blocked !== undefined ? { blocked } : {}),
            ...(manageState && flow.stateCode === 1 && blocked === undefined ? { turnOff: true } : {}),
        });
    }
    const targets = [...new Set(active.map(g => g.target))]
        .map(n => snapshot.allReferences.find(r => r.logicalName === n))
        .filter((r): r is ConnectionReferenceRow => r !== undefined);
    const warnings = targets.length > 0 ? ownerWarning(targets, currentUserId) : [];
    if (several > 0) warnings.push(`${several} flow${several === 1 ? ' holds' : 's hold'} more than one of the chosen references: they will all become the new reference of their category.`);
    return { kind: 'repoint', entity: 'workflow', rows, warnings, ...(manageState ? { manageState: true } : {}) };
}

/** One category (features 003 and 009): the references to replace and the one to use instead. */
export function planRepoint(snapshot: Snapshot, flowIds: readonly string[], fromNames: string | readonly string[], targetLogicalName: string, currentUserId = ''): Plan {
    const from = typeof fromNames === 'string' ? [fromNames] : fromNames;
    return planRepointGroups(snapshot, flowIds, [{ connectorId: '', from, target: targetLogicalName }], currentUserId);
}

/** The rows whose flow will be turned off for the write and on again after it. */
export function turnOffRows(plan: Plan): PlanRow[] {
    return plan.rows.filter(r => r.turnOff === true && r.blocked === undefined);
}

/** Why rows are blocked, grouped: each reason with the number of rows it blocks, most frequent first. */
export function blockReasons(plan: Plan): { reason: string; count: number }[] {
    const counts = new Map<string, number>();
    for (const r of plan.rows) if (r.blocked !== undefined) counts.set(r.blocked, (counts.get(r.blocked) ?? 0) + 1);
    return [...counts].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);
}

export function writableRows(plan: Plan): PlanRow[] {
    return plan.rows.filter(r => r.blocked === undefined);
}

export function affectedFlowTotal(plan: Plan): number {
    return writableRows(plan).reduce((n, r) => n + r.affectedFlows, 0);
}
