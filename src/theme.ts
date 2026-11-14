/**
 * The tool follows the PPTB theme, not the operating system one (marketplace policy, "react to light and dark themes").
 * `data-theme` on <html> drives the tokens in `ui/ui.css`. Read once on load (`utils.getCurrentTheme`) and again whenever
 * PPTB reports `settings:updated`. Outside PPTB, or if the host cannot answer, the CSS falls back to `prefers-color-scheme`.
 */

export type Theme = 'light' | 'dark';

/** The part of the PPTB API this file uses; tests pass a fake. */
export interface ThemeApi {
    utils?: { getCurrentTheme?: () => Promise<unknown> };
    events?: { on?: (callback: (event: unknown, payload: { event?: string; data?: unknown }) => void) => void };
}

const asTheme = (value: unknown): Theme | undefined => (value === 'light' || value === 'dark' ? value : undefined);

/** The theme named by a `settings:updated` payload, when it carries one. */
export function themeFromSettings(data: unknown): Theme | undefined {
    return typeof data === 'object' && data !== null ? asTheme((data as { theme?: unknown }).theme) : undefined;
}

export async function initTheme(api: ThemeApi | undefined, root: HTMLElement = document.documentElement): Promise<void> {
    const apply = (theme: Theme): void => root.setAttribute('data-theme', theme);
    // Subscribe first, so a change that arrives while the first read is pending is not lost.
    try {
        api?.events?.on?.((_event, payload) => {
            if (payload?.event !== 'settings:updated') return;
            const theme = themeFromSettings(payload.data);
            if (theme) apply(theme);
            else void read(api, apply);
        });
    } catch { /* no events: the theme read on load stays */ }
    await read(api, apply);
}

async function read(api: ThemeApi | undefined, apply: (theme: Theme) => void): Promise<void> {
    try {
        const theme = asTheme(await api?.utils?.getCurrentTheme?.());
        if (theme) apply(theme);
    } catch { /* keep what is applied; the CSS falls back to the system theme */ }
}
