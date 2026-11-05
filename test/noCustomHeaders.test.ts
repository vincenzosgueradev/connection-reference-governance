import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// PPTB asks the user for consent whenever a tool sends custom request headers to Dataverse. The tool must never need it.
const host = readFileSync(new URL('../src/host.ts', import.meta.url), 'utf8');

describe('no custom request headers', () => {
    it('host.ts passes no additional headers to the Dataverse API', () => {
        expect(host).not.toMatch(/additionalHeaders|headers\s*:/i);
        expect(host).not.toMatch(/\bPrefer\b/);
        expect(host).not.toMatch(/odata\.include-annotations/i);
    });
    it('queryData is called with the query only', () => {
        const calls = [...host.matchAll(/queryData\(([^)]*)\)/g)].map(m => m[1]);
        expect(calls.length).toBeGreaterThan(0);
        for (const args of calls) expect(args!.split(',').length).toBe(1);
    });
});
