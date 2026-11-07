import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Dependencies are read in the whole environment, read only, from Dataverse dependency tracking (constitution T2e, feature 023).
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('documents and code match the dependencies feature', () => {
    it('the constitution states the sources, the marking of what is outside and that it only informs', () => {
        const c = read('.specify/memory/constitution.md');
        expect(c).toMatch(/### T2e\. Dependencies are seen in the whole environment/);
        expect(c).toMatch(/RetrieveDependentComponents/);
        expect(c).toMatch(/Outside this solution/);
        expect(c).toMatch(/It informs; it never decides/);
    });
    it('the README says it, and the specification is complete', () => {
        expect(read('README.md')).toMatch(/Dependencies in the whole environment/);
        expect(read('README.md')).toMatch(/Dataverse dependency tracking/);
        for (const f of ['spec.md', 'plan.md', 'tasks.md', 'checklists/requirements.md']) expect(read(`specs/023-dependencies/${f}`).length).toBeGreaterThan(200);
    });
    it('the host reads the dependents with a plain GET of RetrieveDependentComponents, with no header', () => {
        const host = read('src/host.ts');
        expect(host).toMatch(/RetrieveDependentComponents\(ObjectId=\$\{id\},ComponentType=\$\{componentType\}\)/);
        expect(host).not.toMatch(/additionalHeaders|headers\s*:/i);
    });
    it('reading dependencies never writes: no write call in the service, the model or the view', () => {
        for (const f of ['src/services/dependencies.ts', 'src/model/dependencies.ts', 'src/views/dependencies.ts'])
            expect(read(f), f).not.toMatch(/host\.(update|remove|create|addToSolution|removeFromSolution)\(|dataverseAPI\.(update|delete|create)/);
    });
});
