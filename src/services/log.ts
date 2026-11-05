/**
 * Operation log: kept in memory, mirrored in a side panel, exportable. It never leaves the device.
 * Never log tokens, secrets or record contents.
 */

export type LogLevel = 'info' | 'success' | 'warning' | 'error';

export interface LogEntry {
    timestamp: string;
    level: LogLevel;
    message: string;
}

const entries: LogEntry[] = [];
let mount: HTMLElement | null = null;

export function attachLog(el: HTMLElement): void {
    mount = el;
}

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

export function log(message: string, level: LogLevel = 'info'): void {
    const now = new Date();
    entries.push({ timestamp: now.toISOString(), level, message });
    if (!mount) return;
    const row = document.createElement('div');
    row.className = `log-entry log-entry--${level}`;
    row.innerHTML = `<span class="log-timestamp">${now.toTimeString().slice(0, 8)}</span>${escapeHtml(message)}`;
    mount.appendChild(row);
    mount.scrollTop = mount.scrollHeight;
}

export function clearLog(): void {
    entries.length = 0;
    if (mount) mount.innerHTML = '';
}

export function getEntries(): readonly LogEntry[] {
    return entries;
}

export function toJson(): string {
    return JSON.stringify(entries, null, 2);
}
