import { connectorInfo } from '../model/connectors';
import type { ConnectionReferenceRow, Flag, FlowView } from '../types';
import { chip, el, icon } from '../ui/components';

/**
 * Small pieces that show a connection reference the same way everywhere: the connector glyph, the official connector
 * name, the connection id. DOM only. Long values wrap, they are never truncated.
 */

/** The glyph of a connector in a rounded tile; the connector name is its tooltip. */
export function connectorTile(connectorId: string, missing = false, small = false): HTMLElement {
    const info = connectorInfo(connectorId);
    const tile = el('span', `conn-tile conn-tile--${missing ? 'missing' : info.tone}${small ? ' conn-tile--sm' : ''}`);
    tile.title = missing ? 'Reference not found in this environment' : info.name;
    tile.append(icon(missing ? 'alert-triangle' : info.glyph));
    return tile;
}

/** The connection id in full (it wraps), or a warning when none is set. */
export function connectionChip(connectionId: string): HTMLElement {
    if (connectionId === '') return chip('No connection', 'warning', 'alert-triangle');
    const c = chip(connectionId, 'neutral', 'link');
    c.classList.add('chip--code', 'conn-id');
    c.title = connectionId;
    return c;
}

/** The official connector name, with a chip when the reference uses a custom connector. */
export function connectorName(connectorId: string, custom: boolean): HTMLElement {
    const box = el('span', 'connector-name');
    box.append(connectorInfo(connectorId).name);
    if (custom) {
        const tag = chip('Custom connector', 'info', 'code');
        tag.title = 'A connector built for this environment, not a standard Microsoft connector.';
        box.append(' ', tag);
    }
    return box;
}

/** The glyph, the reference name and below it the logical name. A missing reference is named and marked. */
export function referenceCell(ref: ConnectionReferenceRow | undefined, logicalName: string): HTMLElement {
    const box = el('div', 'ref-cell');
    const text = el('div', 'conn-text');
    if (!ref) {
        text.append(el('div', 'conn-name', logicalName), el('div', 'conn-logical', 'Not found in this environment'));
        box.append(connectorTile('', true), text);
        return box;
    }
    text.append(el('div', 'conn-name', ref.displayName || ref.logicalName), el('div', 'conn-logical', ref.logicalName));
    box.append(connectorTile(ref.connectorId), text);
    return box;
}

/** The connections of a flow in a row: one small tile each (hover for the name) and how many there are. */
export function connectionTiles(f: FlowView): HTMLElement {
    const box = el('div', 'tile-row');
    if (f.unreadable) {
        box.append(chip('Unreadable', 'warning', 'alert-triangle'));
        return box;
    }
    if (f.uses.length === 0) {
        box.append(el('span', 'muted', 'None'));
        return box;
    }
    for (const u of f.uses.slice(0, 5)) {
        const t = connectorTile(u.reference?.connectorId ?? '', u.reference === undefined, true);
        t.title = `${u.reference ? connectorInfo(u.reference.connectorId).name + ': ' + (u.reference.displayName || u.logicalName) : u.logicalName + ' (not found)'}`;
        box.append(t);
    }
    if (f.uses.length > 5) box.append(el('span', 'muted', `+${f.uses.length - 5}`));
    box.append(el('span', 'muted tile-count', f.uses.length === 1 ? '1 connection' : `${f.uses.length} connections`));
    return box;
}

/** Short warning chips with the full sentence as tooltip; empty when there is nothing to flag. */
export function flagChips(flags: readonly Flag[]): HTMLElement {
    const box = el('div', 'chip-list');
    for (const f of flags) {
        const c = chip(f.label, 'warning', 'alert-triangle');
        c.title = f.detail;
        box.append(c);
    }
    return box;
}
