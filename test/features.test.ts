import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { features } from '../src/features';

// The deletion of connections ships off until a live check is recorded (constitution T11, feature 024).
const research = readFileSync(new URL('../specs/024-connections-manager/research.md', import.meta.url), 'utf8');

describe('the connectionDelete flag', () => {
    it('is a boolean', () => expect(typeof features.connectionDelete).toBe('boolean'));
    it('is on only when research.md records a passed live check with a date', () => {
        if (features.connectionDelete) expect(research).toMatch(/^Live check passed: \d{4}-\d{2}-\d{2}/m);
        else expect(features.connectionDelete).toBe(false);
    });
    it('research.md has the place for the record, so the flag cannot be turned on by forgetting it', () => {
        expect(research).toMatch(/\*\*Live check record\*\*/);
    });
});
