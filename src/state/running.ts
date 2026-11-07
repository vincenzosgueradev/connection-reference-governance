import type { State } from './reducer';

/**
 * Whether an action is running (constitution T8, the global rule of feature 022/023): the solution or a list is being read,
 * a write or a check is going on, the connections are being read, a reference is being created. While it is true every
 * button of the tool is disabled (views/main.ts, once, after each draw); the control that started the work shows its own
 * progress (a spinner, aria-busy) and keeps its normal look. Pure.
 */
export function actionRunning(s: State): boolean {
    return s.busy
        || Object.values(s.dependencies).some(d => d.status === 'loading')
        || s.newReference?.saving === true
        || s.newReference?.live.status === 'loading'
        || (s.wizard !== null && s.wizard.step === 'apply');
}
