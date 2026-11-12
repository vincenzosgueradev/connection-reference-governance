import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The Connections area (constitution T11, feature 024): documents and code agree.
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('documents match the connections manager', () => {
    it('the constitution has T11 with the sources, the wording, the flag, the backup and the exclusions', () => {
        const c = read('.specify/memory/constitution.md');
        expect(c).toMatch(/### T11\. Connections of the environment/);
        expect(c).toMatch(/\*\*No dependency found\*\*/);
        expect(c).toMatch(/connectionDelete/);
        expect(c).toMatch(/Live check passed/);
        expect(c).toMatch(/never an email/);
        expect(c).toMatch(/\*\*Version\*\*: 1\.9\.\d/);
    });
    it('the specification set is complete', () => {
        for (const f of ['spec.md', 'plan.md', 'tasks.md', 'research.md', 'data-model.md', 'quickstart.md', 'contracts/host.md', 'contracts/state.md', 'checklists/requirements.md'])
            expect(read(`specs/024-connections-manager/${f}`).length, f).toBeGreaterThan(200);
    });
    it('only the host talks to the toolbox: no other file touches powerplatformAPI, dataverseAPI or toolboxAPI', () => {
        const walk = (dir: string): string[] =>
            readdirSync(new URL(`../${dir}`, import.meta.url), { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]));
        for (const f of walk('src').filter(x => x.endsWith('.ts') && x !== 'src/host.ts')) expect(read(f), f).not.toMatch(/powerplatformAPI|dataverseAPI|toolboxAPI/);
    });
    it('the word unused is not used for a connection nothing was found for', () => {
        for (const f of ['src/model/connectionDeps.ts', 'src/views/connectionsManager.ts']) {
            let text = '';
            try {
                text = read(f);
            } catch {
                continue; // the file may not exist yet in an early task
            }
            expect(text, f).not.toMatch(/['"`][^'"`\n]*\bunused connection\b/i);
        }
    });
});
