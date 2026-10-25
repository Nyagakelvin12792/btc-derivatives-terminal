import { expect, test } from '@playwright/test';

test.describe('UX16.0 Calm Analytical Instrument Shell & Modes', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
            localStorage.setItem(
                'btc-terminal-ui-v1',
                JSON.stringify({
                    state: {
                        dataMode: 'DEMO',
                        activeWorkspace: 'MARKET STRUCTURE',
                        workspaceMode: 'CONTEXT',
                    },
                    version: 1,
                }),
            );
        });
        await page.goto('/', { waitUntil: 'domcontentloaded' });
        await expect(page.getByRole('button', { name: 'OPTIONS METRICS', exact: true })).toBeVisible({ timeout: 20_000 });
        await expect(page.getByRole('button', { name: '● DEMO', exact: true })).toBeVisible({ timeout: 20_000 });
        await expect(page.getByLabel('Demo BTC price chart with options structure overlays')).toBeVisible({ timeout: 20_000 });
    });

    test('verifies workspace modes, attention budget, and captures reference viewports', async ({ page }, testInfo) => {
        if (testInfo.project.name !== 'desktop-16x9') {
            return;
        }

        // 1. Verify Header Workspace Mode Switcher defaults to CONTEXT
        const contextBtn = page.getByTestId('workspace-mode-context').first();
        const flowBtn = page.getByTestId('workspace-mode-flow').first();
        const setupBtn = page.getByTestId('workspace-mode-setup').first();

        await expect(contextBtn).toBeVisible();
        await expect(flowBtn).toBeVisible();
        await expect(setupBtn).toBeVisible();
        await expect(contextBtn).toHaveAttribute('aria-selected', 'true');

        // 2. Verify Context Mode Container in Decision Dock
        const contextContainer = page.getByTestId('context-mode-container');
        await expect(contextContainer).toBeVisible();
        await expect(contextContainer.getByText('DECISION CONTEXT · 4H / 1H')).toBeVisible();
        await expect(contextContainer.getByText('Call Wall (Upper)')).toBeVisible();
        await expect(contextContainer.getByText('Put Wall (Lower)')).toBeVisible();
        await expect(contextContainer.getByText('Gamma Flip')).toBeVisible();
        await expect(contextContainer.getByText('Gamma Regime')).toBeVisible();
        await expect(contextContainer.getByText('ATTENTION BUDGET: 3 OVERLAYS ACTIVE')).toBeVisible();

        // 3. Verify Data Integrity Strip
        const integrityStrip = page.getByTestId('data-integrity-strip');
        await expect(integrityStrip).toBeVisible();
        await expect(page.getByTestId('data-integrity-candles')).toBeVisible();
        await expect(page.getByTestId('data-integrity-options')).toBeVisible();
        await expect(page.getByTestId('data-integrity-depth')).toBeVisible();
        await expect(page.getByTestId('data-integrity-tape')).toBeVisible();
        const jevBadge = page.getByTestId('data-integrity-intelligence');
        await expect(jevBadge).toBeVisible();
        await expect(jevBadge).toHaveAttribute('data-status', 'shadow');

        // Click a badge to test provenance popover
        await page.getByTestId('data-integrity-options').click();
        await expect(page.getByText('Deribit public options chain')).toBeVisible();
        await page.keyboard.press('Escape');

        // 4. Capture Context Mode visual regression screenshots across reference viewports
        const referenceViewports = [
            { width: 1366, height: 768, filename: '.artifacts/ui-overhaul/ux16-calm-workspace-1366x768.png' },
            { width: 1664, height: 936, filename: '.artifacts/ui-overhaul/ux16-calm-workspace-1664x936.png' },
            { width: 1920, height: 1080, filename: '.artifacts/ui-overhaul/ux16-calm-workspace-1920x1080.png' },
        ];

        for (const vp of referenceViewports) {
            await page.setViewportSize({ width: vp.width, height: vp.height });
            await page.waitForTimeout(600);
            await page.screenshot({
                path: vp.filename,
                animations: 'disabled',
            });
        }

        // Return to 1920x1080 for Flow and Setup captures
        await page.setViewportSize({ width: 1920, height: 1080 });

        // 5. Switch to FLOW mode and verify containers
        await flowBtn.click();
        await expect(flowBtn).toHaveAttribute('aria-selected', 'true');
        const flowContainer = page.getByTestId('flow-mode-container');
        await expect(flowContainer).toBeVisible();
        await expect(page.getByTestId('flow-liquidity-surface-container')).toBeVisible();
        await expect(page.getByTestId('flow-footprint-container')).toBeVisible();
        await expect(page.getByTestId('flow-cvd-container')).toBeVisible();
        await expect(page.getByTestId('flow-events-container')).toBeVisible();

        await page.screenshot({
            path: '.artifacts/ui-overhaul/ux16-flow-mode-1920x1080.png',
            animations: 'disabled',
        });

        // 6. Switch to SETUP mode and verify containers
        await setupBtn.click();
        await expect(setupBtn).toHaveAttribute('aria-selected', 'true');
        const setupContainer = page.getByTestId('setup-mode-container');
        await expect(setupContainer).toBeVisible();
        await expect(page.getByTestId('setup-state-container')).toBeVisible();
        await expect(page.getByTestId('setup-zone-container')).toBeVisible();
        await expect(page.getByTestId('setup-trigger-container')).toBeVisible();
        await expect(page.getByTestId('setup-invalidation-container')).toBeVisible();
        await expect(page.getByTestId('setup-grade-container')).toBeVisible();
        await expect(page.getByTestId('setup-evidence-container')).toBeVisible();
        await expect(page.getByTestId('setup-conflicts-container')).toBeVisible();
        const jevContainer = page.getByTestId('setup-jev-shadow-container');
        await expect(jevContainer).toBeVisible();
        await expect(jevContainer.getByText('SHADOW DISABLED')).toBeVisible();

        await page.screenshot({
            path: '.artifacts/ui-overhaul/ux16-setup-mode-1920x1080.png',
            animations: 'disabled',
        });
    });
});
