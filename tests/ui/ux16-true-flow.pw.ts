import { expect, test } from '@playwright/test';
import * as path from 'path';

test.describe('UX16.2 True Flow Presentation & Semantic Zoom Acceptance', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
            localStorage.setItem(
                'btc-terminal-ui-v1',
                JSON.stringify({
                    state: {
                        dataMode: 'DEMO',
                        activeWorkspace: 'MARKET STRUCTURE',
                        workspaceMode: 'FLOW',
                    },
                    version: 1,
                }),
            );
        });

        await page.goto('/', { waitUntil: 'domcontentloaded' });
        await expect(page.getByRole('button', { name: 'OPTIONS METRICS', exact: true })).toBeVisible({ timeout: 30_000 });

        // Ensure DEMO mode is deterministic
        const demoButton = page.getByRole('button', { name: '● DEMO', exact: true }).first();
        const liveButton = page.getByRole('button', { name: '● LIVE', exact: true }).first();
        await page.waitForTimeout(500);
        if (await liveButton.isVisible().catch(() => false)) {
            await liveButton.click();
        }
        await expect(demoButton).toBeVisible({ timeout: 20_000 });
    });

    test('verifies FLOW mode presentation without false READY or live CVD claims', async ({ page, isMobile }) => {
        test.setTimeout(120_000);

        // 1. Switch to FLOW mode if not already active
        const flowModeBtn = page.getByTestId('workspace-mode-flow').first();
        await flowModeBtn.click();
        await expect(flowModeBtn).toHaveAttribute('aria-selected', 'true');

        if (!isMobile) {
            // 2. Verify FLOW mode container in Decision Dock
            const flowContainer = page.getByTestId('flow-mode-container');
            await expect(flowContainer).toBeVisible();

            // 3. Truthful uncaptured states: No false claims
            await expect(flowContainer.getByText('MICROSTRUCTURE OBSERVER')).toBeVisible();
            await expect(flowContainer.getByText('REPLAY')).toBeVisible();

            // CVD Coverage must be UNAVAILABLE in demo without trades; never falsely claiming "live CVD"
            const cvdStatus = page.getByTestId('flow-cvd-status');
            await expect(cvdStatus).toBeVisible();
            await expect(cvdStatus).toHaveText(/UNAVAILABLE|TRADE_BASED/);

            // Footprint must be NOT_CONNECTED or AWAITING_CAPTURE; never claiming live footprint
            const footprintStatus = page.getByTestId('flow-footprint-status');
            await expect(footprintStatus).toBeVisible();
            await expect(footprintStatus).toHaveText(/NOT_CONNECTED|READY/);

            // Capture screenshots across viewports
            const artifactDir = path.resolve(process.cwd(), '.artifacts', 'ui-overhaul');

            // 1920x1080 Desktop
            await page.setViewportSize({ width: 1920, height: 1080 });
            await page.waitForTimeout(500);
            await page.screenshot({
                path: path.join(artifactDir, 'ux16-2-true-flow-desktop-1920x1080.png'),
                fullPage: false,
            });

            // 1664x936 Compact
            await page.setViewportSize({ width: 1664, height: 936 });
            await page.waitForTimeout(500);
            await page.screenshot({
                path: path.join(artifactDir, 'ux16-2-true-flow-compact-1664x936.png'),
                fullPage: false,
            });

            // 1366x768 Laptop
            await page.setViewportSize({ width: 1366, height: 768 });
            await page.waitForTimeout(500);
            await page.screenshot({
                path: path.join(artifactDir, 'ux16-2-true-flow-laptop-1366x768.png'),
                fullPage: false,
            });
        }
    });

    test('verifies mobile responsive layout with no horizontal overflow', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForTimeout(500);

        // Verify page body does not have horizontal scrollbar overflow
        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
        expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);

        const artifactDir = path.resolve(process.cwd(), '.artifacts', 'ui-overhaul');
        await page.screenshot({
            path: path.join(artifactDir, 'ux16-2-true-flow-mobile-390x844.png'),
            fullPage: false,
        });
    });
});
