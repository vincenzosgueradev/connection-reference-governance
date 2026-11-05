import { backupCallout, rowsOf } from './confirm';
import { writableRows } from '../model/plans';
import type { Plan, Snapshot } from '../types';
import { button, callout, changeList, connectionBadge, el, icon, modal, toggle } from '../ui/components';

/**
 * The dialog of Remove from solution and Delete (feature 019): one popup instead of a preview step. It says what will
 * happen and in which order, lists every row with the reason when it is blocked, offers a copy of what will go, and for
 * Delete keeps the button locked until the code shown has been copied and pasted. DOM only; every rule is in the plan
 * and in the state.
 */

export interface RemovalArgs {
    plan: Plan;
    snapshot: Snapshot;
    environment: string;
    ack: boolean;
    backupSaved: boolean;
    /** The code to paste (Delete only) and what was pasted. */
    code: string;
    typed: string;
    /** Only when a flow that is on will be turned off before it is deleted. */
    stateAck?: boolean;
}

export interface RemovalHandlers {
    confirm(): void;
    cancel(): void;
    saveBackup(): void;
    setAck(on: boolean): void;
    setTyped(value: string): void;
    setStateAck?(on: boolean): void;
}

/** True when the pasted text is the code that was shown (spaces around it do not matter). */
export const codeMatches = (code: string, typed: string): boolean => code !== '' && typed.trim() === code;

/** The code to copy, the field to paste it in, and the proof that it matches. */
function codeGate(a: RemovalArgs, h: RemovalHandlers): HTMLElement {
    const ok = codeMatches(a.code, a.typed);
    const root = el('section', ok ? 'removal-gate is-open' : 'removal-gate');
    const head = el('div', 'removal-gate-head');
    head.append(icon(ok ? 'check-circle' : 'lock'), el('strong', '', ok ? 'Delete unlocked' : 'Copy the code and paste it to unlock Delete'));
    const row = el('div', 'removal-gate-row');
    const code = el('code', 'removal-code', a.code);
    const copy = button('Copy code', 'secondary', () => {
        try {
            void navigator.clipboard.writeText(a.code).catch(() => undefined);
        } catch {
            // the code can also be typed
        }
    }, true);
    copy.prepend(icon('copy', 'icon--sm'));
    const field = el('input', 'text-input removal-input');
    field.type = 'text';
    field.value = a.typed;
    field.placeholder = 'Paste the code here';
    field.autocomplete = 'off';
    field.spellcheck = false;
    field.setAttribute('aria-label', 'Confirmation code');
    field.setAttribute('aria-invalid', String(a.typed !== '' && !ok));
    field.addEventListener('input', () => h.setTyped(field.value));
    row.append(code, copy, field);
    root.append(head, row, el('p', 'removal-gate-hint', 'The code changes every time this dialog is opened. It exists so that a delete is never one click away.'));
    return root;
}

export function removalModal(a: RemovalArgs, h: RemovalHandlers): HTMLElement {
    const { plan } = a;
    const deleting = plan.kind === 'delete';
    const writable = writableRows(plan);
    const blocked = plan.rows.length - writable.length;
    const env = a.environment || 'the connected environment';
    const flowsIn = writable.filter(r => a.snapshot.flows.some(f => f.flow.id === r.id)).length;
    const refsIn = writable.length - flowsIn;
    const noun = [flowsIn > 0 ? `${flowsIn} flow${flowsIn === 1 ? '' : 's'}` : '', refsIn > 0 ? `${refsIn} connection reference${refsIn === 1 ? '' : 's'}` : ''].filter(t => t !== '').join(' and ') || 'rows';
    const off = writable.filter(r => r.turnOff === true).length;

    const subtitle = el('span', 'modal-env');
    subtitle.append('Environment', connectionBadge(env, 'connected'));

    const body: Node[] = [];
    // one line: what this does, and the one thing to know
    const lead = el('p', deleting ? 'removal-lead removal-lead--delete' : 'removal-lead');
    lead.append(icon(deleting ? 'alert-triangle' : 'info'), deleting
        ? 'Permanent: the rows are removed from the environment and from every solution that holds them. The connection behind a reference is not deleted.'
        : 'The rows leave this solution only: they stay in the environment and in any other solution.');
    body.push(lead, changeList(rowsOf(plan, a.snapshot)));
    if (blocked > 0 && deleting) body.push(callout('warning', `${blocked} blocked`, ['What still depends on a row, or could not be checked, is never deleted: re-point or remove it first.'], 'shield'));
    // removing loses nothing, so only a delete offers the copy
    if (deleting) body.push(backupCallout(a.backupSaved, h.saveBackup, plan.kind));
    if (deleting && writable.length > 0) body.push(codeGate(a, h));

    const foot = el('div', 'ack');
    const label = deleting ? `I understand that ${noun} will be permanently deleted from ${env}.` : `I understand that ${noun} will leave this solution in ${env}.`;
    foot.append(toggle(a.ack, 'I understand', () => h.setAck(!a.ack)), el('span', '', label));

    // a flow that is on is turned off before it is deleted: that needs its own acknowledgement
    let footNote: HTMLElement = foot;
    if (off > 0 && h.setStateAck) {
        const second = el('div', 'ack');
        second.append(toggle(a.stateAck === true, 'I understand the flows are turned off', () => h.setStateAck!(!a.stateAck)), el('span', '', `I understand that ${off} flow${off === 1 ? ' is' : 's are'} turned off before ${off === 1 ? 'it is' : 'they are'} deleted.`));
        footNote = el('div', 'ack-stack');
        footNote.append(foot, second);
    }
    const locked = writable.length === 0 || !a.ack || (off > 0 && a.stateAck !== true) || (deleting && !codeMatches(a.code, a.typed));
    const overlay = modal({
        tone: deleting ? 'error' : 'primary',
        icon: deleting ? 'trash' : 'minus',
        title: deleting ? `Delete ${noun} permanently` : `Remove ${noun} from this solution`,
        subtitle,
        body,
        footNote,
        confirm: { label: deleting ? `Delete ${writable.length} row${writable.length === 1 ? '' : 's'}` : `Remove ${writable.length} row${writable.length === 1 ? '' : 's'}`, icon: deleting ? 'trash' : 'check', danger: deleting, disabled: locked, onConfirm: h.confirm },
        onCancel: h.cancel,
    });
    overlay.classList.add('confirm-overlay', 'removal-overlay');
    overlay.querySelector('.modal')!.classList.add('confirm-dialog', 'removal-dialog');
    return overlay;
}
