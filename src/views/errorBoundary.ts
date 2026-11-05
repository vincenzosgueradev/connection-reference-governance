import { log } from '../services/log';

/** Last line of defence: anything not handled as a Result becomes a visible message and a log entry. */
export function installErrorBoundary(show: (message: string) => void): void {
    const report = (what: unknown) => {
        const message = what instanceof Error ? what.message : String(what);
        log(`Unexpected error: ${message}`, 'error');
        show(`Something went wrong: ${message}`);
    };
    window.addEventListener('error', e => report(e.error ?? e.message));
    window.addEventListener('unhandledrejection', e => report(e.reason));
}
