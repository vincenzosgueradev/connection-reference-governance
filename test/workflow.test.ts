import { describe, expect, it } from 'vitest';
import { canMove, crumbsFor, operationLabel, STEPS, stepIndex, stepTitle, type WizardStep } from '../src/model/workflow';

describe('the steps (feature 015: no separate Review)', () => {
    it('are Choose, Preview, Apply, Result, in this order', () => {
        expect(STEPS.map(s => s.key)).toEqual(['choose', 'preview', 'apply', 'result']);
        expect(STEPS.map(s => s.label)).toEqual(['Choose', 'Preview', 'Apply', 'Result']);
    });
    it('have an index that follows the order', () => {
        expect(['choose', 'preview', 'apply', 'result'].map(k => stepIndex(k as never))).toEqual([0, 1, 2, 3]);
    });
});

describe('which moves are allowed (matrix)', () => {
    // from -> to -> allowed. 'leave' discards the plan and goes back to the choices.
    const table: Record<WizardStep, Record<string, boolean>> = {
        preview: { preview: false, apply: false, result: false, leave: true },
        apply: { preview: false, apply: false, result: false, leave: false },
        result: { preview: false, apply: false, result: false, leave: true },
    };
    for (const from of Object.keys(table) as WizardStep[])
        for (const [to, allowed] of Object.entries(table[from]))
            it(`${from} -> ${to} is ${allowed ? 'allowed' : 'refused'}`, () => expect(canMove(from, to as never)).toBe(allowed));

    it('Apply is never reachable by a plain move: it only starts through the confirmation', () => {
        for (const from of ['preview', 'apply', 'result'] as const) expect(canMove(from, 'apply')).toBe(false);
    });
    it('once the write has started there is no way back', () => {
        for (const to of ['preview', 'leave'] as const) expect(canMove('apply', to)).toBe(false);
    });
});

describe('the breadcrumb of a step', () => {
    const view = (step: WizardStep) => crumbsFor(step).map(c => `${c.label}${c.link ? '>' : ''}`);
    it('starts at the Preview, which is not a link to itself', () => {
        expect(view('preview')).toEqual(['Preview']);
    });
    it('after the write has started nothing is a link', () => {
        expect(view('apply')).toEqual(['Preview', 'Apply']);
        expect(view('result')).toEqual(['Preview', 'Apply', 'Result']);
        expect(crumbsFor('result').every(c => !c.link)).toBe(true);
    });
});

describe('words', () => {
    it('names the operation and the title of each step', () => {
        expect(operationLabel('connection')).toBe('Change connection');
        expect(operationLabel('repoint')).toBe('Re-point flows');
        expect(stepTitle('preview')).toBe('Preview what will be stored');
        expect(stepTitle('apply')).toBe('Processing your changes');
        expect(stepTitle('result')).toBe('Result');
    });
});
