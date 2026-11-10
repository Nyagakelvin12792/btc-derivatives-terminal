import { defineConfig } from '@playwright/test';

const localUrl = 'http://127.0.0.1:3014';
const previewUrl = process.env.PLAYWRIGHT_BASE_URL;
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;

export default defineConfig({
    testDir: './tests/ui',
    testMatch: 'ux21-footprint.pw.ts',
    timeout: 90_000,
    workers: 1,
    reporter: 'list',
    webServer: previewUrl ? undefined : {
        command: 'node node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1 --port 3014',
        url: localUrl,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
    },
    use: {
        baseURL: previewUrl ?? localUrl,
        browserName: 'chromium',
        launchOptions: executablePath ? { executablePath } : undefined,
        colorScheme: 'dark',
        reducedMotion: 'reduce',
        trace: 'retain-on-failure',
    },
    projects: [
        { name: 'desktop', use: { viewport: { width: 1920, height: 1080 } } },
        { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    ],
});
