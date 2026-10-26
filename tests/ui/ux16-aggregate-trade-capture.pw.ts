import {
    expect,
    test,
    type Page,
    type Route,
} from '@playwright/test';

const CAPABILITY_URL = '**/api/orderflow/config';

const enabledCapability = {
    schemaVersion: 1,
    enabled: true,
    dataMode: 'SHADOW',
    source: 'BINANCE_SPOT',
    symbol: 'BTCUSDT',
} as const;

async function fulfillCapability(route: Route, enabled: boolean): Promise<void> {
    await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...enabledCapability, enabled }),
        headers: { 'Cache-Control': 'no-store' },
    });
}

async function waitForWorkspace(page: Page): Promise<void> {
    await expect(page.getByRole('button', { name: 'OPTIONS METRICS', exact: true })).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId('data-integrity-trades')).toBeVisible({ timeout: 20_000 });
}

async function openTradePopover(page: Page): Promise<void> {
    await page.getByTestId('data-integrity-trades').click();
    await expect(page.getByTestId('data-integrity-popover-trades')).toBeVisible({ timeout: 10_000 });
}

async function installDeterministicAggregateTradeWorker(page: Page): Promise<void> {
    await page.addInitScript(() => {
        const NativeWorker = window.Worker;
        type WorkerMessageHandler = ((event: MessageEvent) => void) | null;

        class AggregateTradeFixtureWorker {
            onmessage: WorkerMessageHandler = null;
            onerror: ((event: ErrorEvent) => void) | null = null;

            constructor() {
                const fixtureWindow = window as unknown as {
                    __emitUx16AggregateTrades?: () => void;
                };
                fixtureWindow.__emitUx16AggregateTrades = () => {
                    const now = Date.now();
                    const trades = [
                        {
                            schemaVersion: 1,
                            venue: 'BINANCE_SPOT',
                            symbol: 'BTCUSDT',
                            aggregateTradeId: 9_000_001,
                            firstTradeId: 9_000_001,
                            lastTradeId: 9_000_001,
                            eventTime: now - 1,
                            tradeTime: now - 1,
                            price: 68_123.45,
                            quantityBtc: 0.125,
                            notionalUsd: 8_515.43125,
                            aggressor: 'BUY',
                            buyerIsMaker: false,
                        },
                        {
                            schemaVersion: 1,
                            venue: 'BINANCE_SPOT',
                            symbol: 'BTCUSDT',
                            aggregateTradeId: 9_000_002,
                            firstTradeId: 9_000_002,
                            lastTradeId: 9_000_002,
                            eventTime: now,
                            tradeTime: now,
                            price: 68_122.5,
                            quantityBtc: 0.25,
                            notionalUsd: 17_030.625,
                            aggressor: 'SELL',
                            buyerIsMaker: true,
                        },
                    ];
                    this.emit({ type: 'TRADE_BATCH', trades });
                    this.emit({
                        type: 'STATUS',
                        connected: true,
                        reconnectAttempt: 0,
                        retainedTradeCount: 2,
                        lastAggregateTradeId: 9_000_002,
                        coverage: {
                            schemaVersion: 1,
                            dataMode: 'SHADOW',
                            source: 'BINANCE_SPOT',
                            venue: 'BINANCE_SPOT',
                            symbol: 'BTCUSDT',
                            capturedAt: now,
                            eventTime: now,
                            coverageStart: now - 1,
                            coverageEnd: now,
                            freshnessMs: 0,
                            sequenceState: 'LIVE',
                            gapCount: 0,
                            precision: 'TRADE',
                            approximation: 'NONE',
                            quality: 'MEDIUM',
                        },
                        stats: {
                            acceptedCount: 2,
                            duplicateCount: 0,
                            outOfOrderCount: 0,
                            invalidCount: 0,
                            reconnectCount: 0,
                        },
                    });
                };
            }

            postMessage(command: { type?: string }): void {
                if (command.type !== 'START') return;
                const now = Date.now();
                window.setTimeout(() => this.emit({
                    type: 'STATUS',
                    connected: true,
                    reconnectAttempt: 0,
                    retainedTradeCount: 0,
                    lastAggregateTradeId: null,
                    coverage: {
                        schemaVersion: 1,
                        dataMode: 'SHADOW',
                        source: 'BINANCE_SPOT',
                        venue: 'BINANCE_SPOT',
                        symbol: 'BTCUSDT',
                        capturedAt: now,
                        eventTime: now,
                        coverageStart: null,
                        coverageEnd: null,
                        freshnessMs: 0,
                        sequenceState: 'BUFFERING',
                        gapCount: 0,
                        precision: 'TRADE',
                        approximation: 'NONE',
                        quality: 'UNAVAILABLE',
                    },
                    stats: {
                        acceptedCount: 0,
                        duplicateCount: 0,
                        outOfOrderCount: 0,
                        invalidCount: 0,
                        reconnectCount: 0,
                    },
                }), 0);
            }

            terminate(): void {}

            private emit(data: unknown): void {
                this.onmessage?.(new MessageEvent('message', { data }));
            }
        }

        window.Worker = function WorkerFixture(
            scriptURL: string | URL,
            options?: WorkerOptions,
        ): Worker {
            if (options?.name === 'binance-aggregate-trade-capture') {
                return new AggregateTradeFixtureWorker() as unknown as Worker;
            }
            return new NativeWorker(scriptURL, options);
        } as unknown as typeof Worker;
    });
}

test.describe('UX16.1 Aggregate-Trade Capture Acceptance', () => {
    test.describe.configure({ timeout: 120_000 });

    test.beforeEach(async ({ page }, testInfo) => {
        const dataMode = testInfo.title.includes('keyboard operable') ? 'DEMO' : 'LIVE';
        await page.addInitScript((initialDataMode) => {
            localStorage.setItem(
                'btc-terminal-ui-v1',
                JSON.stringify({
                    state: {
                        dataMode: initialDataMode,
                        activeWorkspace: 'MARKET STRUCTURE',
                        workspaceMode: 'CONTEXT',
                    },
                    version: 1,
                }),
            );
        }, dataMode);
    });

    test('1. Safe default: disabled capture is UNAVAILABLE and makes no derived claims', async ({ page }, testInfo) => {
        await page.route(CAPABILITY_URL, (route) => fulfillCapability(route, false));

        await page.goto('/', { waitUntil: 'domcontentloaded' });
        await waitForWorkspace(page);

        const tradesBadge = page.getByTestId('data-integrity-trades');
        await expect(tradesBadge).toHaveAttribute('data-status', 'unavailable', { timeout: 15_000 });
        await expect(tradesBadge).toHaveAccessibleName('SPOT TAPE status: UNAVAILABLE');

        await openTradePopover(page);
        const popoverText = await page.getByTestId('data-integrity-popover-trades').textContent();
        expect(popoverText).toMatch(/disabled|not connected|unavailable/i);
        expect(popoverText).not.toMatch(/live cvd|footprint|imbalance|absorption|a-grade/i);

        if (testInfo.project.name === 'desktop-16x9') {
            await page.setViewportSize({ width: 1366, height: 768 });
            await page.screenshot({
                path: '.artifacts/ui-overhaul/ux16-1-safe-default-1366x768.png',
                animations: 'disabled',
            });
        }
    });

    test('2. Pending capability remains LOADING until the server resolves it', async ({ page }) => {
        let releaseCapability!: () => void;
        const capabilityPending = new Promise<void>((resolve) => {
            releaseCapability = resolve;
        });

        await page.route(CAPABILITY_URL, async (route) => {
            await capabilityPending;
            await fulfillCapability(route, false);
        });

        await page.goto('/', { waitUntil: 'domcontentloaded' });
        await waitForWorkspace(page);

        const tradesBadge = page.getByTestId('data-integrity-trades');
        await expect(tradesBadge).toHaveAttribute('data-status', 'loading');
        await expect(tradesBadge).not.toContainText(/\d+\s*captured/i);

        releaseCapability();
        await expect(tradesBadge).toHaveAttribute('data-status', 'unavailable', { timeout: 10_000 });
    });

    const malformedCapabilities = [
        {
            label: 'HTTP 500 JSON',
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Internal Server Error', stack: 'secret_stack_trace_do_not_leak' }),
        },
        {
            label: 'invalid JSON',
            status: 200,
            contentType: 'application/json',
            body: '{"enabled": true,',
        },
        {
            label: 'HTML payload',
            status: 200,
            contentType: 'text/html',
            body: '<html><body>private_upstream_error</body></html>',
        },
    ] as const;

    for (const malformed of malformedCapabilities) {
        test(`3. Error resilience: ${malformed.label} fails closed without leaking details`, async ({ page }) => {
            await page.route(CAPABILITY_URL, async (route) => {
                await route.fulfill({
                    status: malformed.status,
                    contentType: malformed.contentType,
                    body: malformed.body,
                });
            });

            await page.goto('/', { waitUntil: 'domcontentloaded' });
            await waitForWorkspace(page);

            await expect(page.getByLabel(/BTC price chart/)).toBeVisible({ timeout: 20_000 });
            const tradesBadge = page.getByTestId('data-integrity-trades');
            await expect(tradesBadge).toHaveAttribute('data-status', 'error', { timeout: 10_000 });
            await expect(page.locator('body')).not.toContainText('secret_stack_trace_do_not_leak');
            await expect(page.locator('body')).not.toContainText('private_upstream_error');
        });
    }

    test('4. Enabled capture becomes READY only after accepted aggregate trades', async ({ page }, testInfo) => {
        await installDeterministicAggregateTradeWorker(page);
        await page.route(CAPABILITY_URL, (route) => fulfillCapability(route, true));

        await page.goto('/', { waitUntil: 'domcontentloaded' });
        await waitForWorkspace(page);

        const tradesBadge = page.getByTestId('data-integrity-trades');
        await expect(tradesBadge).toHaveAttribute('data-status', 'loading');

        await expect.poll(
            () => page.evaluate(() => Boolean((window as unknown as {
                __emitUx16AggregateTrades?: () => void;
            }).__emitUx16AggregateTrades)),
            { timeout: 30_000 },
        ).toBe(true);
        await page.evaluate(() => {
            const fixtureWindow = window as unknown as {
                __emitUx16AggregateTrades?: () => void;
            };
            if (!fixtureWindow.__emitUx16AggregateTrades) {
                throw new Error('Aggregate-trade worker fixture was not initialized');
            }
            fixtureWindow.__emitUx16AggregateTrades();
        });

        await expect(tradesBadge).toHaveAttribute('data-status', 'ready', { timeout: 10_000 });
        await expect(tradesBadge).toHaveAccessibleName('SPOT TAPE status: READY');

        await openTradePopover(page);
        const detail = page.getByTestId('data-integrity-detail-trades');
        await expect(detail).toContainText(/2 captured/i);
        await expect(detail).toContainText(/capture only, no derived CVD yet/i);
        await expect(page.getByTestId('data-integrity-popover-trades')).toContainText('BINANCE_SPOT');
        await expect(page.getByTestId('data-integrity-popover-trades')).toContainText('TRADE');

        if (testInfo.project.name === 'desktop-16x9') {
            await page.setViewportSize({ width: 1920, height: 1080 });
            await page.screenshot({
                path: '.artifacts/ui-overhaul/ux16-1-ready-enabled-1920x1080.png',
                animations: 'disabled',
            });
        }
    });

    test('5. Integrity controls are responsive and keyboard operable', async ({ page }, testInfo) => {
        await page.route(CAPABILITY_URL, (route) => fulfillCapability(route, false));
        await page.goto('/', { waitUntil: 'domcontentloaded' });
        await waitForWorkspace(page);

        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
        expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);

        const tradesBadge = page.getByTestId('data-integrity-trades');
        const popover = page.getByTestId('data-integrity-popover-trades');

        await tradesBadge.focus();
        await expect(tradesBadge).toBeFocused();
        await tradesBadge.press('Enter');
        await expect(popover).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(popover).not.toBeVisible();

        await tradesBadge.focus();
        await tradesBadge.press('Space');
        await expect(popover).toBeVisible();

        if (testInfo.project.name === 'mobile') {
            await page.screenshot({
                path: '.artifacts/ui-overhaul/ux16-1-mobile-390x844.png',
                animations: 'disabled',
            });
        }

        await page.keyboard.press('Escape');
        await expect(popover).not.toBeVisible();
    });

    test('6. Workspace modes and chart integrity remain operable', async ({ page }) => {
        await page.route(CAPABILITY_URL, (route) => fulfillCapability(route, false));
        await page.goto('/', { waitUntil: 'domcontentloaded' });
        await waitForWorkspace(page);

        await expect(page.getByLabel(/BTC price chart/)).toBeVisible({ timeout: 20_000 });

        const contextButton = page.getByTestId('workspace-mode-context').first();
        const flowButton = page.getByTestId('workspace-mode-flow').first();
        const setupButton = page.getByTestId('workspace-mode-setup').first();

        await expect(contextButton).toBeVisible();
        await expect(flowButton).toBeVisible();
        await expect(setupButton).toBeVisible();

        await flowButton.click();
        await expect(flowButton).toHaveAttribute('aria-selected', 'true');
        if (page.viewportSize()?.width !== 390) {
            await expect(page.getByTestId('flow-mode-container')).toBeVisible();
        }
        await setupButton.click();
        await expect(setupButton).toHaveAttribute('aria-selected', 'true');
        if (page.viewportSize()?.width !== 390) {
            await expect(page.getByTestId('setup-mode-container')).toBeVisible();
        }
        await contextButton.click();
        await expect(contextButton).toHaveAttribute('aria-selected', 'true');
        if (page.viewportSize()?.width !== 390) {
            await expect(page.getByTestId('context-mode-container')).toBeVisible();
        }
    });
});
