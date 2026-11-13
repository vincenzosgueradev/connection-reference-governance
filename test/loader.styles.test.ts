import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
// every line that belongs to the loader, plus its keyframes
const block = css.split('\n').filter(l => /logo-loader/.test(l)).join('\n');

describe('logo loader styles (feature 025)', () => {
    it('defines the layout and the four movements: flow, pulse, halo and appear', () => {
        expect(block).toContain('.logo-loader {');
        for (const k of ['@keyframes logo-loader-flow', '@keyframes logo-loader-pulse', '@keyframes logo-loader-halo', '@keyframes logo-loader-in'])
            expect(block, k).toContain(k);
    });
    it('uses theme tokens only: no hex and no rgb colour', () => {
        expect(block).toContain('var(--color-');
        expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(/);
    });
    it('never switches the animation off or pauses it (reduced motion is slower, not static)', () => {
        expect(block).not.toMatch(/animation:\s*none/);
        expect(block).not.toMatch(/animation-play-state:\s*paused/);
    });
    it('is driven by the period and phase variables so the pieces stay in step and a redraw continues the cycle', () => {
        expect(block).toContain('var(--loader-period)');
        expect(block).toContain('var(--loader-phase)');
    });
    it('fits a narrow pane: the mark scales with the width', () => {
        expect(block).toMatch(/min\(\s*\d+px,\s*\d+vw\s*\)/);
    });
});

describe('area tabs while the tool is reading', () => {
    const tabs = css.split('\n').filter(l => /\.area-tab/.test(l)).join('\n');
    it('a disabled tab is dimmed and shows the progress cursor, and does not react to hover', () => {
        expect(tabs).toMatch(/\.area-tab:disabled\s*\{[^}]*opacity/);
        expect(tabs).toMatch(/\.area-tab:disabled\s*\{[^}]*cursor:\s*progress/);
        expect(tabs).toMatch(/\.area-tab:hover:not\(:disabled\)/);
    });
});
