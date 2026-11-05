import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { connectorInfo, connectorKey, GENERIC_GLYPH, glyphsUsed, GLYPH_TONE, toneOf } from '../src/model/connectors';

describe('connector key', () => {
    // matrix: path shape x case x prefix
    for (const [id, key] of [
        ['/providers/Microsoft.PowerApps/apis/shared_office365', 'office365'],
        ['/providers/Microsoft.PowerApps/apis/SHARED_Office365', 'office365'],
        ['shared_office365', 'office365'],
        ['office365', 'office365'],
        ['/providers/Microsoft.PowerApps/apis/shared_sharepointonline/', 'sharepointonline'],
        ['', ''],
        ['/', ''],
    ] as const)
        it(`${JSON.stringify(id)} -> ${JSON.stringify(key)}`, () => expect(connectorKey(id)).toBe(key));
});

describe('connector info', () => {
    // Names from the Microsoft Learn connector reference (research.md).
    const expected: Record<string, string> = {
        shared_commondataserviceforapps: 'Microsoft Dataverse',
        shared_commondataservice: 'Microsoft Dataverse (legacy)',
        shared_office365: 'Office 365 Outlook',
        shared_office365users: 'Office 365 Users',
        shared_sharepointonline: 'SharePoint',
        shared_teams: 'Microsoft Teams',
        shared_onedriveforbusiness: 'OneDrive for Business',
        shared_excelonlinebusiness: 'Excel Online (Business)',
        shared_wordonlinebusiness: 'Word Online (Business)',
        shared_approvals: 'Standard approvals',
        shared_visualstudioteamservices: 'Azure DevOps',
        shared_azuread: 'Microsoft Entra ID',
    };
    for (const [key, name] of Object.entries(expected))
        it(`${key} is ${name}`, () => {
            const info = connectorInfo(`/providers/Microsoft.PowerApps/apis/${key}`);
            expect(info).toMatchObject({ name, known: true });
            expect(info.glyph).not.toBe(GENERIC_GLYPH);
        });

    it('an unknown connector gets a readable name and the generic glyph', () => {
        expect(connectorInfo('/providers/Microsoft.PowerApps/apis/shared_my_special_api')).toMatchObject({ name: 'My Special Api', glyph: GENERIC_GLYPH, known: false });
    });
    it('a custom connector id keeps the part before the first dash', () => {
        expect(connectorInfo('shared_contoso-5fapi-5f1234abcd').name).toBe('Contoso');
    });
    it('an empty id is named, not blank', () => {
        expect(connectorInfo('')).toMatchObject({ name: 'Unknown connector', glyph: GENERIC_GLYPH });
    });
    for (const bad of ['constructor', '__proto__', 'toString', 'hasOwnProperty'])
        it(`object property name ${bad} is not mistaken for a known connector`, () => {
            const info = connectorInfo(`shared_${bad}`);
            expect(info.known).toBe(false);
            expect(info.glyph).toBe(GENERIC_GLYPH);
            expect(typeof info.name).toBe('string');
        });
});

describe('glyphs', () => {
    const css = readFileSync(new URL('../src/ui/ui.css', import.meta.url), 'utf8');
    for (const g of glyphsUsed())
        it(`the kit defines icon-${g}`, () => expect(css).toMatch(new RegExp(`\\.icon-${g}\\s*\\{`)));
    it('glyphs are drawn in the kit style: a mask, no colour of their own', () => {
        for (const g of glyphsUsed()) {
            const rule = new RegExp(`\\.icon-${g}\\s*\\{[^}]*\\}`).exec(css)![0];
            expect(rule).toContain('mask-image');
            expect(rule).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb/);
        }
    });
});

describe('tones', () => {
    const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
    it('every glyph the catalog can return has a tone, and no tone is left over', () => {
        for (const g of glyphsUsed()) expect(Object.keys(GLYPH_TONE), g).toContain(g);
        for (const g of Object.keys(GLYPH_TONE)) expect(glyphsUsed(), g).toContain(g);
    });
    it('the stylesheet colours every tone from a token and none from a hex value', () => {
        for (const tone of new Set(Object.values(GLYPH_TONE))) expect(styles).toMatch(new RegExp(`\\.conn-tile--${tone} \\{[^}]*var\\(--color-`));
        expect(styles).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    });
    it('connector info carries the tone of its glyph; an unknown glyph is muted', () => {
        expect(connectorInfo('shared_commondataserviceforapps').tone).toBe('primary');
        expect(connectorInfo('shared_office365').tone).toBe('info');
        expect(connectorInfo('shared_my_custom').tone).toBe('muted');
        expect(toneOf('nope')).toBe('muted');
    });
});
