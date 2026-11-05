import { describe, expect, it } from 'vitest';
import { DEFAULT_SORT, firstDirection, nextSort, sortSolutions } from '../src/model/solutions';
import { fullDate, timeAgo } from '../src/model/time';
import type { SolutionInfo } from '../src/types';
import { guid, solution } from './helpers/fixtures';

const NOW = Date.parse('2026-11-04T12:00:00Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('timeAgo', () => {
    const cases: [string, number, string][] = [
        ['now', 10 * 1000, 'just now'],
        ['1 minute', 1 * MIN, '1 minute ago'],
        ['59 minutes', 59 * MIN, '59 minutes ago'],
        ['1 hour', 60 * MIN, '1 hour ago'],
        ['23 hours', 23 * HOUR, '23 hours ago'],
        ['1 day', 24 * HOUR, '1 day ago'],
        ['6 days', 6 * DAY, '6 days ago'],
        ['1 week', 7 * DAY, '1 week ago'],
        ['4 weeks', 34 * DAY, '4 weeks ago'],
    ];
    for (const [name, ms, text] of cases) it(name, () => expect(timeAgo(ago(ms), NOW)).toBe(text));
    it('five weeks or more gives the local date', () => expect(timeAgo(ago(35 * DAY), NOW)).toBe(new Date(NOW - 35 * DAY).toLocaleDateString()));
    it('a date in the future gives the local date, not a negative time', () => expect(timeAgo(ago(-2 * DAY), NOW)).toBe(new Date(NOW + 2 * DAY).toLocaleDateString()));
    for (const bad of ['', 'nope', 'undefined']) it(`${JSON.stringify(bad)} gives nothing`, () => expect(timeAgo(bad, NOW)).toBe(''));
    it('fullDate is empty for a bad value and not empty for a good one', () => {
        expect(fullDate('nope')).toBe('');
        expect(fullDate(ago(DAY))).not.toBe('');
    });
});

describe('solution sorting', () => {
    const mk = (n: number, name: string, createdOn: string): SolutionInfo => ({ ...solution(), id: guid(n), name, uniqueName: name.toLowerCase(), createdOn });
    const list = [mk(1, 'beta', ago(2 * DAY)), mk(2, 'Alpha', ago(10 * DAY)), mk(3, 'gamma', ''), mk(4, 'delta', ago(1 * DAY))];
    const counts = { [guid(1)]: 3, [guid(2)]: 3, [guid(4)]: 9 };
    const names = (l: SolutionInfo[]) => l.map(s => s.name);

    it('by flows, most first; equal counts by name; unknown counts last', () => {
        expect(names(sortSolutions(list, counts, DEFAULT_SORT))).toEqual(['delta', 'Alpha', 'beta', 'gamma']);
    });
    it('by flows, fewest first, unknown first', () => {
        expect(names(sortSolutions(list, counts, { key: 'flows', desc: false }))).toEqual(['gamma', 'Alpha', 'beta', 'delta']);
    });
    it('by name ignores case, both directions', () => {
        expect(names(sortSolutions(list, counts, { key: 'name', desc: false }))).toEqual(['Alpha', 'beta', 'delta', 'gamma']);
        expect(names(sortSolutions(list, counts, { key: 'name', desc: true }))).toEqual(['gamma', 'delta', 'beta', 'Alpha']);
    });
    it('by created, newest first; a missing date counts as oldest', () => {
        expect(names(sortSolutions(list, counts, { key: 'created', desc: true }))).toEqual(['delta', 'beta', 'Alpha', 'gamma']);
        expect(names(sortSolutions(list, counts, { key: 'created', desc: false }))).toEqual(['gamma', 'Alpha', 'beta', 'delta']);
    });
    it('without counts every solution is equal and the order falls back to the name', () => {
        expect(names(sortSolutions(list, null, DEFAULT_SORT))).toEqual(['Alpha', 'beta', 'delta', 'gamma']);
    });
    it('does not change the list it is given', () => {
        const copy = [...list];
        sortSolutions(list, counts, DEFAULT_SORT);
        expect(list).toEqual(copy);
    });
    it('the first direction of a column and the flip', () => {
        expect(firstDirection('name')).toEqual({ key: 'name', desc: false });
        expect(firstDirection('flows')).toEqual({ key: 'flows', desc: true });
        expect(firstDirection('created')).toEqual({ key: 'created', desc: true });
        expect(nextSort({ key: 'flows', desc: true }, 'flows')).toEqual({ key: 'flows', desc: false });
        expect(nextSort({ key: 'flows', desc: false }, 'name')).toEqual({ key: 'name', desc: false });
    });
});
