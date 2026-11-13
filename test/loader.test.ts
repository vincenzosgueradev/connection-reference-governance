// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { APPEAR_AFTER_MS, PERIOD_MS, loaderIdle, logoLoader } from '../src/views/loader';

const logo = readFileSync(resolve(process.cwd(), 'src/public/logo.svg'), 'utf8');
const prop = (e: HTMLElement, name: string): string => e.style.getPropertyValue(name);

describe('logo loader (feature 025)', () => {
    beforeEach(() => loaderIdle());

    it('is a polite status region with the caption, and the drawing is hidden from assistive technology', () => {
        const l = logoLoader('Reading the solution...', 0, false);
        expect(l.getAttribute('role')).toBe('status');
        expect(l.getAttribute('aria-live')).toBe('polite');
        expect(l.getAttribute('aria-busy')).toBe('true');
        expect(l.textContent).toBe('Reading the solution...');
        expect(l.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
    });

    it('draws the same marks as the marketplace icon, so a new icon cannot leave the loader behind', () => {
        const l = logoLoader('x', 0, false);
        const circles = [...l.querySelectorAll('circle')].map(c => [c.getAttribute('cx'), c.getAttribute('cy'), c.getAttribute('r')].join(','));
        const iconCircles = [...logo.matchAll(/<circle cx="([^"]+)" cy="([^"]+)" r="([^"]+)"/g)].map(m => `${m[1]},${m[2]},${m[3]}`);
        expect(circles).toEqual(iconCircles);
        const paths = [...l.querySelectorAll('path')].map(p => p.getAttribute('d'));
        const iconPaths = [...logo.matchAll(/<path d="([^"]+)"/g)].map(m => m[1]);
        expect(paths).toEqual(iconPaths);
    });

    it('has no emoji, no image and no fixed colour', () => {
        const l = logoLoader('Reading the connections... 12 read so far', 0, false);
        expect(l.outerHTML).not.toMatch(/\p{Extended_Pictographic}/u);
        expect(l.querySelector('img')).toBeNull();
        expect(l.outerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(/);
    });

    it('does not show for a wait too short to notice: the first call fades in after the short moment', () => {
        const l = logoLoader('x', 1000, false);
        expect(l.classList.contains('logo-loader--new')).toBe(true);
        expect(prop(l, '--loader-appear')).toBe(`${APPEAR_AFTER_MS}ms`);
    });

    it('is already shown, with no fade, once the wait lasted longer than the short moment (a redraw never flickers)', () => {
        logoLoader('x', 1000, false);
        const again = logoLoader('x', 1000 + APPEAR_AFTER_MS + 50, false);
        expect(again.classList.contains('logo-loader--new')).toBe(false);
        expect(prop(again, '--loader-appear')).toBe('');
    });

    it('counts the remaining delay when redrawn inside the short moment', () => {
        logoLoader('x', 1000, false);
        const again = logoLoader('x', 1060, false);
        expect(prop(again, '--loader-appear')).toBe(`${APPEAR_AFTER_MS - 60}ms`);
    });

    it('starts the next wait afresh after loaderIdle', () => {
        logoLoader('x', 0, false);
        logoLoader('x', 5000, false);
        loaderIdle();
        expect(logoLoader('x', 9000, false).classList.contains('logo-loader--new')).toBe(true);
    });

    it('continues the same cycle in a new element: the phase is the clock modulo the period', () => {
        const a = logoLoader('x', 12345, false);
        const b = logoLoader('x', 12345 + PERIOD_MS * 3, false);
        expect(prop(a, '--loader-phase')).toBe(`${-(12345 % PERIOD_MS)}ms`);
        expect(prop(b, '--loader-phase')).toBe(prop(a, '--loader-phase'));
    });

    it('with reduced motion the period is longer (slow, never removed)', () => {
        const normal = logoLoader('x', 0, false);
        const slow = logoLoader('x', 0, true);
        expect(prop(normal, '--loader-period')).toBe(`${PERIOD_MS}ms`);
        expect(parseInt(prop(slow, '--loader-period'))).toBeGreaterThan(PERIOD_MS);
        expect(slow.classList.contains('logo-loader')).toBe(true);
    });
});
