import { DELETION_STEPS, deletionPercent, writableRows } from '../model/connectionPlan';
import { banner, formatElapsed, summarize } from '../model/progress';
import type { State } from '../state/reducer';
import type { Store } from '../state/store';
import { shortId } from '../model/connections';
import { button, callout, connectionBadge, dataTable, detailBlock, el, figures, icon, modal, pipeline, tableWrap, toggle, type PipelineStep } from '../ui/components';
import { connectorTile } from './connections';
import type { CmDeletion } from '../state/connectionsState';
import { usageShort } from '../model/connectorUsage';
import type { ConnectionsHandlers } from './connectionsHandlers';
import { outcomeChip } from './outcome';
import { codeMatches } from './removal';

/**
 * The dialog of the deletion of connections (feature 024, constitution T11): Preview and confirmation, then the run, then
 * the Result, all in one dialog. It exists in the page only while a deletion is open, and a deletion can only be opened
 * while the declared flag is on. Apply stays locked until the code shown is pasted and the acknowledgement is on. DOM
 * only; every rule is in the plan and in the state.
 */

/** One step of "Before you delete": a number that becomes a tick, a title, what it says now, and its body. */
function stepCard(n: number, title: string, hint: string, done: boolean, state: string, action: HTMLElement | undefined, content: Node[]): HTMLElement {
    const card = el('section', done ? 'cm-del-step is-done' : 'cm-del-step');
    const head = el('div', 'cm-del-step-head');
    const num = el('span', 'cm-del-num');
    if (done) num.append(icon('check', 'icon--sm'));
    else num.append(String(n));
    const text = el('div', 'cm-del-step-text');
    text.append(el('strong', '', title), el('span', 'cm-del-step-hint', hint));
    head.append(num, text, el('span', 'cm-del-state', state));
    if (action) head.append(action);
    card.append(head);
    if (content.length > 0) {
        const body = el('div', 'cm-del-step-body');
        body.append(...content);
        card.append(body);
    }
    return card;
}

function codeBody(code: string, typed: string, store: Store): HTMLElement {
    const ok = codeMatches(code, typed);
    const row = el('div', 'removal-gate-row');
    const shown = el('code', 'removal-code', code);
    const copy = button('Copy code', 'secondary', () => {
        try {
            void navigator.clipboard.writeText(code).catch(() => undefined);
        } catch {
            // the code can also be typed
        }
    }, true);
    copy.prepend(icon('copy', 'icon--sm'));
    const field = el('input', 'text-input removal-input');
    field.type = 'text';
    field.value = typed;
    field.placeholder = 'Paste the code here';
    field.autocomplete = 'off';
    field.spellcheck = false;
    field.setAttribute('aria-label', 'Confirmation code');
    field.setAttribute('aria-invalid', String(typed !== '' && !ok));
    field.addEventListener('input', () => store.dispatch({ type: 'cmDeletionTyped', text: field.value }));
    row.append(shown, copy, field);
    return row;
}

/** The run, alive: the ring, what is done now, the four steps of the connection in hand, the counters, every connection, and a log with the time of each line. */
function runPanel(d: CmDeletion, env: string): HTMLElement {
    const panel = el('section', 'run-panel');
    const done = d.live.length;
    const percent = deletionPercent(done, d.total, d.current?.step ?? null);
    const elapsed = Math.max(0, d.now - d.startedAt);
    const hero = el('div', 'run-hero');

    const ring = el('div', 'run-ring is-moving');
    ring.style.setProperty('--p', String(percent));
    ring.setAttribute('role', 'progressbar');
    ring.setAttribute('aria-label', 'Progress of the deletion');
    ring.setAttribute('aria-valuemin', '0');
    ring.setAttribute('aria-valuemax', '100');
    ring.setAttribute('aria-valuenow', String(percent));
    ring.append(el('span', 'run-percent', `${percent}%`));

    const titles = el('div', 'run-titles');
    const head = el('div', 'run-headline-row');
    head.append(el('h3', 'run-headline', 'Deleting the connections'));
    const doing = d.current ? DELETION_STEPS.find(x => x.key === d.current!.step)!.doing : 'Starting';
    const left = done > 0 && done < d.total ? `  -  about ${formatElapsed((elapsed / done) * (d.total - done))} left` : '';
    const now = el('p', 'run-now', `Connection ${Math.min(done + 1, Math.max(d.total, 1))} of ${d.total}: ${doing}`);
    now.setAttribute('role', 'status');
    now.setAttribute('aria-live', 'polite');
    titles.append(head, now, el('p', 'run-sub', `Time elapsed ${formatElapsed(elapsed)}${left}`), el('p', 'run-sub', `Deleting in ${env}. Do not close this tool until it finishes.`));

    const phases = el('div', 'run-phases');
    const at = d.current ? DELETION_STEPS.findIndex(x => x.key === d.current!.step) : -1;
    const steps: PipelineStep[] = DELETION_STEPS.map((x, i) => ({ label: x.label, state: d.current === null ? 'pending' : i < at ? 'done' : i === at ? 'active' : 'pending' }));
    phases.append(pipeline(steps, d.current ? d.current.label : '\u00a0'));

    const counters = el('div', 'run-counters');
    const count = (status: 'done' | 'failed' | 'skipped', label: string) => {
        const box = el('span', `run-count run-count--${status}`);
        box.append(el('b', '', String(d.live.filter(o => o.status === status).length)), el('span', '', label));
        return box;
    };
    counters.append(count('done', 'deleted'), count('skipped', 'skipped'), count('failed', 'failed'));
    hero.append(ring, titles, phases, counters);

    // the log: one line per thing done, newest at the bottom, with the time since the start
    const log = el('div', 'cm-runlog');
    log.setAttribute('role', 'log');
    log.setAttribute('aria-label', 'What is being done');
    for (const l of d.log) {
        const line = el('div', `cm-runlog-line cm-runlog-line--${l.tone}`);
        line.append(el('span', 'cm-runlog-time', formatElapsed(l.at)), el('span', 'cm-runlog-text', l.text));
        log.append(line);
    }
    panel.append(hero, el('div', 'run-rows-head cm-runlog-head', 'Log'), log);
    queueMicrotask(() => { log.scrollTop = log.scrollHeight; });
    return panel;
}

/** The list of the portal confirmation: each connection is ticked once it was looked at in the Maker portal. */
function portalList(d: CmDeletion, writable: ReturnType<typeof writableRows>, store: Store, h: ConnectionsHandlers, hint: (connectorKey: string) => string | undefined): HTMLElement {
    const list = el('ul', 'cm-portal-list');
    for (const r of writable) {
        const on = d.portalChecked.includes(r.name);
        const li = el('li', 'cm-portal-item');
        // the whole left side is one control: a square box that shows a tick when it is on, the name, and what the inventory says about the connector
        const pick = el('button', on ? 'cm-portal-pick is-on' : 'cm-portal-pick');
        pick.type = 'button';
        pick.setAttribute('role', 'checkbox');
        pick.setAttribute('aria-checked', String(on));
        pick.setAttribute('aria-label', `Confirmed in the portal: ${r.label}`);
        pick.addEventListener('click', () => store.dispatch({ type: 'cmDeletionPortal', name: r.name, on: !on }));
        const box = el('span', 'cm-portal-box');
        if (on) box.append(icon('check', 'icon--sm'));
        const sub = [`${r.connector === '' ? r.connectorKey : r.connector}`, `#${shortId(r.name)}`, hint(r.connectorKey)].filter((t): t is string => t !== undefined && t !== '');
        const text = el('span', 'cm-portal-text');
        text.append(el('span', 'cm-portal-name', r.label), el('span', 'cm-portal-hint', sub.join('  -  ')));
        pick.append(box, text);
        const copy = button('Copy address', 'secondary', () => void h.copyAddress(r.name), true);
        copy.prepend(icon('copy', 'icon--sm'));
        copy.setAttribute('aria-label', `Copy the portal address of ${r.label}`);
        li.append(pick, el('span', 'cm-portal-state', on ? 'Confirmed' : 'To confirm'), copy);
        list.append(li);
    }
    return list;
}

export function connectionDeletion(s: State, store: Store, h: ConnectionsHandlers, environment: string): HTMLElement {
    const d = s.connections.deletion!;
    const plan = d.plan;
    const writable = writableRows(plan);
    const blocked = plan.rows.length - writable.length;
    const noun = `${writable.length} connection${writable.length === 1 ? '' : 's'}`;
    const env = environment || 'the connected environment';
    const subtitle = el('span', 'modal-env');
    subtitle.append('Environment', connectionBadge(env, 'connected'));

    const body: Node[] = [];
    let title = `Delete ${noun} permanently`;
    let footNote: HTMLElement | undefined;
    let locked = true;
    const confirmLabel = `Delete ${noun}`;

    if (d.step === 'preview') {
        // the summary: one sentence of what happens, one of what the tool cannot see
        const summary = el('section', 'cm-del-summary');
        summary.append(icon('alert-triangle'));
        const words = el('div', 'cm-del-summary-text');
        words.append(
            el('strong', '', `${noun} will be permanently removed from ${env}`),
            el('span', '', 'A connection reference that holds one will show it as missing. This cannot be undone.'),
        );
        summary.append(words);
        body.push(summary);
        if (blocked > 0) body.push(el('p', 'cm-del-blocked', `${blocked} more ${blocked === 1 ? 'connection is' : 'connections are'} blocked and will not be deleted: something still depends on ${blocked === 1 ? 'it' : 'them'}, or ${blocked === 1 ? 'it' : 'they'} could not be checked.`));

        // what goes: a compact list, one line each
        const goes = el('section', 'cm-del-block');
        goes.append(el('h4', 'cm-del-title', `Connections to delete  ${writable.length}`));
        const list = el('ul', 'cm-del-list');
        for (const r of writable) {
            const li = el('li', 'cm-del-item');
            li.append(connectorTile(`shared_${r.connectorKey}`, false, true));
            const t = el('span', 'cm-del-item-text');
            t.append(el('span', 'cm-del-item-name', r.label), el('span', 'cm-del-item-sub', [r.connector === '' ? r.connectorKey : r.connector, r.creator, `#${shortId(r.name)}`].filter(x => x !== '').join('  -  ')));
            li.append(t);
            list.append(li);
        }
        goes.append(list);
        body.push(goes);

        // what to do before: three steps, each with its own state
        const steps = el('section', 'cm-del-block');
        steps.append(el('h4', 'cm-del-title', 'Before you delete'));
        const save = button(d.backupSaved ? 'Save again' : 'Save backup', 'secondary', () => void h.saveBackup(), true);
        save.prepend(icon('save', 'icon--sm'));
        const checked = writable.filter(r => d.portalChecked.includes(r.name)).length;
        const codeOk = codeMatches(d.code, d.typedCode);
        const allChecked = writable.length > 0 && checked === writable.length;
        const every = button(allChecked ? 'Clear all' : 'Select all', 'secondary', () => store.dispatch({ type: 'cmDeletionPortalAll', on: !allChecked }), true);
        every.prepend(icon(allChecked ? 'x-circle' : 'check-circle', 'icon--sm'));
        every.title = allChecked ? 'Remove every confirmation' : 'Confirm every connection of the list in one go, once you have looked at each one in the portal';
        steps.append(
            stepCard(1, 'Save a backup', 'The records (name, connector, display name, creator name, time, status) go to a file you choose: no secret, no email. It is the only copy.', d.backupSaved, d.backupSaved ? 'Saved' : 'Recommended', save, []),
            stepCard(2, 'Confirm each one in the Maker portal', 'The tool cannot see flows that are outside any solution. Copy the address, open the connection, look at Flows using this connection and Apps using this connection, then tick it.', writable.length > 0 && checked === writable.length, `${checked} of ${writable.length}`, writable.length > 1 ? every : undefined, writable.length > 0 ? [portalList(d, writable, store, h, key => usageShort(s.connections.usage.map, key))] : []),
            stepCard(3, 'Paste the code to unlock Delete', 'The code changes every time this dialog is opened, so a delete is never one click away.', codeOk, codeOk ? 'Unlocked' : 'Required', undefined, writable.length > 0 ? [codeBody(d.code, d.typedCode, store)] : []),
        );
        body.push(steps);
        const ack = el('div', 'ack');
        ack.append(toggle(d.ack, 'I understand', () => store.dispatch({ type: 'cmDeletionAck', on: !d.ack })), el('span', '', `I understand that ${noun} will be permanently deleted from ${env}.`));
        footNote = ack;
        locked = writable.length === 0 || !d.ack || !codeOk || !writable.every(r => d.portalChecked.includes(r.name));
    } else if (d.step === 'apply') {
        title = 'Deleting connections';
        body.push(runPanel(d, env));
    } else {
        title = 'Result';
        const results = d.results ?? [];
        const sum = summarize(results);
        const b = banner(sum, d.refreshFailed);
        const bar = callout(b.tone, b.title, b.lines);
        bar.classList.add('callout--compact');
        body.push(
            bar,
            figures([
                { label: 'Deleted', value: String(sum.changed), icon: 'check-circle', tone: 'success' },
                { label: 'Skipped', value: String(sum.skipped), icon: 'alert-triangle', tone: sum.skipped > 0 ? 'warning' : 'success' },
                { label: 'Failed', value: String(sum.failed), icon: 'x-circle', tone: sum.failed > 0 ? 'error' : 'success' },
                { label: 'Duration', value: formatElapsed(Math.max(0, d.now - d.startedAt)), icon: 'clock', tone: 'info' },
            ]),
            detailBlock('Rows', sum.total, tableWrap(dataTable(['Connection', 'Outcome', 'Message'], results, o => [el('span', 'cell-strong', o.label), outcomeChip(o.status), o.message])), false, 'list'),
        );
    }

    const overlay = modal({
        tone: d.step === 'result' ? 'primary' : 'error',
        icon: 'trash',
        title,
        subtitle,
        body,
        ...(footNote ? { footNote } : {}),
        confirm: { label: confirmLabel, icon: 'trash', danger: true, disabled: locked, onConfirm: () => h.confirmDeletion() },
        cancelLabel: 'Cancel',
        onCancel: () => h.closeDeletion(),
    });
    overlay.classList.add('confirm-overlay', 'removal-overlay', 'cm-deletion');
    overlay.querySelector('.modal')!.classList.add('confirm-dialog', 'removal-dialog');
    // the run and the Result have their own buttons
    const actions = overlay.querySelector<HTMLElement>('.modal-actions')!;
    // while the deletion runs nothing can close the dialog: no buttons and no cross (the state refuses a close as well)
    if (d.step === 'apply') {
        actions.replaceChildren();
        overlay.querySelector('.modal-close')?.remove();
    }
    if (d.step === 'result') {
        const save = button('Save report', 'secondary', () => void h.saveReport());
        save.prepend(icon('save'));
        const close = button('Close', 'primary', () => h.closeDeletion());
        close.dataset['autofocus'] = 'true';
        actions.replaceChildren(save, close);
    }
    return overlay;
}
