import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The README and the constitution must say what the tool really does: a reference can be created (feature 021).
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('documents match the feature', () => {
    it('the README does not claim that nothing is created', () => {
        expect(read('README.md')).not.toMatch(/never creates anything/i);
        expect(read('README.md')).toMatch(/New reference/);
    });
    it('the constitution allows the creation and states its rules', () => {
        const c = read('.specify/memory/constitution.md');
        expect(c).not.toMatch(/does not create or export anything/);
        expect(c).toMatch(/### T2c\. Creating a connection reference/);
        expect(c).toMatch(/solutioncomponentdefinitions/);
    });
    it('the host creates without any custom header', () => {
        const host = read('src/host.ts');
        expect(host).toMatch(/AddSolutionComponent/);
        expect(host).not.toMatch(/MSCRM\.SolutionUniqueName/);
    });
});

describe('the guided path is described as it is (feature 015)', () => {
    it('neither the README nor the constitution lists a Review step between Choose and Preview', () => {
        expect(read('README.md')).not.toMatch(/Choose, Review/);
        expect(read('.specify/memory/constitution.md')).not.toMatch(/Choose, Review, Preview/);
    });
});

describe('the Power Platform API is declared and kept read only (feature 021, connections)', () => {
    const pkg = JSON.parse(read('package.json'));
    it('package.json declares features.enabledForPowerPlatformAPI because the tool calls powerplatformAPI', () => {
        expect(read('src/host.ts')).toMatch(/powerplatformAPI/);
        expect(pkg.features.enabledForPowerPlatformAPI).toBe(true);
    });
    it('the only call to the Power Platform API is a GET of the connections list with the documented api-version', () => {
        const host = read('src/host.ts');
        const calls = [...host.matchAll(/powerplatformAPI\.(\w+)\.(\w+)\(/g)].map(m => `${m[1]}.${m[2]}`);
        expect(calls).toEqual(['Connectivity.Get']);
        expect(host).toMatch(/environments\/\$\{environmentId\}\/connections\?api-version=2024-10-01/);
    });
    it('the constitution and the README say the tool reads the connections', () => {
        expect(read('.specify/memory/constitution.md')).toMatch(/powerplatformAPI\.Connectivity/);
        expect(read('README.md')).toMatch(/Power Platform API/);
    });
});

describe('a wait is visible (constitution T8, feature 021)', () => {
    it('the constitution states it and the panel reuses the kit spinner and keeps a reduced-motion rule', () => {
        expect(read('.specify/memory/constitution.md')).toMatch(/Every wait is visible and honest/);
        const css = read('src/styles.css');
        expect(css).toMatch(/\.newref-progress-fill \{ animation: none/);
        expect(read('src/views/newReference.ts')).toMatch(/el\('span', onPrimary \? 'spinner newref-spinner--on-primary' : 'spinner'\)/);
    });
});

describe('the panel fields take the full width (feature 021)', () => {
    it('the kit caps .text-input at a max-width and .newref-input lifts it, after the kit in the cascade', () => {
        expect(read('src/ui/ui.css')).toMatch(/\.text-input \{[^}]*max-width: 380px/);
        const css = read('src/styles.css');
        expect(css).toMatch(/\.newref-input \{[^}]*width: 100%;[^}]*max-width: none/);
        expect(css.indexOf('.newref-input {')).toBeGreaterThan(css.indexOf("@import"));
        expect(read('src/views/newReference.ts')).toMatch(/el\('input', 'text-input newref-input'\)/);
    });
});
