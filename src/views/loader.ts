import { el } from '../ui/components';

/**
 * The wait of the whole pane (feature 025, constitution T8): the tool's logo, large and animated, with a caption of what
 * is being read. CSS draws the movement; nothing here uses a timer.
 *
 * The view is rebuilt on every change and a CSS animation restarts with a new element, so the movement is tied to the
 * clock, not to the element: each loader starts at `-(now mod period)`, exactly where the previous one was.
 */
export const APPEAR_AFTER_MS = 200; // a wait shorter than this never shows the loader
export const PERIOD_MS = 1800; // one cycle of the movement
const SLOW_FACTOR = 2; // reduced motion: slower, never removed

const SVG_NS = 'http://www.w3.org/2000/svg';

/** The same marks as `src/public/logo.svg` (a test compares them), so the icon and the loader are one drawing. */
const NODES: readonly (readonly [number, number, number])[] = [[4.5, 6, 2.5], [4.5, 18, 2.5], [19.5, 12, 2.5]];
const LINKS: readonly string[] = ['M7 6.5C12 6.5 13.5 8.5 17.2 10.6', 'M7 17.5C12 17.5 13.5 15.5 17.2 13.4'];

function svg(name: string, attrs: Record<string, string>): SVGElement {
    const e = document.createElementNS(SVG_NS, name);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
}

function mark(): SVGElement {
    const root = svg('svg', { viewBox: '0 0 24 24', class: 'logo-loader-svg', 'aria-hidden': 'true', focusable: 'false' });
    for (const d of LINKS) root.append(svg('path', { d, class: 'logo-loader-flow' }));
    NODES.forEach(([cx, cy, r], i) => {
        const c = svg('circle', { cx: String(cx), cy: String(cy), r: String(r), class: 'logo-loader-node' });
        c.setAttribute('style', `--n:${i}`);
        root.append(c);
    });
    return root;
}

function prefersReducedMotion(): boolean {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** When the wait that is being shown began; null when the last draw had no loader. */
let since: number | null = null;

/** Called after a draw that shows no loader: the next wait is a new wait. */
export function loaderIdle(): void {
    since = null;
}

export function logoLoader(caption: string, now: number = performance.now(), reduced: boolean = prefersReducedMotion()): HTMLElement {
    const period = reduced ? PERIOD_MS * SLOW_FACTOR : PERIOD_MS;
    since ??= now;
    const waited = now - since;
    const root = el('div', 'logo-loader');
    root.setAttribute('role', 'status');
    root.setAttribute('aria-live', 'polite');
    root.setAttribute('aria-busy', 'true');
    root.style.setProperty('--loader-period', `${period}ms`);
    root.style.setProperty('--loader-phase', `${-(now % period)}ms`);
    if (waited < APPEAR_AFTER_MS) {
        root.classList.add('logo-loader--new'); // fades in once the short moment has passed; a shorter wait never shows it
        root.style.setProperty('--loader-appear', `${APPEAR_AFTER_MS - waited}ms`);
    }
    const stage = el('div', 'logo-loader-mark');
    stage.append(el('span', 'logo-loader-halo'), mark());
    stage.firstElementChild!.setAttribute('aria-hidden', 'true');
    root.append(stage, el('p', 'logo-loader-text', caption));
    return root;
}
