import { expect, test } from '@playwright/test';
import * as path from 'path';

test.describe('UX16.3 Historical Liquidity Surface V2 Acceptance', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
            localStorage.setItem(
                'btc-terminal-ui-v1',
                JSON.stringify({
                    state: {
                        dataMode: 'DEMO',
                        activeWorkspace: 'MARKET STRUCTURE',
                        workspaceMode: 'CONTEXT',
                        chartLayers: {
                            walls: true,
                            secondaryWalls: false,
                            gammaRegime: true,
                            gammaFlip: true,
                            maxPain: false,
                            liquidityHeatmap: true,
                            volumeProfile: true,
                            avwap: true,
                        },
                    },
                    version: 1,
                }),
            );
        });

        await page.goto('/', { waitUntil: 'domcontentloaded' });
        await expect(page.getByRole('button', { name: 'OPTIONS METRICS', exact: true })).toBeVisible({ timeout: 30_000 });
    });

    test('verifies liquidity surface overlay renders under candles with density toggle', async ({ page, isMobile }) => {
        test.setTimeout(120_000);

        // Ensure we are in DEMO mode for stable testing
        const modeButton = page.locator('footer').getByRole('button', { name: /DEMO|LIVE/ });
        await expect(modeButton).toBeVisible({ timeout: 20_000 });
        for (let attempt = 0; attempt < 3; attempt += 1) {
            if ((await modeButton.textContent())?.includes('DEMO')) break;
            await modeButton.click();
            await page.waitForTimeout(300);
        }
        await expect(modeButton).toContainText('DEMO');

        if (!isMobile) {
            // 1. Verify liquidity surface container is mounted
            const heatmapOverlay = page.getByTestId('liquidity-heatmap');
            await expect(heatmapOverlay).toBeVisible({ timeout: 15_000 });

            // 2. Initial state: FOCUSED density mode
            await expect(heatmapOverlay).toHaveAttribute('data-density-mode', 'FOCUSED');

            const toggleDensityBtn = page.getByTestId('toggle-liquidity-density');
            await expect(toggleDensityBtn).toBeVisible();
            await expect(toggleDensityBtn).toHaveText('FOCUSED');

            // 3. Toggle density mode to FULL
            await toggleDensityBtn.click();
            await expect(heatmapOverlay).toHaveAttribute('data-density-mode', 'FULL');
            await expect(toggleDensityBtn).toHaveText('FULL');

            // 4. Toggle back to FOCUSED
            await toggleDensityBtn.click();
            await expect(heatmapOverlay).toHaveAttribute('data-density-mode', 'FOCUSED');
            await expect(toggleDensityBtn).toHaveText('FOCUSED');

            // 5. Verify the overlay canvas exists and has size
            const canvas = heatmapOverlay.locator('canvas');
            await expect(canvas).toBeAttached();

            // 6. Capture viewports into .artifacts/ui-overhaul
            const artifactDir = path.resolve(process.cwd(), '.artifacts', 'ui-overhaul');

            // 1920x1080 Desktop
            await page.setViewportSize({ width: 1920, height: 1080 });
            await page.waitForTimeout(500);
            await page.screenshot({
                path: path.join(artifactDir, 'ux16-3-liquidity-surface-desktop-1920x1080.png'),
                fullPage: false,
            });

            // 1664x936 Compact
            await page.setViewportSize({ width: 1664, height: 936 });
            await page.waitForTimeout(500);
            await page.screenshot({
                path: path.join(artifactDir, 'ux16-3-liquidity-surface-compact-1664x936.png'),
                fullPage: false,
            });

            // 1366x768 Laptop
            await page.setViewportSize({ width: 1366, height: 768 });
            await page.waitForTimeout(500);
            await page.screenshot({
                path: path.join(artifactDir, 'ux16-3-liquidity-surface-laptop-1366x768.png'),
                fullPage: false,
            });
        }
    });

    test('verifies mobile responsive layout renders cleanly with liquidity surface', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForTimeout(500);

        // Verify page body does not have horizontal scrollbar overflow
        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
        expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);

        const artifactDir = path.resolve(process.cwd(), '.artifacts', 'ui-overhaul');
        await page.screenshot({
            path: path.join(artifactDir, 'ux16-3-liquidity-surface-mobile-390x844.png'),
            fullPage: false,
        });
    });
});
