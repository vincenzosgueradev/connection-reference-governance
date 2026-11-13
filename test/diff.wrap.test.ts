import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/ui/ui.css', import.meta.url), 'utf8');

describe('long text is never cut', () => {
    it('diff lines wrap instead of being clipped by the half-width column', () => {
        const rule = css.split('\n').find((l) => l.startsWith('.diff-code {'))!;
        expect(rule).toContain('white-space: pre-wrap');
        expect(rule).toContain('overflow-wrap: anywhere');
    });
});
