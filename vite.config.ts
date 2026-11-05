import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

// The version shown in the header is the one in package.json, never typed by hand.
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

export default defineConfig((configEnv) => ({
    base: "./",
    define: { __APP_VERSION__: JSON.stringify(pkg.version) },
    root: "./src",
    build: {
        outDir: "../dist",
        emptyOutDir: true,
        assetsDir: "assets",
        cssCodeSplit: false,
        sourcemap: configEnv.mode === "development",
        rollupOptions: {
            output: {
                // Fixed names, no hash: the host loads the tool from `dist/`.
                entryFileNames: "assets/index.js",
                chunkFileNames: "assets/[name].js",
                assetFileNames: "assets/[name][extname]",
                // IIFE: ES modules can fail when loaded through file:// URLs in an iframe.
                format: "iife",
                manualChunks: undefined,
            },
        },
    },
}));
