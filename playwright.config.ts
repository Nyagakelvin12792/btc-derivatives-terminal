import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './tests/ui',
    testMatch: '**/*.pw.ts',
    timeout: 45_000,
    fullyParallel: false,
    workers: 1,
    reporter: 'list',
    webServer: {
        command: 'npm.cmd run dev -- --hostname 127.0.0.1 --port 3010',
        url: 'http://127.0.0.1:3010',
        reuseExistingServer: true,
        timeout: 180_000,
    },
    use: {
        baseURL: 'http://127.0.0.1:3010',
        channel: 'msedge',
        colorScheme: 'dark',
        reducedMotion: 'reduce',
        trace: 'retain-on-failure',
    },
    projects: [
        { name: 'desktop-16x9', use: { viewport: { width: 1920, height: 1080 } } },
        { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true } },
    ],
});
