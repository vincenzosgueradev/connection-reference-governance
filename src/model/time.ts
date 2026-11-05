/** "2 weeks ago" for recent dates and the local date for older ones. Pure: `now` is a parameter. */
export function timeAgo(iso: string, now: number = Date.now()): string {
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return '';
    const mins = Math.floor((now - t) / 60000);
    if (mins < 0) return new Date(t).toLocaleDateString();
    if (mins < 1) return 'just now';
    const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'} ago`;
    if (mins < 60) return plural(mins, 'minute');
    const hours = Math.floor(mins / 60);
    if (hours < 24) return plural(hours, 'hour');
    const days = Math.floor(hours / 24);
    if (days < 7) return plural(days, 'day');
    const weeks = Math.floor(days / 7);
    if (weeks < 5) return plural(weeks, 'week');
    return new Date(t).toLocaleDateString();
}

/** The full local date and time, for a tooltip. Empty when the value is not a date. */
export function fullDate(iso: string): string {
    const t = Date.parse(iso);
    return Number.isNaN(t) ? '' : new Date(t).toLocaleString();
}
