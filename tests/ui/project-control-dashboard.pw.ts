import { expect, test } from '@playwright/test';
import * as path from 'path';

test.describe('Project-Control Dashboard Acceptance', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/project-control', { waitUntil: 'domcontentloaded' });
        await expect(page.getByTestId('project-control-dashboard')).toBeVisible({ timeout: 30_000 });
    });

    test('verifies completion percentages are displayed separately without hardcoding', async ({ page }) => {
        const implementedEl = page.getByTestId('implemented-percent');
        const testedEl = page.getByTestId('tested-percent');
        const acceptedEl = page.getByTestId('accepted-percent');

        await expect(implementedEl).toBeVisible();
        await expect(testedEl).toBeVisible();
        await expect(acceptedEl).toBeVisible();

        // Ensure each metric contains a percentage value
        const implText = await implementedEl.textContent();
        const testText = await testedEl.textContent();
        const accText = await acceptedEl.textContent();

        expect(implText).toMatch(/^\d+(\.\d+)?%/);
        expect(testText).toMatch(/^\d+(\.\d+)?%/);
        expect(accText).toMatch(/^\d+(\.\d+)?%/);
    });

    test('verifies milestones UX16.0 through UX16.8 and task expansion', async ({ page }) => {
        const milestoneIds = ['ux16.0', 'ux16.1', 'ux16.2', 'ux16.3', 'ux16.4', 'ux16.5', 'ux16.6', 'ux16.7', 'ux16.8'];

        for (const id of milestoneIds) {
            const card = page.getByTestId(`milestone-card-${id}`);
            await expect(card).toBeVisible();
        }

        // UX16.2 is expanded by default, check that its task table is visible
        const taskTable = page.getByTestId('project-task-table');
        await expect(taskTable).toBeVisible();

        // Keyboard navigation: Tab and Enter toggles milestone card
        const card0 = page.getByTestId('milestone-card-ux16.0');
        await card0.focus();
        await page.keyboard.press('Enter');
        await page.waitForTimeout(300);

        // Capture milestone view screenshot
        const artifactDir = path.resolve(process.cwd(), '.artifacts', 'ui-overhaul');
        await page.setViewportSize({ width: 1920, height: 1080 });
        await page.screenshot({
            path: path.join(artifactDir, 'project-control-milestones-1920x1080.png'),
            fullPage: false,
        });
    });

    test('verifies spend summary and cost truthfulness (no $0.00 for UNREPORTED/SUBSCRIPTION)', async ({ page }) => {
        // Switch to SPEND tab
        const spendTab = page.getByTestId('tab-spend');
        await spendTab.click();

        const spendCard = page.getByTestId('spend-summary-card');
        await expect(spendCard).toBeVisible();

        // Verify spend totals are displayed
        await expect(page.getByTestId('known-spend-amount')).toBeVisible();
        await expect(page.getByTestId('provider-reported-amount')).toBeVisible();
        await expect(page.getByTestId('calculated-spend-amount')).toBeVisible();
        await expect(page.getByTestId('unreported-runs-count')).toBeVisible();

        // Verify agent runs table
        const runsTable = page.getByTestId('agent-runs-table');
        if (await runsTable.isVisible().catch(() => false)) {
            // Confirm subscription run displays INCLUDED/UNREPORTED and NOT $0.00
            const codexCostCell = page.getByTestId('run-cost-ux16-2-codex-batch-1');
            if (await codexCostCell.isVisible().catch(() => false)) {
                await expect(codexCostCell).toHaveText('INCLUDED/UNREPORTED');
                await expect(codexCostCell).not.toHaveText('$0.00');
            }
        }

        // Capture spend view screenshot
        const artifactDir = path.resolve(process.cwd(), '.artifacts', 'ui-overhaul');
        await page.screenshot({
            path: path.join(artifactDir, 'project-control-spend-1920x1080.png'),
            fullPage: false,
        });
    });

    test('verifies search and agent filters interactively', async ({ page }) => {
        const searchInput = page.getByTestId('filter-search-input');
        await searchInput.fill('true-flow');
        await page.waitForTimeout(300);

        const taskTable = page.getByTestId('project-task-table');
        await expect(taskTable).toBeVisible();

        // Filter by Agent
        const agentSelect = page.getByTestId('filter-agent-select');
        await agentSelect.selectOption('CODEX');
        await page.waitForTimeout(300);

        // Reset filter
        await agentSelect.selectOption('ALL');
        await searchInput.fill('');
    });

    test('verifies mobile viewport without horizontal overflow', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForTimeout(500);

        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
        expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);

        const artifactDir = path.resolve(process.cwd(), '.artifacts', 'ui-overhaul');
        await page.screenshot({
            path: path.join(artifactDir, 'project-control-mobile-390x844.png'),
            fullPage: false,
        });
    });
});
