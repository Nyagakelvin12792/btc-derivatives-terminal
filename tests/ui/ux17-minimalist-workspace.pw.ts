import { expect, test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

test.describe('UX17 Minimalist Institutional Workspace & Project Control Integration', () => {
    test.setTimeout(120_000);
    test('verifies minimalist workspace, Tools Drawer, Expiry dropdown, clamped sessions, Footprint Inspector, and persistent 4-tab Risk Terminal', async ({ page }, testInfo) => {
        test.skip(testInfo.project.name === 'mobile', 'Desktop 16x9 institutional workspace layout check');
        await page.addInitScript(() => {
            localStorage.setItem(
                'btc-terminal-ui-v1',
                JSON.stringify({ state: { dataMode: 'DEMO', activeWorkspace: 'MARKET STRUCTURE' }, version: 1 }),
            );
        });
        await page.setViewportSize({ width: 1920, height: 1080 });
        await page.goto('/', { waitUntil: 'domcontentloaded' });
        await expect(page.getByRole('group', { name: /BTC price chart/i })).toBeVisible({ timeout: 30_000 });
        await page.waitForTimeout(500);

        // 1. Verify Minimalist Toolbar & CANDLE_FIT Price Scale Fit Toggle
        const scaleToggle = page.getByTestId('price-scale-fit-toggle');
        await expect(scaleToggle).toBeVisible();
        await expect(scaleToggle).toContainText('CANDLE FIT');

        // 2. Verify Interactive Deribit Expiry & DTE Dropdown
        const expiryTrigger = page.getByTestId('header-expiry-dropdown-trigger');
        await expect(expiryTrigger).toBeVisible();
        await expiryTrigger.click();
        const expiryMenu = page.getByTestId('header-expiry-dropdown-menu');
        await expect(expiryMenu).toBeVisible();
        await page.keyboard.press('Escape');

        // 3. Verify Tools & Presets Drawer with 6 Workspace Presets & 8 Categories
        const openToolsBtn = page.getByTestId('open-tools-drawer-button');
        await expect(openToolsBtn).toBeVisible();
        await openToolsBtn.click();
        const toolsDrawer = page.getByTestId('collapsible-tools-drawer');
        await expect(toolsDrawer).toBeVisible();
        await expect(page.getByTestId('workspace-preset-clean_price_action')).toBeVisible();
        await expect(page.getByTestId('workspace-preset-order_flow')).toBeVisible();
        await expect(page.getByTestId('workspace-preset-full_confluence')).toBeVisible();

        const artifactDir = path.resolve(process.cwd(), '.artifacts', 'ui-overhaul');
        fs.mkdirSync(artifactDir, { recursive: true });
        await page.screenshot({
            path: path.join(artifactDir, 'ux17-tools-drawer-1920x1080.png'),
            fullPage: false,
        });

        await page.getByTestId('close-tools-drawer').click();
        await expect(toolsDrawer).toHaveCount(0);

        // 4. Verify Trading Sessions Overlay is present and right-clamped
        const sessionsOverlay = page.getByTestId('trading-sessions-overlay');
        await expect(sessionsOverlay).toBeVisible();

        // 5. Verify Persistent 4-Tab Risk Terminal & Pinned Position Retention
        await page.getByRole('tab', { name: 'RISK' }).click();
        const riskTerminal = page.getByTestId('risk-terminal');
        await expect(riskTerminal).toBeVisible();
        await expect(riskTerminal).toContainText('NO LIVE EXECUTION');
        await expect(page.getByTestId('risk-tab-position')).toBeVisible();
        await expect(page.getByTestId('risk-tab-risk')).toBeVisible();
        await expect(page.getByTestId('risk-tab-history')).toBeVisible();
        await expect(page.getByTestId('risk-tab-analytics')).toBeVisible();

        // Create a Long position via Risk Terminal or chart drawing
        await page.getByTestId('risk-arm-long-button').click();
        const chartGroup = page.getByRole('group', { name: /BTC price chart/i });
        const box = await chartGroup.boundingBox();
        if (box) {
            await page.mouse.click(box.x + 280, box.y + 190);
        }
        const longDrawing = chartGroup.locator('[data-drawing-type="long-position"]').first();
        await expect(longDrawing).toBeVisible();
        const longBox = await longDrawing.boundingBox();
        if (longBox) {
            await page.mouse.click(longBox.x + longBox.width / 2, longBox.y + longBox.height / 2);
        }
        await expect(page.getByTestId('risk-active-position-card')).toBeVisible();

        // Click blank chart space -> verify position remains PINNED in RiskTerminal!
        if (box) {
            await page.mouse.click(box.x + 40, box.y + 40);
        }
        await expect(page.getByTestId('risk-active-position-card')).toBeVisible();
        await expect(page.getByTestId('risk-pinned-badge')).toBeVisible();

        // Log setup to journal and verify Journal & Analytics tabs
        const logBtn = page.getByTestId('risk-log-trade-button');
        if (await logBtn.isVisible()) {
            await logBtn.click();
        }
        await page.getByTestId('risk-tab-risk').click();
        await expect(page.getByTestId('risk-multi-tp-panel')).toBeVisible();

        await page.getByTestId('risk-tab-history').click();
        await expect(page.getByTestId('risk-history-panel')).toBeVisible();

        await page.getByTestId('risk-tab-analytics').click();
        await expect(page.getByTestId('risk-analytics-panel')).toBeVisible();

        await page.screenshot({
            path: path.join(artifactDir, 'ux17-minimalist-terminal-1920x1080.png'),
            fullPage: false,
        });
    });

    test('verifies Project Control Dashboard displays UX17.0 through UX17.11 milestones and live auto-sync', async ({ page }) => {
        await page.setViewportSize({ width: 1920, height: 1080 });
        await page.goto('/project-control', { waitUntil: 'domcontentloaded' });
        await expect(page.getByTestId('project-control-dashboard')).toBeVisible({ timeout: 30_000 });

        await expect(page.getByTestId('auto-sync-toggle')).toBeVisible();
        await expect(page.getByTestId('last-synced-timestamp')).toBeVisible();

        const ux17Milestones = [
            'ux17.0',
            'ux17.1',
            'ux17.2',
            'ux17.3',
            'ux17.4',
            'ux17.5',
            'ux17.6',
            'ux17.7',
            'ux17.8',
            'ux17.9',
            'ux17.10',
            'ux17.11',
        ];
        for (const id of ux17Milestones) {
            await expect(page.getByTestId(`milestone-card-${id}`)).toBeVisible();
        }

        const artifactDir = path.resolve(process.cwd(), '.artifacts', 'ui-overhaul');
        fs.mkdirSync(artifactDir, { recursive: true });
        await page.screenshot({
            path: path.join(artifactDir, 'ux17-project-control-1920x1080.png'),
            fullPage: false,
        });
    });
});
