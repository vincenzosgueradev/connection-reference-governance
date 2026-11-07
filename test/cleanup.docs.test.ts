import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Clean up (feature 022) writes through the existing operations only, and a merge is two confirmations (constitution T2, T2d).
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('documents match the clean up feature', () => {
    it('the constitution defines unused and duplicates and keeps a merge as two operations', () => {
        const c = read('.specify/memory/constitution.md');
        expect(c).toMatch(/### T2d\. Clean up/);
        expect(c).toMatch(/two operations with two confirmations/);
        expect(c).toMatch(/A single confirmation never covers both/);
    });
    it('the README says it, and the specification is complete', () => {
        expect(read('README.md')).toMatch(/Clean up\.\.\./);
        expect(read('README.md')).toMatch(/Two operations, two confirmations/);
        for (const f of ['spec.md', 'plan.md', 'tasks.md', 'checklists/requirements.md']) expect(read(`specs/022-cleanup/${f}`).length).toBeGreaterThan(200);
    });
    it('the clean up code never writes by itself: no host write is called from the model or the view', () => {
        expect(read('src/model/cleanup.ts')).not.toMatch(/host\.|dataverseAPI/);
        expect(read('src/views/cleanup.ts')).not.toMatch(/host\.|dataverseAPI|\.update\(|\.remove\(|\.create\(/);
    });
});
