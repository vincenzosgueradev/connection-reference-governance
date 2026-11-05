/** The steps of a change and which moves between them are allowed. Pure. */

export type StepKey = 'choose' | 'preview' | 'apply' | 'result';
export type WizardStep = Exclude<StepKey, 'choose'>;
export type OperationKind = 'connection' | 'repoint' | 'remove' | 'delete';
/** `leave` discards the plan and returns to the choices. */
export type Move = WizardStep | 'leave';

export const STEPS: readonly { key: StepKey; label: string }[] = [
    { key: 'choose', label: 'Choose' },
    { key: 'preview', label: 'Preview' },
    { key: 'apply', label: 'Apply' },
    { key: 'result', label: 'Result' },
];

export const stepIndex = (key: StepKey): number => STEPS.findIndex(s => s.key === key);

/**
 * The Preview can be left (back to the choices). Apply is never reached by a plain move (only through the confirmation,
 * which starts the write) and, once started, cannot be left backwards: the only way out is the Result.
 */
export function canMove(from: WizardStep, to: Move): boolean {
    if (from === 'preview' || from === 'result') return to === 'leave';
    return false;
}

export interface Crumb {
    readonly key: WizardStep;
    readonly label: string;
    /** Earlier steps are links until the write has started. */
    readonly link: boolean;
}

export function crumbsFor(current: WizardStep): Crumb[] {
    const open = current === 'preview';
    return STEPS.filter(s => s.key !== 'choose' && stepIndex(s.key) <= stepIndex(current)).map(s => ({
        key: s.key as WizardStep,
        label: s.label,
        link: open && stepIndex(s.key) < stepIndex(current),
    }));
}

export const operationLabel = (kind: OperationKind): string =>
    ({ connection: 'Change connection', repoint: 'Re-point flows', remove: 'Remove from this solution', delete: 'Delete' })[kind];

export function stepTitle(step: WizardStep): string {
    return { preview: 'Preview what will be stored', apply: 'Processing your changes', result: 'Result' }[step];
}
