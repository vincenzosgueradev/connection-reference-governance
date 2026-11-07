// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { clientData, flow, ref } from './helpers/fixtures';
import { app, q, qa, REQUEST, settle } from './helpers/scenario';

// Feature 022, hand test: with many references the list was cut and had no scrollbar. Layout is not computed in jsdom, so this
// guards the two things that make it scroll: the stylesheet and the structure (figures and tabs outside the scrolling part).
const css = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');

describe('the clean up dialog scrolls', () => {
    it('the stylesheet lets the content scroll by itself inside the studio frame, with a bar that can be seen', () => {
        expect(css).toMatch(/\.cleanup-dialog \.cleanup-content \{[^}]*flex: 1 1 0;[^}]*min-height: 0;[^}]*overflow-y: auto/);
        expect(css).toMatch(/\.cleanup-dialog \.cleanup-content \{[^}]*scrollbar-color: var\(--color-text-muted\)/);
        // a block with overflow hidden (the list) must not shrink inside the content: it would clip its rows instead of scrolling
        expect(css).toMatch(/\.cleanup-dialog \.cleanup-content > \* \{ flex: none; \}/);
        expect(css).toMatch(/\.cleanup-list \{[^}]*overflow: hidden/); // the reason the rule above is needed
        expect(css).toMatch(/\.cleanup-dialog \.modal-body > \.fig-row, \.cleanup-dialog \.modal-body > \.segmented \{ flex: none; \}/);
    });
    it('with twelve unused references the rows are in the scrolling part, and the figures and tabs are not', async () => {
        const refs = Array.from({ length: 12 }, (_, i) => ref(i + 1, { connectionId: `c${i}` }));
        const a = await app({ references: refs, flows: [flow(100, ['sample_ref1'], { clientData: clientData(['sample_ref1'], {}, REQUEST) })] });
        a.store.dispatch({ type: 'setView', view: 'references' });
        qa(a.root, 'button').find(b => b.getAttribute('aria-label') === 'Clean up references')!.click();
        await settle();
        const body = q(a.root, '.cleanup-dialog .modal-body')!;
        const content = q(body, '.cleanup-content')!;
        expect(qa(content, '.cleanup-row')).toHaveLength(11); // ref1 is used by the flow
        expect(content.parentElement).toBe(body);
        expect(q(body, ':scope > .fig-row')).not.toBeNull();
        expect(q(body, ':scope > .segmented')).not.toBeNull();
        expect(content.contains(q(body, '.fig-row'))).toBe(false);
    });
});
