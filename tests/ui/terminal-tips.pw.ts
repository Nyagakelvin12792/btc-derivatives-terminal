import { expect, test } from '@playwright/test';

test('Tips reaches terminal features from a closed or preview workspace', async ({ page }) => {
    await page.goto('/');
    const tips = page.getByRole('button', { name: 'Tips', exact: true });
    await expect(tips).toBeVisible();
    const guide = page.getByRole('dialog', { name: 'Terminal Tips' });
    const dock = page.getByTestId('decision-dock');

    await tips.click();
    await guide.getByRole('button', { name: /Historical Preview/ }).click();
    await expect(page.getByRole('button', { name: 'Historical Preview', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(dock).toHaveCount(0);

    for (const [label, target] of [
        ['Strike × Expiry Matrix', 'options-strike-expiry-matrix'],
        ['US Market Context', 'us-market-context-drawer'],
        ['Footprint & Order Flow', 'flow-mode-container'],
        ['Strategy Lab', 'strategy-lab-panel'],
        ['Manual Paper Desk', 'paper-desk'],
        ['Portfolio Analytics', 'risk-analytics-panel'],
    ] as const) {
        await tips.click();
        await guide.getByRole('button', { name: new RegExp(label) }).click();
        await expect(guide).toHaveCount(0);
        await expect(dock.getByTestId(target)).toBeVisible();
        if (await page.getByRole('button', { name: 'Close Decision Dock' }).isVisible()) {
            await page.getByRole('button', { name: 'Close Decision Dock' }).click();
        }
    }

    await tips.click();
    await guide.getByRole('button', { name: /Data & Provenance/ }).click();
    await expect(dock.getByRole('tab', { name: 'DATA' })).toHaveAttribute('aria-selected', 'true');
});
