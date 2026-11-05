import { TYPE_LABEL, type FlowType } from '../model/flowinfo';
import { fullDate } from '../model/time';
import type { FlowView, ReferenceView } from '../types';
import { chip, dataTable, detailBlock, el, keyValues, tableWrap, type ChipKind } from '../ui/components';
import { connectionChip, connectorName, flagChips, referenceCell } from './connections';

/** The panels that open under a row: what is known about a flow or a reference, as key-value pairs and tables. DOM only. */

const TYPE_KIND: Record<FlowType, ChipKind> = { instant: 'success', automated: 'info', scheduled: 'warning', unknown: 'neutral' };
const TYPE_ICON: Record<FlowType, string> = { instant: 'pointer', automated: 'zap', scheduled: 'clock', unknown: 'info' };
const STATE_LABEL: Record<number, string> = { 0: 'Off', 1: 'On', 2: 'Suspended' };

export function typeChip(type: FlowType): HTMLElement {
    const c = chip(TYPE_LABEL[type], TYPE_KIND[type], TYPE_ICON[type]);
    c.title = {
        instant: 'Starts manually (a button, an app or a request).',
        automated: 'Starts when an event happens.',
        scheduled: 'Starts on a schedule.',
        unknown: 'The definition has no trigger that can be read.',
    }[type];
    return c;
}

export function stateChip(stateCode: number): HTMLElement {
    return chip(STATE_LABEL[stateCode] ?? String(stateCode), stateCode === 1 ? 'success' : stateCode === 2 ? 'warning' : 'neutral', stateCode === 2 ? 'pause' : 'power');
}

function triggerText(f: FlowView): string {
    const i = f.info;
    if (i.triggerName === '') return '';
    const technical = [i.triggerType, i.triggerKind].filter(x => x !== '').join(', ');
    return `${i.triggerOperation || i.triggerName}${technical ? ` (${technical})` : ''}`;
}

export function flowDetail(f: FlowView): HTMLElement {
    const root = el('div', 'detail');
    root.append(detailBlock('Flow', undefined, keyValues([
        { label: 'Type', value: typeChip(f.info.type), icon: 'tag' },
        { label: 'State', value: stateChip(f.flow.stateCode), icon: 'power' },
        { label: 'Trigger', value: triggerText(f), icon: 'zap' },
        { label: 'Actions', value: f.unreadable ? '' : String(f.info.actionCount), icon: 'list' },
        { label: 'Owner', value: f.flow.ownerName || (f.flow.ownerId === '' ? '' : 'Unknown'), icon: 'user' },
        { label: 'Created', value: fullDate(f.flow.createdOn), icon: 'calendar' },
        { label: 'Modified', value: fullDate(f.flow.modifiedOn), icon: 'clock' },
        { label: 'Flow ID', value: f.flow.id, mono: true, icon: 'hash' },
        { label: 'Description', value: f.flow.description, wide: true, icon: 'file-text' },
    ]), true, 'workflow'));

    if (f.unreadable) {
        root.append(detailBlock('Connections', undefined, el('p', 'muted', 'The flow definition could not be read, so its connections are not shown.'), true, 'link'));
        return root;
    }
    if (f.uses.length === 0) {
        root.append(detailBlock('Connections', 0, el('p', 'muted', 'This flow does not use any connection reference.'), true, 'link'));
        return root;
    }
    const attention = f.uses.some(u => u.flags.length > 0);
    const table = dataTable(
        attention ? ['Reference', 'Connector', 'Connection', 'Needs attention'] : ['Reference', 'Connector', 'Connection'],
        f.uses,
        u => {
            const cells = [
                referenceCell(u.reference, u.logicalName),
                u.reference ? connectorName(u.reference.connectorId, u.reference.customConnectorId !== '') : el('span', 'muted', 'Unknown'),
                u.reference ? connectionChip(u.reference.connectionId) : chip('Missing', 'error', 'x-circle'),
            ];
            return attention ? [...cells, flagChips(u.flags)] : cells;
        },
    );
    table.classList.add('inner-table');
    root.append(detailBlock('Connections', f.uses.length, tableWrap(table), false, 'link'));
    return root;
}

export function referenceDetail(r: ReferenceView, flows: readonly FlowView[]): HTMLElement {
    const ref = r.reference;
    const root = el('div', 'detail');
    root.append(detailBlock('Connection reference', undefined, keyValues([
        { label: 'Display name', value: ref.displayName, icon: 'tag' },
        { label: 'Logical name', value: ref.logicalName, mono: true, icon: 'code' },
        { label: 'Connector', value: connectorName(ref.connectorId, ref.customConnectorId !== ''), icon: 'plug' },
        { label: 'Owner of the reference', value: ref.ownerName || (ref.ownerId === '' ? '' : 'Unknown'), icon: 'user' },
        { label: 'Connection ID', value: ref.connectionId === '' ? chip('No connection', 'warning', 'alert-triangle') : ref.connectionId, mono: ref.connectionId !== '', icon: 'link' },
        { label: 'Reference ID', value: ref.id, mono: true, icon: 'hash' },
        { label: 'Connector ID', value: ref.connectorId, mono: true, icon: 'hash' },
        { label: 'Custom connector ID', value: ref.customConnectorId, mono: true, icon: 'code' },
    ]), true, 'plug'));
    const users = flows.filter(f => r.flowIds.includes(f.flow.id));
    if (users.length === 0) {
        root.append(detailBlock('Used by', 0, el('p', 'muted', 'No flow of this solution uses this reference.'), true, 'workflow'));
        return root;
    }
    const table = dataTable(['Flow', 'Type', 'State'], users, f => [el('span', 'cell-strong', f.flow.name), typeChip(f.info.type), stateChip(f.flow.stateCode)]);
    table.classList.add('inner-table');
    root.append(detailBlock('Used by', users.length, tableWrap(table), false, 'workflow'));
    return root;
}
