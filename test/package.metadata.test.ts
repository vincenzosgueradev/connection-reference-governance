import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Marketplace rules from PPTB-PUBLISHING-RULES.md sections 2-4. Add a case here whenever a review teaches something.
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const pkg = JSON.parse(read('package.json'));
const readme = read('README.md');

describe('package.json', () => {
    it('declares features.connections explicitly', () => {
        expect(pkg.features).toBeDefined();
        expect(pkg.features.connections).toBeDefined();
        expect(pkg.features.minAPI).toBeTruthy();
    });
    it('does not use the deprecated connection fields together with features', () => {
        expect(pkg.multiConnection).toBeUndefined();
        expect(pkg.connectionRequirement).toBeUndefined();
    });
    it('has the required fields', () => {
        for (const k of ['name', 'version', 'displayName', 'description', 'main', 'icon', 'license'])
            expect(pkg[k], k).toBeTruthy();
        expect(pkg.name).toMatch(/^@[^/]+\/[^/]+$/);
        expect(pkg.contributors?.[0]?.name).toBeTruthy();
        expect(pkg.configurations?.repository).toMatch(/^https:\/\//);
    });
    it('readmeUrl is on raw.githubusercontent.com', () => {
        expect(pkg.configurations.readmeUrl).toMatch(/^https:\/\/raw\.githubusercontent\.com\//);
    });
    it('does not use the unsupported iconURL', () => {
        expect(pkg.configurations.iconURL).toBeUndefined();
    });
    it('displayName has no emoji, version number or "Official"/"Verified"', () => {
        expect(pkg.displayName).not.toMatch(/official|verified|\bv?\d+\.\d+/i);
        expect(pkg.displayName).not.toMatch(/\p{Extended_Pictographic}/u);
    });
});

describe('icon', () => {
    const iconPath: string = pkg.icon;
    it('is relative to dist, never prefixed with dist/', () => {
        expect(iconPath.endsWith('.svg')).toBe(true);
        expect(iconPath.startsWith('dist/')).toBe(false);
    });
    it('exists in src/public so the build puts it in the dist root', () => {
        expect(existsSync(new URL(`../src/public/${iconPath}`, import.meta.url))).toBe(true);
    });
    it('is one colour: currentColor, no hex, no gradient, no filled background', () => {
        const svg = read(`src/public/${iconPath}`);
        expect(svg).toContain('currentColor');
        expect(svg).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
        expect(svg).not.toMatch(/gradient/i);
        for (const rect of svg.match(/<rect\b[^>]*>/g) ?? [])
            expect(rect, 'filled rect background').toMatch(/fill="none"/);
    });
    it('keeps a separate full-colour logo for the tool header', () => {
        expect(existsSync(new URL('../src/public/logo-color.svg', import.meta.url))).toBe(true);
    });
});

describe('README', () => {
    it('has no relative links or images', () => {
        const targets = [...readme.matchAll(/\]\(([^)\s]+)/g)].map(m => m[1]);
        for (const t of targets) expect(t.startsWith('https://') || t.startsWith('#'), t).toBe(true);
    });
    it('has no raw HTML outside comments', () => {
        const noComments = readme.replace(/<!--[\s\S]*?-->/g, '');
        expect(noComments).not.toMatch(/<\/?[a-zA-Z][^>]*>/);
    });
    it('has the sections the marketplace requires', () => {
        for (const h of ['What this tool changes', 'Privacy and network use', 'Support and bugs', 'AI Assistance'])
            expect(readme).toContain(`## ${h}`);
    });
});
