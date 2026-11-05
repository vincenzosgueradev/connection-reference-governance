/// <reference types="@pptb/types" />

declare global {
    /** Version of package.json, injected by the build (vite `define`). */
    const __APP_VERSION__: string;
}

export {};
