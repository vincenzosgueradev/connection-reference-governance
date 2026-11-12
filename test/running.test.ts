import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { emptyForm } from '../src/model/newReference';
import { initialState, type State } from '../src/state/reducer';
import { actionRunning } from '../src/state/running';

// The global rule (constitution T8, 1.8.1): while an action runs every button is disabled, decided in one place.
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const base = (): State => initialState();

describe('actionRunning', () => {
    it('is false at rest', () => expect(actionRunning(base())).toBe(false));
    it('is true while the solution or a list is being read, or a write is being checked', () => expect(actionRunning({ ...base(), busy: true })).toBe(true));
    it('is true while the dependencies of any reference are being read, and false once they are known', () => {
        expect(actionRunning({ ...base(), dependencies: { a: { status: 'ready', report: { items: [], notes: [] } }, b: { status: 'loading' } } })).toBe(true);
        expect(actionRunning({ ...base(), dependencies: { a: { status: 'ready', report: { items: [], notes: [] } }, b: { status: 'failed', error: 'x' } } })).toBe(false);
    });
    it('is true while a reference is created or the connections are read for the panel', () => {
        expect(actionRunning({ ...base(), newReference: { ...emptyForm('c'), saving: true } })).toBe(true);
        expect(actionRunning({ ...base(), newReference: { ...emptyForm('c'), live: { status: 'loading', items: [], error: '' } } })).toBe(true);
        expect(actionRunning({ ...base(), newReference: { ...emptyForm('c'), live: { status: 'ready', items: [], error: '' } } })).toBe(false);
    });
});

describe('the rule is applied in one place', () => {
    it('views/main.ts applies it after each draw and no other view disables buttons for it', () => {
        expect(read('src/views/main.ts')).toMatch(/actionRunning\(store\.get\(\)\)/);
        // the one exception is the Cancel of Check all (feature 024), marked in its own view and nowhere else
        expect(read('src/views/main.ts')).toMatch(/querySelectorAll<HTMLButtonElement>\('button'\)\.forEach\(b => \{ if \(b\.dataset\['allowRunning'\] !== 'true'\) b\.disabled = true; \}\)/);
        expect(read('src/views/connectionsManager.ts').match(/dataset\['allowRunning'\] = 'true'/g)).toHaveLength(1);
        for (const f of ['cleanup', 'newReference', 'dependencies', 'connectionDeletion', 'removal', 'confirm']) expect(read(`src/views/${f}.ts`), f).not.toMatch(/allowRunning/);
        for (const f of ['cleanup', 'newReference', 'dependencies']) expect(read(`src/views/${f}.ts`), f).not.toMatch(/actionRunning|loading > 0 \? .*disabled|\.disabled = .*loading/);
    });
    it('the constitution states it, and the focus is protected by other means (given only when a dialog opens, without scrolling)', () => {
        expect(read('.specify/memory/constitution.md')).toMatch(/While an action runs, every button is disabled/);
        expect(read('src/views/main.ts')).toMatch(/\.focus\(\{ preventScroll: true \}\)/);
    });
});
