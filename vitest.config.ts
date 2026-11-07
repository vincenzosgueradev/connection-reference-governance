import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['test/**/*.test.ts'],
        environment: 'node',
        // the suite runs ~45 files in parallel and many mount the whole app in jsdom: under that load a test that takes 1s alone
        // can pass the default 5s. A real hang is still caught; a slow machine is not a failure.
        testTimeout: 30_000,
    },
});
