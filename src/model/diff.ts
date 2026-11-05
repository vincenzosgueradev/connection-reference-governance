/**
 * Line diff of two texts, ready to draw. Pure.
 *
 * The common start and end of the two texts are taken off first, a longest-common-subsequence table is built only for
 * what is left in the middle, and when that would be too big the middle is reported as replaced (with `tooLarge` set)
 * instead of failing. A run of removed and added lines is paired line by line so that a changed line can show which
 * words changed. Long unchanged stretches are collapsed into a band that says how many lines it hides.
 */

export type DiffKind = 'context' | 'changed' | 'removed' | 'added' | 'gap';

export interface DiffRow {
    readonly kind: DiffKind;
    /** Line number (from 1) in the old text; null where the line does not exist on the left. */
    readonly oldNo: number | null;
    /** Line number (from 1) in the new text; null where the line does not exist on the right. */
    readonly newNo: number | null;
    readonly oldText: string;
    readonly newText: string;
    /** The part of the line that differs, `[from, to)`, only for `changed`. */
    readonly oldSpan: [number, number] | null;
    readonly newSpan: [number, number] | null;
    /** How many unchanged lines a `gap` hides. */
    readonly skipped: number;
}

export interface FileDiff {
    readonly changed: boolean;
    readonly rows: readonly DiffRow[];
    /** Lines added and removed in the whole text (a changed line counts once on each side). */
    readonly added: number;
    readonly removed: number;
    /** The middle was too large to compare line by line and is shown as replaced. */
    readonly tooLarge: boolean;
}

export interface DiffOptions {
    /** Unchanged lines shown around each change (Infinity shows everything). Default `CONTEXT_LINES`. */
    context?: number;
    /** Largest size of the comparison table. Default `MAX_CELLS`. */
    maxCells?: number;
}

export const CONTEXT_LINES = 3;
export const MAX_CELLS = 4_000_000;

/** The lines of a text. CRLF and LF are the same and a final newline does not make an empty line. */
export function splitLines(text: string): string[] {
    if (text === '') return [];
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    if (lines[lines.length - 1] === '') lines.pop();
    return lines;
}

type Op = { t: 'eq' | 'del' | 'ins'; a: number; b: number };

function editScript(a: readonly string[], b: readonly string[], maxCells: number): { ops: Op[]; tooLarge: boolean } {
    let p = 0;
    while (p < a.length && p < b.length && a[p] === b[p]) p++;
    let s = 0;
    while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;

    const ops: Op[] = [];
    for (let i = 0; i < p; i++) ops.push({ t: 'eq', a: i, b: i });
    const n = a.length - p - s;
    const m = b.length - p - s;
    let tooLarge = false;
    if (n * m <= maxCells) {
        const w = m + 1;
        const dp = new Uint32Array((n + 1) * w);
        for (let i = n - 1; i >= 0; i--) {
            for (let j = m - 1; j >= 0; j--) {
                dp[i * w + j] = a[p + i] === b[p + j] ? dp[(i + 1) * w + j + 1]! + 1 : Math.max(dp[(i + 1) * w + j]!, dp[i * w + j + 1]!);
            }
        }
        let i = 0;
        let j = 0;
        while (i < n && j < m) {
            if (a[p + i] === b[p + j]) { ops.push({ t: 'eq', a: p + i, b: p + j }); i++; j++; }
            else if (dp[(i + 1) * w + j]! >= dp[i * w + j + 1]!) { ops.push({ t: 'del', a: p + i, b: -1 }); i++; }
            else { ops.push({ t: 'ins', a: -1, b: p + j }); j++; }
        }
        while (i < n) { ops.push({ t: 'del', a: p + i, b: -1 }); i++; }
        while (j < m) { ops.push({ t: 'ins', a: -1, b: p + j }); j++; }
    } else {
        tooLarge = true;
        for (let i = 0; i < n; i++) ops.push({ t: 'del', a: p + i, b: -1 });
        for (let j = 0; j < m; j++) ops.push({ t: 'ins', a: -1, b: p + j });
    }
    for (let k = 0; k < s; k++) ops.push({ t: 'eq', a: a.length - s + k, b: b.length - s + k });
    return { ops, tooLarge };
}

/** The part of two lines that differs: what is left after the common start and the common end. */
function spans(a: string, b: string): { old: [number, number]; neu: [number, number] } {
    let p = 0;
    while (p < a.length && p < b.length && a[p] === b[p]) p++;
    let s = 0;
    while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
    return { old: [p, a.length - s], neu: [p, b.length - s] };
}

const row = (r: Partial<DiffRow> & { kind: DiffKind }): DiffRow => ({ oldNo: null, newNo: null, oldText: '', newText: '', oldSpan: null, newSpan: null, skipped: 0, ...r });

function buildRows(a: readonly string[], b: readonly string[], ops: readonly Op[]): DiffRow[] {
    const rows: DiffRow[] = [];
    let dels: number[] = [];
    let inss: number[] = [];
    const flush = () => {
        const k = Math.min(dels.length, inss.length);
        for (let i = 0; i < k; i++) {
            const oldText = a[dels[i]!]!;
            const newText = b[inss[i]!]!;
            const sp = spans(oldText, newText);
            rows.push(row({ kind: 'changed', oldNo: dels[i]! + 1, newNo: inss[i]! + 1, oldText, newText, oldSpan: sp.old, newSpan: sp.neu }));
        }
        for (let i = k; i < dels.length; i++) rows.push(row({ kind: 'removed', oldNo: dels[i]! + 1, oldText: a[dels[i]!]! }));
        for (let i = k; i < inss.length; i++) rows.push(row({ kind: 'added', newNo: inss[i]! + 1, newText: b[inss[i]!]! }));
        dels = [];
        inss = [];
    };
    for (const op of ops) {
        if (op.t === 'del') dels.push(op.a);
        else if (op.t === 'ins') inss.push(op.b);
        else {
            flush();
            rows.push(row({ kind: 'context', oldNo: op.a + 1, newNo: op.b + 1, oldText: a[op.a]!, newText: b[op.b]! }));
        }
    }
    flush();
    return rows;
}

/** Keeps `context` lines around each change; a stretch that would hide fewer than two lines is shown in full. */
function collapse(rows: readonly DiffRow[], context: number): DiffRow[] {
    if (!Number.isFinite(context)) return [...rows];
    const out: DiffRow[] = [];
    let i = 0;
    while (i < rows.length) {
        if (rows[i]!.kind !== 'context') { out.push(rows[i]!); i++; continue; }
        let j = i;
        while (j < rows.length && rows[j]!.kind === 'context') j++;
        const run = rows.slice(i, j);
        const leading = i === 0;
        const trailing = j === rows.length;
        const keepHead = leading ? 0 : context;
        const keepTail = trailing ? 0 : context;
        const hidden = run.length - keepHead - keepTail;
        if (hidden < 2) out.push(...run);
        else out.push(...run.slice(0, keepHead), row({ kind: 'gap', skipped: hidden }), ...run.slice(run.length - keepTail));
        i = j;
    }
    return out;
}

export function lineDiff(oldText: string, newText: string, options: DiffOptions = {}): FileDiff {
    const a = splitLines(oldText);
    const b = splitLines(newText);
    const { ops, tooLarge } = editScript(a, b, options.maxCells ?? MAX_CELLS);
    const removed = ops.filter(o => o.t === 'del').length;
    const added = ops.filter(o => o.t === 'ins').length;
    if (added === 0 && removed === 0) return { changed: false, rows: [], added: 0, removed: 0, tooLarge: false };
    return { changed: true, rows: collapse(buildRows(a, b, ops), options.context ?? CONTEXT_LINES), added, removed, tooLarge };
}
