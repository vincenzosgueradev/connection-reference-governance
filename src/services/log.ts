/**
 * Operation log: kept in memory, shown in the log dock at the bottom of the window, exportable. It never leaves the
 * device. Never log tokens, secrets or record contents.
 */

export type LogLevel = 'info' | 'success' | 'warning' | 'error';

export interface LogEntry {
    timestamp: string;
    level: LogLevel;
    message: string;
}

/** The oldest entries go first: the log is for the current session, not an archive. */
export const MAX_ENTRIES = 500;

const entries: LogEntry[] = [];
const listeners = new Set<() => void>();

function notify(): void {
    for (const fn of listeners) {
        try {
            fn();
        } catch {
            // a failing listener never stops the tool
        }
    }
}

/** Calls `fn` after every change; returns the function that stops it. */
export function subscribeLog(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

export function log(message: string, level: LogLevel = 'info'): void {
    entries.push({ timestamp: new Date().toISOString(), level, message });
    if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
    notify();
}

export function clearLog(): void {
    entries.length = 0;
    notify();
}

export function getEntries(): readonly LogEntry[] {
    return entries;
}

export function toJson(): string {
    return JSON.stringify(entries, null, 2);
}
