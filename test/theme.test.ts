// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { initTheme, themeFromSettings, type ThemeApi } from '../src/theme';

// The tool follows the PPTB theme, not only the OS one (marketplace review).
type Handler = (event: unknown, payload: { event?: string; data?: unknown }) => void;
function fakeApi(theme: unknown) {
    const handlers: Handler[] = [];
    const api: ThemeApi = { utils: { getCurrentTheme: async () => theme }, events: { on: h => { handlers.push(h); } } };
    return { api, emit: (event: string, data?: unknown) => handlers.forEach(h => h({}, { event, data })) };
}
const flush = () => new Promise(r => setTimeout(r, 0));

describe('PPTB theme', () => {
    it('applies the theme PPTB reports on load, light or dark', async () => {
        for (const theme of ['light', 'dark'] as const) {
            const root = document.createElement('html');
            await initTheme(fakeApi(theme).api, root);
            expect(root.getAttribute('data-theme')).toBe(theme);
        }
    });
    it('follows settings:updated, with the theme in the payload or read again from the host', async () => {
        const root = document.createElement('html');
        const { api, emit } = fakeApi('dark');
        await initTheme(api, root);
        emit('settings:updated', { theme: 'light' });
        expect(root.getAttribute('data-theme')).toBe('light');
        api.utils!.getCurrentTheme = async () => 'dark';
        emit('settings:updated', { somethingElse: 1 });
        await flush();
        expect(root.getAttribute('data-theme')).toBe('dark');
    });
    it('ignores other events and values that are not a theme', async () => {
        const root = document.createElement('html');
        const { api, emit } = fakeApi('dark');
        await initTheme(api, root);
        emit('connection:updated', { theme: 'light' });
        expect(root.getAttribute('data-theme')).toBe('dark');
        expect(themeFromSettings({ theme: 'blue' })).toBeUndefined();
        expect(themeFromSettings(null)).toBeUndefined();
    });
    it('leaves the attribute off (CSS falls back to the system theme) outside PPTB or when the host fails', async () => {
        const root = document.createElement('html');
        await initTheme(undefined, root);
        await initTheme({ utils: { getCurrentTheme: async () => { throw new Error('no'); } } }, root);
        expect(root.hasAttribute('data-theme')).toBe(false);
    });
    it('the entry point starts it with the host API', () => {
        const app = readFileSync('src/app.ts', 'utf8');
        expect(app).toContain('initTheme(themeApi())');
    });
});

describe('README names the overlapping listed tool (marketplace review)', () => {
    it('has a paragraph that names it and says what this tool adds', () => {
        const readme = readFileSync('README.md', 'utf8');
        expect(readme).toMatch(/## Overlap with EnvVar & ConnRef Matrix/);
        for (const topic of ['flow-to-reference view', 'Re-point any flow', 'Create a connection reference', 'Remove references from a solution', 'whole environment', 'Connections.{0,4} area']) expect(readme).toMatch(new RegExp(topic));
    });
});
