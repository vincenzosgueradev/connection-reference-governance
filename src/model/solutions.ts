import type { SolutionInfo } from '../types';

/** Sorting and counting of the solution list. Pure. */

export type SolutionSortKey = 'name' | 'flows' | 'created';

export interface SolutionSort {
    readonly key: SolutionSortKey;
    readonly desc: boolean;
}

export const DEFAULT_SORT: SolutionSort = { key: 'flows', desc: true };

/** Names read A to Z first; counts and dates read biggest and newest first. */
export function firstDirection(key: SolutionSortKey): SolutionSort {
    return { key, desc: key !== 'name' };
}

/** Clicking the sorted column flips it; clicking another one starts in that column's natural direction. */
export function nextSort(current: SolutionSort, key: SolutionSortKey): SolutionSort {
    return current.key === key ? { key, desc: !current.desc } : firstDirection(key);
}

export function sortSolutions(list: readonly SolutionInfo[], counts: Readonly<Record<string, number>> | null, sort: SolutionSort): SolutionInfo[] {
    const byName = (a: SolutionInfo, b: SolutionInfo) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    const value = (s: SolutionInfo): number => {
        if (sort.key === 'flows') return counts?.[s.id] ?? -1; // unknown counts go last when descending
        const t = Date.parse(s.createdOn);
        return Number.isNaN(t) ? 0 : t;
    };
    const dir = sort.desc ? -1 : 1;
    return [...list].sort((a, b) => {
        if (sort.key === 'name') return dir * byName(a, b);
        const d = value(a) - value(b);
        return d !== 0 ? dir * d : byName(a, b);
    });
}
