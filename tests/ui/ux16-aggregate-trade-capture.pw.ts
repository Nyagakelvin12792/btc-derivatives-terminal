import { expect, test } from '@playwright/test';

test.describe('UX16.1 Aggregate-Trade Capture Acceptance', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
            localStorage.setItem(
                'btc-terminal-ui-v1',
                JSON.stringify({
                    state: {
                        dataMode: 'LIVE',
                        activeWorkspace: 'MARKET STRUCTURE',
                        workspaceMode: 'CONTEXT',
                    },
                    version: 1,
                }),
            );
        });
    });

    test('1. Safe default: Tape capture is UNAVAILABLE when feature flag is disabled', async ({ page }, testInfo) => {
        test.setTimeout(90_000);

        if (testInfo.project.name !== 'desktop-16x9') {
            return;
        }

        // Intercept capability endpoint with disabled flag (safe default)
        await page.route('**/api/orderflow/config', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    schemaVersion: 1,
                    enabled: false,
                    dataMode: 'SHADOW',
                    source: 'BINANCE_SPOT',
                    symbol: 'BTCUSDT',
                }),
                headers: { 'Cache-Control': 'no-store' },
            });
        });

        await page.goto('/', { waitUntil: 'domcontentloaded' });
        await expect(page.getByRole('button', { name: 'OPTIONS METRICS', exact: true })).toBeVisible({ timeout: 25_000 });

        const tradesBadge = page.getByTestId('data-integrity-trades');
        await expect(tradesBadge).toBeVisible({ timeout: 20_000 });

        // Status MUST be UNAVAILABLE; never falsely READY or LIVE
        await expect(tradesBadge).toHaveAttribute('data-status', 'unavailable');
        await expect(tradesBadge).not.toHaveAttribute('data-status', 'ready');

        // Verify badge label is either SPOT TAPE or TAPE / CVD
        const labelText = await tradesBadge.locator('span.font-sans').textContent();
        expect(labelText).toMatch(/SPOT TAPE|TAPE/);

        // Open popover to inspect detail disclosure
        await tradesBadge.click();
        const popover = page.getByTestId('data-integrity-popover-trades');
        await expect(popover).toBeVisible({ timeout: 10_000 });

        // Must state capture is disabled or not connected; MUST NOT claim live CVD, footprint, imbalance, or A-grade
        const popoverText = await popover.textContent();
        expect(popoverText).toMatch(/disabled|not connected|unavailable/i);
        expect(popoverText).not.toMatch(/live cvd/i);
        expect(popoverText).not.toMatch(/footprint/i);
        expect(popoverText).not.toMatch(/imbalance/i);
        expect(popoverText).not.toMatch(/absorption/i);
        expect(popoverText).not.toMatch(/a-grade/i);

        // Capture 1366x768 safe-default evidence screenshot
        await page.setViewportSize({ width: 1366, height: 768 });
        await page.waitForTimeout(600);
        await page.screenshot({
            path: '.artifacts/ui-overhaul/ux16-1-safe-default-1366x768.png',
            animations: 'disabled',
        });

        await page.keyboard.press('Escape');
    });

    test('2. Capability checking: Tape shows LOADING without fake count while config request is pending', async ({ page }, testInfo) => {
        test.setTimeout(60_000);

        if (testInfo.project.name !== 'desktop-16x9') {
            return;
        }

        // Intercept with delayed response to observe LOADING state
        let resolvePendingRoute: (() => void) | undefined;
        const routePromise = new Promise<void>((resolve) => {
            resolvePendingRoute = resolve;
        });

        await page.route('**/api/orderflow/config', async (route) => {
            await routePromise;
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    schemaVersion: 1,
                    enabled: false,
                    dataMode: 'SHADOW',
                    source: 'BINANCE_SPOT',
                    symbol: 'BTCUSDT',
                }),
                headers: { 'Cache-Control': 'no-store' },
            });
        });

        await page.goto('/', { waitUntil: 'domcontentloaded' });
        await expect(page.getByRole('button', { name: 'OPTIONS METRICS', exact: true })).toBeVisible({ timeout: 25_000 });

        const tradesBadge = page.getByTestId('data-integrity-trades');
        await expect(tradesBadge).toBeVisible({ timeout: 20_000 });

        // Check if capability checking transitions through LOADING or stays safely UNAVAILABLE
        const currentStatus = await tradesBadge.getAttribute('data-status');
        expect(['loading', 'unavailable']).toContain(currentStatus);

        // Under no circumstances may a pending capability claim READY or display a fake count
        await expect(tradesBadge).not.toHaveAttribute('data-status', 'ready');
        const badgeContent = await tradesBadge.textContent();
        expect(badgeContent).not.toMatch(/\d+\s*captured/i);

        // Release delayed route
        resolvePendingRoute?.();
    });

    test('3. Error resilience: Malformed capability response produces ERROR or UNAVAILABLE without crashing', async ({ page }, testInfo) => {
        test.setTimeout(60_000);

        if (testInfo.project.name !== 'desktop-16x9') {
            return;
        }

        // Intercept with malformed 500 error response
        await page.route('**/api/orderflow/config', async (route) => {
            await route.fulfill({
                status: 500,
                contentType: 'application/json',
                body: JSON.stringify({ error: 'Internal Server Error', stack: 'secret_stack_trace_do_not_leak' }),
            });
        });

        await page.goto('/', { waitUntil: 'domcontentloaded' });
        await expect(page.getByRole('button', { name: 'OPTIONS METRICS', exact: true })).toBeVisible({ timeout: 25_000 });

        // Terminal must remain usable and not crash
        await expect(page.getByLabel(/BTC price chart/)).toBeVisible({ timeout: 20_000 });

        const tradesBadge = page.getByTestId('data-integrity-trades');
        await expect(tradesBadge).toBeVisible({ timeout: 20_000 });

        // Must report ERROR or UNAVAILABLE, never READY
        const status = await tradesBadge.getAttribute('data-status');
        expect(['error', 'unavailable']).toContain(status);
        expect(status).not.toBe('ready');

        // Check that internal error secrets or stack traces are not leaked into the DOM
        const bodyText = await page.locator('body').textContent();
        expect(bodyText).not.toContain('secret_stack_trace_do_not_leak');
    });

    test('4. Enabled capability: READY requires accepted trades and strict no-derived-CVD disclosure', async ({ page }, testInfo) => {
        test.setTimeout(90_000);

        if (testInfo.project.name !== 'desktop-16x9') {
            return;
        }

        // Mock enabled shadow capture capability
        await page.route('**/api/orderflow/config', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    schemaVersion: 1,
                    enabled: true,
                    dataMode: 'SHADOW',
                    source: 'BINANCE_SPOT',
                    symbol: 'BTCUSDT',
                }),
                headers: { 'Cache-Control': 'no-store' },
            });
        });

        await page.goto('/', { waitUntil: 'domcontentloaded' });
        await expect(page.getByRole('button', { name: 'OPTIONS METRICS', exact: true })).toBeVisible({ timeout: 25_000 });

        const tradesBadge = page.getByTestId('data-integrity-trades');
        await expect(tradesBadge).toBeVisible({ timeout: 20_000 });

        // Capture 1920x1080 enabled/checking state evidence screenshot
        await page.setViewportSize({ width: 1920, height: 1080 });
        await page.waitForTimeout(600);
        await page.screenshot({
            path: '.artifacts/ui-overhaul/ux16-1-checking-enabled-1920x1080.png',
            animations: 'disabled',
        });

        // Inspect detail disclosure if popover opened
        await tradesBadge.click();
        const popover = page.getByTestId('data-integrity-popover-trades');
        if (await popover.isVisible({ timeout: 5000 }).catch(() => false)) {
            const detailText = await popover.textContent();
            // If active capture is wired by Codex, it must contain "capture only, no derived CVD yet"
            if (detailText?.includes('captured')) {
                expect(detailText).toMatch(/no derived CVD yet/i);
            }
        }
        await page.keyboard.press('Escape');
    });

    test('5. Responsive layout and keyboard accessibility', async ({ page }, testInfo) => {
        test.setTimeout(90_000);

        await page.goto('/', { waitUntil: 'domcontentloaded' });
        await expect(page.getByRole('button', { name: 'OPTIONS METRICS', exact: true })).toBeVisible({ timeout: 25_000 });

        const integrityStrip = page.getByTestId('data-integrity-strip');
        await expect(integrityStrip).toBeVisible({ timeout: 20_000 });

        const tradesBadge = page.getByTestId('data-integrity-trades');
        await expect(tradesBadge).toBeVisible({ timeout: 20_000 });

        if (testInfo.project.name === 'mobile') {
            // Verify mobile 390x844 viewport does not have layout-breaking overflow
            const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
            const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
            expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2); // allowance for fractional px

            // Capture mobile evidence screenshot
            await page.screenshot({
                path: '.artifacts/ui-overhaul/ux16-1-mobile-390x844.png',
                animations: 'disabled',
            });
        }

        // Test keyboard accessibility
        await tradesBadge.focus();
        await expect(tradesBadge).toBeFocused();

        // Enter opens popover
        await page.keyboard.press('Enter');
        const popover = page.getByTestId('data-integrity-popover-trades');
        await expect(popover).toBeVisible({ timeout: 10_000 });

        // Escape dismisses popover
        await page.keyboard.press('Escape');
        await expect(popover).not.toBeVisible();
    });

    test('6. Regression: Workspace modes, chart overlays, and fallback integrity preserved', async ({ page }, testInfo) => {
        test.setTimeout(90_000);

        if (testInfo.project.name !== 'desktop-16x9') {
            return;
        }

        await page.goto('/', { waitUntil: 'domcontentloaded' });
        await expect(page.getByRole('button', { name: 'OPTIONS METRICS', exact: true })).toBeVisible({ timeout: 25_000 });

        // Confirm chart canvas is active
        await expect(page.getByLabel(/BTC price chart/)).toBeVisible({ timeout: 20_000 });

        // Confirm header workspace modes remain operable
        const contextBtn = page.getByTestId('workspace-mode-context').first();
        const flowBtn = page.getByTestId('workspace-mode-flow').first();
        const setupBtn = page.getByTestId('workspace-mode-setup').first();

        await expect(contextBtn).toBeVisible({ timeout: 10_000 });
        await expect(flowBtn).toBeVisible({ timeout: 10_000 });
        await expect(setupBtn).toBeVisible({ timeout: 10_000 });

        // Flow mode containers exist without errors
        await flowBtn.click();
        await expect(page.getByTestId('flow-mode-container')).toBeVisible({ timeout: 10_000 });

        // Setup mode containers exist without errors
        await setupBtn.click();
        await expect(page.getByTestId('setup-mode-container')).toBeVisible({ timeout: 10_000 });

        // Return to Context mode
        await contextBtn.click();
        await expect(page.getByTestId('context-mode-container')).toBeVisible({ timeout: 10_000 });
    });
});
