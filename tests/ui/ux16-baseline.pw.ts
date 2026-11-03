import { expect, test } from '@playwright/test';

test.describe('UX16 Baseline Screenshot Capture', () => {
    test.skip(({ isMobile }) => isMobile, 'Reference screenshot matrix is desktop-only.');

    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
            localStorage.setItem(
                'btc-terminal-ui-v1',
                JSON.stringify({ state: { dataMode: 'DEMO', activeWorkspace: 'MARKET STRUCTURE' }, version: 1 }),
            );
        });
        await page.goto('/', { waitUntil: 'domcontentloaded' });
        await expect(page.getByRole('button', { name: 'OPTIONS METRICS', exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: '● DEMO', exact: true })).toBeVisible({ timeout: 20_000 });
        await expect(page.getByLabel('Demo BTC price chart with options structure overlays')).toBeVisible({ timeout: 20_000 });
    });

    test('captures terminal baseline at reference viewports', async ({ page }) => {
        const viewports = [
            { width: 1366, height: 768, filename: '.artifacts/ui-overhaul/ux16-baseline-1366x768.png' },
            { width: 1664, height: 936, filename: '.artifacts/ui-overhaul/ux16-baseline-1664x936.png' },
            { width: 1920, height: 1080, filename: '.artifacts/ui-overhaul/ux16-baseline-1920x1080.png' },
        ];

        for (const vp of viewports) {
            await page.setViewportSize({ width: vp.width, height: vp.height });
            // Wait for chart and UI layout to settle
            await page.waitForTimeout(1_000);
            await page.screenshot({
                path: vp.filename,
                animations: 'disabled',
            });
        }
    });
});
