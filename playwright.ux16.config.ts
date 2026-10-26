import { defineConfig } from '@playwright/test';
import baseConfig from './playwright.config';

const baseUse = typeof baseConfig.use === 'object' ? baseConfig.use : {};

export default defineConfig({
    ...baseConfig,
    testMatch: '**/ux16-*.pw.ts',
    webServer: {
        command: 'node scripts/serve-ux16-playwright.mjs',
        url: 'http://127.0.0.1:3011',
        reuseExistingServer: false,
        timeout: 300_000,
        env: {
            NEXT_PUBLIC_UX16_CALM_WORKSPACE: 'true',
        },
    },
    use: {
        ...baseUse,
        baseURL: 'http://127.0.0.1:3011',
    },
});
