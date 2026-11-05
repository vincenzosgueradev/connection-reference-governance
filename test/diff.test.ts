import { describe, expect, it } from 'vitest';
import { CONTEXT_LINES, lineDiff, splitLines } from '../src/model/diff';

const lines = (n: number, prefix = 'line') => Array.from({ length: n }, (_, i) => `${prefix} ${i + 1}`);
const text = (l: string[]) => l.join('\n');
const kinds = (d: ReturnType<typeof lineDiff>) => d.rows.map(r => r.kind);

// Independent oracle: the old text is every row that is not added, the new text every row that is not removed.
const oldOf = (d: ReturnType<typeof lineDiff>) => d.rows.filter(r => r.kind !== 'added').map(r => r.oldText);
const newOf = (d: ReturnType<typeof lineDiff>) => d.rows.filter(r => r.kind !== 'removed').map(r => r.newText);

describe('splitLines', () => {
    it('splits on LF and CRLF alike and ignores the final newline', () => {
        expect(splitLines('a\nb\n')).toEqual(['a', 'b']);
        expect(splitLines('a\r\nb')).toEqual(['a', 'b']);
        expect(splitLines('')).toEqual([]);
        expect(splitLines('\n')).toEqual(['']);
    });
});

describe('lineDiff: shape', () => {
    it('two equal texts have no change', () => {
        const d = lineDiff(text(lines(10)), text(lines(10)));
        expect(d).toMatchObject({ changed: false, added: 0, removed: 0, rows: [], tooLarge: false });
    });
    it('a line ending difference alone is not a change', () => {
        expect(lineDiff('a\nb', 'a\r\nb\n').changed).toBe(false);
    });
    it('one changed line in the middle shows three lines of context and a collapsed band on each side', () => {
        const a = lines(30);
        const b = [...a];
        b[14] = 'line 15 CHANGED';
        const d = lineDiff(text(a), text(b));
        expect(CONTEXT_LINES).toBe(3);
        expect(kinds(d)).toEqual(['gap', 'context', 'context', 'context', 'changed', 'context', 'context', 'context', 'gap']);
        expect(d.rows[0]).toMatchObject({ kind: 'gap', skipped: 11 });
        expect(d.rows[8]).toMatchObject({ kind: 'gap', skipped: 12 });
        expect(d.rows[4]).toMatchObject({ oldNo: 15, newNo: 15, oldText: 'line 15', newText: 'line 15 CHANGED' });
        expect([d.added, d.removed]).toEqual([1, 1]);
    });
    it('a change at the very start or end has context on one side only', () => {
        const a = lines(20);
        const first = lineDiff(text(a), text(['new first', ...a.slice(1)]));
        expect(kinds(first)).toEqual(['changed', 'context', 'context', 'context', 'gap']);
        const last = lineDiff(text(a), text([...a.slice(0, 19), 'new last']));
        expect(kinds(last)).toEqual(['gap', 'context', 'context', 'context', 'changed']);
    });
    it('a hidden stretch of one line is shown, not collapsed; of two or more it becomes a band', () => {
        const a = lines(12);
        const change = (...at: number[]) => { const b = [...a]; at.forEach(i => { b[i] = `X${i}`; }); return lineDiff(text(a), text(b)); };
        // changes at 0 and 8: 7 lines between, 3 + 3 shown, 1 would be hidden: all shown
        expect(kinds(change(0, 8)).includes('gap')).toBe(false);
        // changes at 0 and 9: 8 lines between, 2 hidden: a band of 2
        const gap = change(0, 9).rows.find(r => r.kind === 'gap')!;
        expect(gap.skipped).toBe(2);
    });
    it('added and removed lines have a number on one side only', () => {
        const a = lines(8);
        const added = lineDiff(text(a), text([...a.slice(0, 4), 'inserted', ...a.slice(4)]));
        const row = added.rows.find(r => r.kind === 'added')!;
        expect([row.oldNo, row.newNo, row.newText]).toEqual([null, 5, 'inserted']);
        const removed = lineDiff(text(a), text([...a.slice(0, 4), ...a.slice(5)]));
        const gone = removed.rows.find(r => r.kind === 'removed')!;
        expect([gone.oldNo, gone.newNo, gone.oldText]).toEqual([5, null, 'line 5']);
    });
    it('a run of removed and added lines is paired line by line, the leftover is removed or added', () => {
        const a = ['keep', 'a1', 'a2', 'keep2'];
        const twoForOne = lineDiff(text(a), text(['keep', 'b1', 'keep2']));
        expect(kinds(twoForOne)).toEqual(['context', 'changed', 'removed', 'context']);
        const oneForTwo = lineDiff(text(['keep', 'a1', 'keep2']), text(['keep', 'b1', 'b2', 'keep2']));
        expect(kinds(oneForTwo)).toEqual(['context', 'changed', 'added', 'context']);
    });
    it('creating and emptying a text', () => {
        const created = lineDiff('', text(lines(3)));
        expect(kinds(created)).toEqual(['added', 'added', 'added']);
        expect([created.added, created.removed]).toEqual([3, 0]);
        const emptied = lineDiff(text(lines(3)), '');
        expect(kinds(emptied)).toEqual(['removed', 'removed', 'removed']);
    });
});

describe('lineDiff: the changed words inside a changed line', () => {
    const span = (a: string, b: string) => {
        const r = lineDiff(a, b).rows[0]!;
        return [r.oldSpan, r.newSpan];
    };
    it('marks what differs between the common start and the common end', () => {
        expect(span('name: one', 'name: two')).toEqual([[6, 9], [6, 9]]);
        expect(span('  "a": "x1",', '  "a": "x22",')).toEqual([[9, 10], [9, 11]]);
    });
    it('marks the whole line when nothing is shared', () => {
        expect(span('abc', 'xyz')).toEqual([[0, 3], [0, 3]]);
    });
    it('a pure insertion inside a line has an empty span on the old side', () => {
        expect(span('ab', 'axb')).toEqual([[1, 1], [1, 2]]);
    });
    it('added and removed lines have no span', () => {
        const d = lineDiff('a', 'a\nb');
        expect(d.rows.find(r => r.kind === 'added')!.newSpan).toBeNull();
    });
});

describe('lineDiff: oracle over many shapes', () => {
    // a seeded generator so the matrix is the same on every run
    let seed = 20261104;
    const rnd = (n: number) => {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed % n;
    };
    const mutate = (a: string[]): string[] => {
        const b = [...a];
        const ops = 1 + rnd(4);
        for (let i = 0; i < ops; i++) {
            const at = b.length === 0 ? 0 : rnd(b.length + 1);
            const kind = rnd(3);
            if (kind === 0) b.splice(at, 0, `ins ${rnd(1000)}`);
            else if (kind === 1 && b.length > 0) b.splice(Math.min(at, b.length - 1), 1);
            else if (b.length > 0) b[Math.min(at, b.length - 1)] = `chg ${rnd(1000)}`;
        }
        return b;
    };
    it('rebuilds the old and the new text exactly, whatever the change, with all context kept', () => {
        for (let k = 0; k < 300; k++) {
            const a = lines(rnd(40), 'row');
            const b = mutate(a);
            const d = lineDiff(text(a), text(b), { context: Infinity });
            expect(oldOf(d), `case ${k}`).toEqual(a);
            expect(newOf(d), `case ${k}`).toEqual(b);
            expect(d.added - d.removed).toBe(b.length - a.length);
            expect(d.rows.some(r => r.kind === 'gap')).toBe(false);
        }
    });
    it('line numbers count up on each side and match the position of the line', () => {
        for (let k = 0; k < 100; k++) {
            const a = lines(5 + rnd(30), 'row');
            const b = mutate(a);
            const d = lineDiff(text(a), text(b), { context: Infinity });
            let o = 0;
            let n = 0;
            for (const r of d.rows) {
                if (r.kind !== 'added') expect(r.oldNo).toBe(++o);
                else expect(r.oldNo).toBeNull();
                if (r.kind !== 'removed') expect(r.newNo).toBe(++n);
                else expect(r.newNo).toBeNull();
            }
            expect([o, n]).toEqual([a.length, b.length]);
        }
    });
    it('with the default context the visible rows plus the skipped lines still account for every line', () => {
        for (let k = 0; k < 100; k++) {
            const a = lines(10 + rnd(60), 'row');
            const b = mutate(a);
            const d = lineDiff(text(a), text(b));
            const oldCount = d.rows.reduce((n, r) => n + (r.kind === 'gap' ? r.skipped : r.kind === 'added' ? 0 : 1), 0);
            const newCount = d.rows.reduce((n, r) => n + (r.kind === 'gap' ? r.skipped : r.kind === 'removed' ? 0 : 1), 0);
            expect([oldCount, newCount]).toEqual([a.length, b.length]);
        }
    });
});

describe('lineDiff: too large to compare', () => {
    it('says so and replaces the middle instead of failing', () => {
        const a = lines(60, 'a');
        const b = lines(60, 'b');
        const d = lineDiff(text(a), text(b), { maxCells: 100 });
        expect(d.tooLarge).toBe(true);
        expect([d.removed, d.added]).toEqual([60, 60]);
        expect(oldOf(d)).toEqual(a);
        expect(newOf(d)).toEqual(b);
    });
    it('a long common start and end are still recognised before the limit is applied', () => {
        const start = lines(500, 'same');
        const a = [...start, ...lines(60, 'a'), 'tail'];
        const b = [...start, ...lines(60, 'b'), 'tail'];
        const d = lineDiff(text(a), text(b), { maxCells: 100, context: Infinity });
        expect(d.tooLarge).toBe(true);
        expect(d.rows.filter(r => r.kind === 'context')).toHaveLength(501);
    });
});
