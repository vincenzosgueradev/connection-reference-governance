# Plan: Listing review answer

`src/theme.ts` (pure, takes the API) -> `host.ts` `themeApi()` (only door) -> `app.ts` starts it first. CSS is unchanged: `ui.css` already defines `:root[data-theme]` and the `prefers-color-scheme` fallback. README and CHANGELOG carry the text; the release follows section 8 of the shared publishing rules.
