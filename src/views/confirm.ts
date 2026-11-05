import { connectorInfo } from '../model/connectors';
import { TYPE_LABEL } from '../model/flowinfo';
import { affectedFlowTotal, TURNED_ON, turnOffRows, writableRows } from '../model/plans';
import type { Plan, Snapshot } from '../types';
import { button, callout, chip, connectionBadge, el, figures, icon, modal, toggle, type ChangeRow } from '../ui/components';
import { connectionChip, connectorTile } from './connections';
import { makeExpandable } from './expand';

/**
 * The dialog that stands between the user and every write (constitution V): environment, scope in figures, one
 * before-and-after line per row, the warnings, the backup and an explicit acknowledgement. DOM only; the decisions
 * (what is blocked, what is counted) come from the plan.
 */

export interface ConfirmHandlers {
    confirm(): void;
    cancel(): void;
    saveBackup(): void;
    setAck(on: boolean): void;
    setExpanded(on: boolean): void;
    setStateAck(on: boolean): void;
    setManageState(on: boolean): void;
}

export interface ConfirmArgs {
    plan: Plan;
    snapshot: Snapshot;
    environment: string;
    ack: boolean;
    backupSaved: boolean;
    expanded: boolean;
    stateAck: boolean;
    manageState: boolean;
}

/** A reference named by its glyph, its name and its connector: what a flow points to before or after. */
export function referenceInline(snapshot: Snapshot, logicalName: string, tone: 'old' | 'new'): HTMLElement {
    const ref = snapshot.allReferences.find(r => r.logicalName === logicalName);
    const box = el('div', `ref-inline ref-inline--${tone}`);
    box.append(connectorTile(ref?.connectorId ?? '', ref === undefined, true));
    const text = el('div', 'conn-text');
    text.append(el('div', 'conn-name', ref?.displayName || logicalName), el('div', 'conn-logical', ref ? connectorInfo(ref.connectorId).name : 'Not found'));
    box.append(text);
    return box;
}

/** The references of a row, each on its own line (the plan keeps them as one text separated by commas). */
export function referencesList(snapshot: Snapshot, joined: string, tone: 'old' | 'new'): HTMLElement {
    const names = joined.split(',').map(n => n.trim()).filter(n => n !== '');
    const list = el('div', 'ref-list');
    list.append(...(names.length > 0 ? names : [joined]).map(n => referenceInline(snapshot, n, tone)));
    return list;
}

/** One line per row of the plan: what it is now and what it will be. */
export function rowsOf(plan: Plan, snapshot: Snapshot): ChangeRow[] {
    return plan.rows.map(r => {
        const blocked = r.blocked;
        if (plan.kind === 'remove' || plan.kind === 'delete') {
            const isFlow = snapshot.flows.some(f => f.flow.id === r.id);
            const gone = el('span', plan.kind === 'delete' ? 'removal-to removal-to--delete' : 'removal-to', r.newValue);
            return { name: r.label, sub: isFlow ? 'Flow' : 'Connection reference', from: el('span', 'removal-from', r.oldValue), to: gone, ...(blocked !== undefined ? { blocked } : {}) };
        }
        if (plan.kind === 'connection') {
            const logical = snapshot.references.find(x => x.reference.id === r.id)?.reference.logicalName;
            return { name: r.label, sub: logical, from: connectionChip(r.oldValue), to: connectionChip(r.newValue), ...(blocked !== undefined ? { blocked } : {}) };
        }
        const view = snapshot.flows.find(f => f.flow.id === r.id);
        return {
            name: r.label,
            sub: view ? `${TYPE_LABEL[view.info.type]} flow` : undefined,
            from: referencesList(snapshot, r.oldValue, 'old'),
            to: referencesList(snapshot, r.newValue, 'new'),
            ...(blocked !== undefined ? { blocked } : {}),
        };
    });
}

/** The warnings of a plan in a highlighted block, or nothing when there are none. */
export function warningsCallout(plan: Plan): HTMLElement | null {
    return plan.warnings.length > 0 ? callout('warning', 'Read before you apply', plan.warnings) : null;
}

/** What is written, in one sentence for each operation. */
export function writtenCallout(plan: Plan): HTMLElement {
    return callout(
        'info',
        'What is written',
        plan.kind === 'connection'
            ? ['Only the connection id of these references is written. Every flow that uses them follows.']
            : ['Only the connection reference name inside each flow definition changes. Everything else in the definition is kept exactly as stored.', 'Flows that are turned on are never written.'],
        'shield',
    );
}

/** The offer to save the old values, and the proof that it was saved. */
export function backupCallout(saved: boolean, onSave: () => void, kind: Plan['kind'] = 'connection'): HTMLElement {
    const deleting = kind === 'delete';
    const save = button(saved ? 'Save again' : 'Save backup', 'secondary', onSave, true);
    save.prepend(icon('save'));
    return callout(
        saved ? 'success' : 'primary',
        saved ? 'Backup saved' : deleting ? 'Save a copy first (strongly recommended)' : 'Save a backup first (recommended)',
        [deleting
            ? 'The definition of every flow and the record of every reference that will be deleted are written to a file you choose. Deleting cannot be undone: this file is the only copy.'
            : 'The old values of every row that will change are written to a file you choose, so you can restore them by hand. Undo is not offered for writes to the environment.'],
        saved ? 'check-circle' : 'save',
        save,
    );
}

/** What it means that the tool turns flows off and on again (feature 011), and which flows. */
export function stateCallout(names: readonly string[]): HTMLElement {
    const c = callout('warning', 'Flows will be turned off', [
        `${names.length === 1 ? 'This flow is' : `These ${names.length} flows are`} turned on. The tool turns ${names.length === 1 ? 'it' : 'them'} off, writes the change, checks it, and turns ${names.length === 1 ? 'it' : 'them'} on again, also when a write fails.`,
        'While a flow is off it does not run: triggers that fire in the meantime are not handled. Runs that already started continue to the end.',
        'Turning a flow on can be refused by the environment (connections, policies): then it stays off, and the result names it so that you can turn it on in the maker portal.',
        'Do not close this tool until the run has finished.',
        `Flows: ${names.join(', ')}.`,
    ], 'power');
    c.classList.add('state-callout');
    return c;
}

/**
 * The permission to turn flows that are on off for the change and on again afterwards (feature 011), asked here, where
 * the write is decided, and only when a flow of the plan is on. Off by default.
 */
export function permissionBlock(plan: Plan, allowed: boolean, onChange: (on: boolean) => void): HTMLElement | null {
    const on = plan.rows.filter(r => r.blocked === TURNED_ON || r.turnOff === true).length;
    if (plan.kind !== 'repoint' || on === 0) return null;
    const root = el('section', allowed ? 'studio-state is-on' : 'studio-state');
    const text = el('div', 'studio-state-text');
    text.append(
        el('strong', 'studio-state-title', 'Turn these flows off for the change and on again afterwards'),
        el('span', 'studio-state-hint', `${on} flow${on === 1 ? ' is' : 's are'} turned on: without this ${on === 1 ? 'it stays' : 'they stay'} blocked and is not written.`),
    );
    root.append(icon('power', 'studio-state-icon'), text, toggle(allowed, 'Turn the flows that are on off and on again', () => onChange(!allowed)));
    return root;
}

export function confirmModal(a: ConfirmArgs, h: ConfirmHandlers): HTMLElement {
    const { plan } = a;
    const writable = writableRows(plan);
    const blocked = plan.rows.length - writable.length;
    const on = writable.reduce((n, r) => n + r.affectedOn, 0);
    const isConnection = plan.kind === 'connection';
    const env = a.environment || 'the connected environment';
    const what = isConnection ? (writable.length === 1 ? 'reference row' : 'reference rows') : (writable.length === 1 ? 'flow' : 'flows');

    const subtitle = el('span', 'modal-env');
    subtitle.append('Environment', connectionBadge(env, 'connected'));

    const body: Node[] = [
        figures([
            { label: isConnection ? 'References to change' : 'Flows to change', value: String(writable.length), icon: isConnection ? 'plug' : 'workflow', tone: 'primary' },
            { label: 'Flows affected', value: String(affectedFlowTotal(plan)), icon: 'workflow', tone: 'info' },
            { label: 'Turned on', value: String(on), icon: 'power', tone: on > 0 ? 'warning' : 'success' },
            { label: 'Not changed', value: String(blocked), icon: 'shield', tone: blocked > 0 ? 'warning' : 'success' },
        ]),
    ];

    const permission = permissionBlock(plan, a.manageState, h.setManageState);
    if (permission) body.push(permission);
    const warnings = warningsCallout(plan);
    if (warnings) body.push(warnings);
    const off = turnOffRows(plan);
    if (off.length > 0) body.push(stateCallout(off.map(r => r.label)));
    body.push(writtenCallout(plan), backupCallout(a.backupSaved, h.saveBackup, plan.kind));

    const foot = el('div', 'ack');
    const label = `I reviewed these changes and understand they are written to ${env}.`;
    foot.append(toggle(a.ack, 'I reviewed these changes', () => h.setAck(!a.ack)), el('span', '', label));
    // The mark is always there, with a reserved width: ticking never moves anything in the footer.
    const state = a.ack ? chip('Confirmed', 'success', 'check') : chip('Required', 'warning', 'alert-triangle');
    state.classList.add('ack-state');
    foot.append(state);
    // Flows that are turned off need a second, explicit acknowledgement of their own (feature 011).
    let footNote: HTMLElement = foot;
    if (off.length > 0) {
        const second = el('div', 'ack');
        second.append(toggle(a.stateAck, 'I understand the flows are turned off', () => h.setStateAck(!a.stateAck)), el('span', '', `I understand that ${off.length} flow${off.length === 1 ? ' is' : 's are'} turned off for the write and turned on again afterwards.`));
        footNote = el('div', 'ack-stack');
        footNote.append(foot, second);
    }

    const overlay = modal({
        tone: 'primary',
        icon: isConnection ? 'link' : 'git-branch',
        title: isConnection ? `Change the connection of ${writable.length} reference${writable.length === 1 ? '' : 's'}` : `Re-point ${writable.length} flow${writable.length === 1 ? '' : 's'}`,
        subtitle,
        body,
        footNote,
        confirm: { label: `Apply to ${writable.length} ${what}`, icon: 'check', danger: true, disabled: !a.ack || (off.length > 0 && !a.stateAck) || writable.length === 0, onConfirm: h.confirm },
        onCancel: h.cancel,
    });
    overlay.classList.add('confirm-overlay');
    overlay.querySelector('.modal')!.classList.add('confirm-dialog');
    makeExpandable(overlay, a.expanded, h.setExpanded);
    return overlay;
}
