import { stepIndex, stepTitle, STEPS, type WizardStep } from '../model/workflow';
import { button, el, icon, stepper } from '../ui/components';

/** The frame every step of a change shares: title with icon, the stepper at the right, the body and the buttons. */

const STEP_ICON: Record<WizardStep, string> = { preview: 'eye', apply: 'refresh', result: 'check-circle' };

export function stepFrame(step: WizardStep, body: readonly Node[], footer: readonly Node[]): HTMLElement {
    const root = el('div', 'step-panel');
    const head = el('div', 'step-header-row');
    const title = el('h2', 'step-title');
    title.append(icon(STEP_ICON[step]), stepTitle(step));
    head.append(title, stepper(STEPS, stepIndex(step)));
    const foot = el('div', 'step-footer');
    foot.append(...footer);
    root.append(head, ...body, foot);
    return root;
}

export function spacer(): HTMLElement {
    return el('span', 'spacer');
}

/** A footer button with an icon in front (back) or behind (forward). */
export function stepButton(label: string, kind: 'primary' | 'secondary' | 'danger', iconName: string, onClick: () => void, opts: { disabled?: boolean; title?: string; after?: boolean } = {}): HTMLButtonElement {
    const b = button(label, kind, onClick);
    if (opts.after) b.append(icon(iconName)); else b.prepend(icon(iconName));
    b.disabled = opts.disabled === true;
    if (opts.title) b.title = opts.title;
    return b;
}
