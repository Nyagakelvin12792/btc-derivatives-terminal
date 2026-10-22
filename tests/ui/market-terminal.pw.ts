import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.setItem('btc-terminal-ui-v1', JSON.stringify({ state: { dataMode: 'DEMO', activeWorkspace: 'MARKET STRUCTURE' }, version: 1 }));
    });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: 'OPTIONS METRICS', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '● DEMO', exact: true })).toBeVisible({ timeout: 20_000 });
});

test('renders the chart-first terminal and keyboard command palette', async ({ page }, testInfo) => {
    await expect(page.getByLabel('Demo BTC price chart with options structure overlays')).toBeVisible();
    await expect(page.getByText('CALL WALL', { exact: false }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /FIXED RANGE VP/ })).toContainText('FIXED RANGE VP');
    await expect(page.getByLabel('Demo cumulative volume delta candles')).toBeVisible();
    await expect(page.getByRole('tab', { name: 'CVD', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('canvas').first()).toBeVisible();

    await page.getByRole('button', { name: /Open command palette/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByPlaceholder('Search workspaces and actions…')).toBeFocused();
    await page.keyboard.press('Escape');

    if (testInfo.project.name !== 'mobile') {
        await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true })));
        await expect(page.getByRole('dialog')).toBeVisible();
        await page.keyboard.press('Escape');
    }

    if (testInfo.project.name === 'mobile') {
        await page.getByRole('button', { name: 'OPTIONS METRICS', exact: true }).click();
        const sheet = page.getByRole('dialog');
        await expect(sheet.getByText('GAMMA FLIP')).toBeVisible();
        await sheet.getByRole('button', { name: 'Close options metrics' }).click();
    }

    await page.screenshot({
        path: `.artifacts/ui-overhaul/market-structure-${testInfo.project.name}.png`,
        fullPage: true,
    });
});

test('has no serious or critical automated accessibility violations', async ({ page }) => {
    const results = await new AxeBuilder({ page }).disableRules(['color-contrast']).analyze();
    const severe = results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact || ''));
    expect(severe).toEqual([]);
});

test('exposes the approved market-structure controls and honest states', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'Desktop terminal control-density check');

    await expect(page.getByText('POSITIVE GAMMA · MEAN-REVERSION')).toBeVisible();
    await expect(page.getByText('NEGATIVE GAMMA · EXPANSION')).toBeVisible();
    await expect(page.getByText('POC', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('Coverage 96%')).toBeVisible();
    await expect(page.getByRole('toolbar', { name: 'VP controls' })).toBeVisible();

    await page.getByRole('button', { name: 'Replay' }).click();
    await expect(page.getByText('REPLAY PAUSED · HISTORICAL DEMO')).toBeVisible();

    await page.getByRole('tab', { name: 'DECISION' }).click();
    await expect(page.getByText('JEV SHADOW OPINION')).toBeVisible();
    await expect(page.getByText('UNAVAILABLE', { exact: true })).toBeVisible();
    await expect(page.getByText('NO LIVE EXECUTION', { exact: true }).first()).toBeVisible();
});

test('preserves the panned chart viewport while editing a full-range volume profile', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'Desktop pointer-interaction regression');

    const chart = page.getByRole('group', { name: 'Demo BTC price chart with options structure overlays' });
    const profile = page.getByTestId('fixed-range-volume-profile');
    await expect(chart).toHaveAttribute('data-chart-generation', '1');
    await expect(profile).toHaveAttribute('data-selected-bars', '120');
    await expect.poll(() => chart.getAttribute('data-visible-from')).not.toBeNull();
    const initialFrom = await chart.getAttribute('data-visible-from');
    const box = await chart.boundingBox();
    expect(box).not.toBeNull();

    await page.mouse.move(box!.x + 180, box!.y + 220);
    await page.mouse.down();
    await page.mouse.move(box!.x + 360, box!.y + 220, { steps: 8 });
    await page.mouse.up();
    await expect.poll(() => chart.getAttribute('data-visible-from')).not.toBe(initialFrom);
    const pannedFrom = await chart.getAttribute('data-visible-from');

    await page.getByRole('button', { name: 'VP settings', exact: true }).click();
    await page.getByRole('button', { name: 'Use all loaded' }).click();
    await expect(profile).toHaveAttribute('data-selected-bars', '192');
    await page.getByLabel('Number of rows').selectOption('72');
    await page.keyboard.press('Escape');

    await expect(chart).toHaveAttribute('data-chart-generation', '1');
    await expect(chart).toHaveAttribute('data-visible-from', pannedFrom!);
});
