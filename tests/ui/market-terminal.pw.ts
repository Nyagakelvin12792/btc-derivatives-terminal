import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

function buildValidatedLiveMarketFixtures() {
    const baseTime = 1_740_000_000;
    const stepSeconds = 3_600;
    const totalBars = 10_000;
    const allCandles = Array.from({ length: totalBars }, (_, index) => {
        const time = baseTime - (totalBars - 1 - index) * stepSeconds;
        const open = 68_000 + Math.sin(index / 15) * 420 + (index % 7) * 12;
        const close = open + (index % 2 === 0 ? 48 : -36);
        const high = Math.max(open, close) + 65;
        const low = Math.min(open, close) - 55;
        const volume = 120 + (index % 19) * 14;
        const takerBuyVolume = volume * (index % 2 === 0 ? 0.58 : 0.41);
        const takerSellVolume = volume - takerBuyVolume;
        return {
            time,
            closeTime: (time + stepSeconds) * 1_000 - 1,
            open,
            high,
            low,
            close,
            volume,
            quoteVolume: volume * close,
            trades: 1_850 + (index % 300),
            takerBuyVolume,
            takerSellVolume,
            delta: takerBuyVolume - takerSellVolume,
        };
    });

    const bids = Array.from({ length: 20 }, (_, i) => {
        const price = Number((68_420 - i * 4.5).toFixed(2));
        const quantity = Number((1.25 + (i % 5) * 0.85 + (i === 2 ? 6.4 : 0)).toFixed(4));
        return { price, quantity, notionalUsd: price * quantity };
    });
    const asks = Array.from({ length: 20 }, (_, i) => {
        const price = Number((68_421.5 + i * 4.5).toFixed(2));
        const quantity = Number((1.15 + (i % 4) * 0.78 + (i === 1 ? 5.8 : 0)).toFixed(4));
        return { price, quantity, notionalUsd: price * quantity };
    });
    const bidDepthUsd = bids.reduce((sum, item) => sum + item.notionalUsd, 0);
    const askDepthUsd = asks.reduce((sum, item) => sum + item.notionalUsd, 0);
    const bestBid = bids[0].price;
    const bestAsk = asks[0].price;
    const midPrice = (bestBid + bestAsk) / 2;
    const spread = bestAsk - bestBid;

    return {
        allCandles,
        snapshot: {
            schemaVersion: 1 as const,
            dataMode: 'LIVE' as const,
            source: 'BINANCE_SPOT' as const,
            symbol: 'BTCUSDT' as const,
            interval: '1h' as const,
            timestamp: new Date(baseTime * 1_000).toISOString(),
            upstreamLatencyMs: 28,
            candles: allCandles.slice(-1_000),
            book: {
                lastUpdateId: 90123456,
                bids,
                asks,
                bestBid,
                bestAsk,
                midPrice,
                spread,
                spreadBps: (spread / midPrice) * 10_000,
                bidDepthUsd,
                askDepthUsd,
                imbalance: (bidDepthUsd - askDepthUsd) / (bidDepthUsd + askDepthUsd),
            },
            ticker: {
                lastPrice: 68_420.8,
                priceChange: 840.2,
                priceChangePercent: 1.24,
                highPrice: 69_120,
                lowPrice: 67_310,
                volume: 28_450,
                quoteVolume: 1_942_000_000,
                tradeCount: 742_100,
                closeTime: baseTime * 1_000,
            },
        },
    };
}

async function mountLiveMarketRoutes(page: Page) {
    const { allCandles, snapshot } = buildValidatedLiveMarketFixtures();

    await page.route('**/api/binance/market**', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(snapshot),
        });
    });

    await page.route('**/api/binance/history**', async (route) => {
        const url = new URL(route.request().url());
        const limit = Number(url.searchParams.get('limit') ?? '1000');
        const endTimeParam = url.searchParams.get('endTime');
        const endTimeSec = endTimeParam ? Math.floor(Number(endTimeParam) / 1_000) : null;
        const eligible = endTimeSec === null
            ? allCandles
            : allCandles.filter((bar) => bar.time <= endTimeSec);
        const slice = eligible.slice(-limit);
        const oldest = slice[0];
        const hasMore = oldest && oldest.time > allCandles[0].time;
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                schemaVersion: 1,
                dataMode: 'LIVE',
                source: 'BINANCE_SPOT',
                symbol: 'BTCUSDT',
                interval: '1h',
                timestamp: snapshot.timestamp,
                candles: slice,
                nextEndTime: hasMore ? (oldest.time - 1) * 1_000 : null,
            }),
        });
    });

    await page.route('**/api/binance/volume-profile**', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                schemaVersion: 1,
                dataMode: 'LIVE',
                source: 'BINANCE_SPOT',
                symbol: 'BTCUSDT',
                interval: '15m',
                startTime: allCandles[allCandles.length - 120].time,
                endTime: allCandles[allCandles.length - 1].time,
                timestamp: snapshot.timestamp,
                candles: allCandles.slice(-120),
            }),
        });
    });
}

test.setTimeout(120_000);

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
});

test('renders the chart-first terminal, single drawing rail, and mobile dock collapse workflow', async ({ page }, testInfo) => {
    await expect(page.getByLabel('Demo BTC price chart with options structure overlays')).toBeVisible();
    await expect(page.getByText('CALL WALL', { exact: false }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /FIXED RANGE VP/ })).toContainText('FIXED RANGE VP');
    await expect(page.getByLabel('Demo cumulative volume delta candles')).toBeVisible();
    await expect(page.getByRole('tab', { name: 'CVD', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('canvas').first()).toBeVisible();

    // Part D: Exactly one drawing-creation surface is visible (left rail), and upper toolbar has zero drawing buttons
    const drawingRail = page.getByRole('navigation', { name: 'Chart drawing tools' });
    const upperToolbar = page.getByRole('toolbar', { name: 'Chart navigation and workspace actions' });
    await expect(drawingRail).toBeVisible();
    await expect(upperToolbar).toBeVisible();
    for (const label of ['Cursor', 'Trend line', 'Horizontal line', 'Vertical line', 'Rectangle', 'Fibonacci retracement', 'Long position', 'Short position', 'Text note']) {
        await expect(drawingRail.getByRole('button', { name: label, exact: true })).toBeVisible();
    }
    for (const duplicateLabel of ['Cursor', 'Draw', 'Horizontal', 'Vertical', 'Fibonacci', 'Long', 'Short']) {
        await expect(upperToolbar.getByRole('button', { name: duplicateLabel, exact: true })).toHaveCount(0);
    }

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

        // Verify mobile dock & collapse behavior and capture mobile verification screenshot
        const collapseBtn = page.getByTestId('study-pane-collapse-button');
        await expect(collapseBtn).toHaveAttribute('aria-expanded', 'true');
        await collapseBtn.click();
        await expect(collapseBtn).toHaveAttribute('aria-expanded', 'false');
        await expect(page.getByTestId('order-flow-pane')).toHaveCount(0);
        await expect(page.getByRole('tablist', { name: 'Order-flow studies' })).toBeVisible();

        await page.screenshot({
            path: '.artifacts/ui-overhaul/ux15-0-mobile-dock-collapse-390x844.png',
            animations: 'disabled',
        });

        await page.getByRole('tab', { name: 'CVD', exact: true }).click();
        await expect(page.getByTestId('order-flow-pane')).toBeVisible();
    }

    await page.screenshot({
        path: `.artifacts/ui-overhaul/market-structure-${testInfo.project.name}.png`,
        animations: 'disabled',
    });
});

test('has no serious or critical automated accessibility violations', async ({ page }) => {
    const results = await new AxeBuilder({ page }).disableRules(['color-contrast']).analyze();
    const severe = results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact || ''));
    expect(severe).toEqual([]);
});

test('exposes the approved market-structure controls and honest states without stranded object toolbars', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'Desktop terminal control-density check');

    await expect(page.getByText('POSITIVE GAMMA · MEAN-REVERSION')).toBeVisible();
    await expect(page.getByText('NEGATIVE GAMMA · EXPANSION')).toBeVisible();
    await expect(page.getByText('POC', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('Coverage 96%')).toBeVisible();

    // No object or drawing toolbar is visible until an object is explicitly selected
    await expect(page.getByRole('toolbar', { name: 'VP controls' })).toHaveCount(0);
    await expect(page.getByRole('toolbar', { name: 'Drawing controls' })).toHaveCount(0);

    // Explicit click on the Fixed Range VP header selects it and opens its contextual toolbar
    await page.getByRole('button', { name: /FIXED RANGE VP/ }).click();
    await expect(page.getByRole('toolbar', { name: 'VP controls' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('toolbar', { name: 'VP controls' })).toHaveCount(0);

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

    await page.getByRole('button', { name: /FIXED RANGE VP/ }).click();
    await page.getByRole('button', { name: 'VP settings', exact: true }).click();
    await page.getByRole('button', { name: 'Use all loaded' }).click();
    await expect(profile).toHaveAttribute('data-selected-bars', '192');
    await page.getByLabel('Number of rows').selectOption('72');
    await page.keyboard.press('Escape');

    await expect(chart).toHaveAttribute('data-chart-generation', '1');
    await expect(chart).toHaveAttribute('data-visible-from', pannedFrom!);
});

test('keeps bottom dock mounted when collapsed, reopens on any tab click, persists height, and preserves chart logical range and crosshair sync', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'Desktop linked-pane geometry check');

    const chart = page.getByRole('group', { name: 'Demo BTC price chart with options structure overlays' });
    const pane = page.getByTestId('order-flow-pane');
    const tabs = page.getByRole('tablist', { name: 'Order-flow studies' });
    const collapseButton = page.getByTestId('study-pane-collapse-button');

    await expect(chart).toHaveAttribute('data-volume-panel', 'hidden');
    await expect(chart).toHaveAttribute('data-time-axis', 'lower-pane');
    await expect(pane).toHaveAttribute('data-crosshair-sync', 'native');
    await expect(tabs).toHaveAttribute('data-position', 'workspace-bottom');
    await expect(collapseButton).toHaveAttribute('aria-expanded', 'true');

    // Pan the main chart first so we can verify collapse/expand/tab switch never resets the panned range
    const chartBoxBefore = await chart.boundingBox();
    expect(chartBoxBefore).not.toBeNull();
    const initialFrom = await chart.getAttribute('data-visible-from');
    await page.mouse.move(chartBoxBefore!.x + 220, chartBoxBefore!.y + 180);
    await page.mouse.down();
    await page.mouse.move(chartBoxBefore!.x + 390, chartBoxBefore!.y + 180, { steps: 8 });
    await page.mouse.up();
    await expect.poll(() => chart.getAttribute('data-visible-from')).not.toBe(initialFrom);
    const pannedFrom = await chart.getAttribute('data-visible-from');
    const pannedTo = await chart.getAttribute('data-visible-to');

    // Resize the lower study pane via keyboard on the separator and verify height persistence
    const resizeHandle = page.getByTestId('study-pane-resize-handle');
    await resizeHandle.focus();
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await expect(pane).toHaveAttribute('data-pane-height', '224');

    const paneBox = await pane.boundingBox();
    const tabsBox = await tabs.boundingBox();
    expect(paneBox).not.toBeNull();
    expect(tabsBox).not.toBeNull();
    expect(tabsBox!.y).toBeGreaterThanOrEqual(paneBox!.y + paneBox!.height - 1);

    // Collapse via dedicated collapse button: hides only content pane, keeps dock visible, preserves chart range
    await collapseButton.click();
    await expect(pane).toHaveCount(0);
    await expect(tabs).toBeVisible();
    await expect(collapseButton).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('tab', { name: 'CVD', exact: true })).toHaveAttribute('aria-selected', 'false');
    await expect(chart).toHaveAttribute('data-chart-generation', '1');
    await expect(chart).toHaveAttribute('data-visible-from', pannedFrom!);
    await expect(chart).toHaveAttribute('data-visible-to', pannedTo!);

    // Selecting each tab while collapsed reopens the pane to that study and restores the persisted height (224px)
    for (const [tabLabel, studyCode] of [
        ['Delta', 'DELTA'],
        ['Book', 'BOOK'],
        ['Liquidity', 'LIQUIDITY'],
        ['CVD', 'CVD'],
    ] as const) {
        await page.getByRole('tab', { name: tabLabel, exact: true }).click();
        const reopened = page.getByTestId('order-flow-pane');
        await expect(reopened).toBeVisible();
        await expect(reopened).toHaveAttribute('data-study', studyCode);
        await expect(reopened).toHaveAttribute('data-pane-height', '224');
        await expect(page.getByRole('tab', { name: tabLabel, exact: true })).toHaveAttribute('aria-selected', 'true');
        await expect(chart).toHaveAttribute('data-chart-generation', '1');
        await expect(chart).toHaveAttribute('data-visible-from', pannedFrom!);
        await expect(chart).toHaveAttribute('data-visible-to', pannedTo!);

        if (studyCode !== 'CVD') {
            // Re-clicking the active tab collapses the pane again while keeping the dock visible
            await page.getByRole('tab', { name: tabLabel, exact: true }).click();
            await expect(page.getByTestId('order-flow-pane')).toHaveCount(0);
            await expect(tabs).toBeVisible();
        }
    }

    // Verify crosshair synchronization after reopening CVD
    const chartBox = await chart.boundingBox();
    expect(chartBox).not.toBeNull();
    const reopenedPane = page.getByTestId('order-flow-pane');
    await page.mouse.move(chartBox!.x + chartBox!.width * 0.55, chartBox!.y + chartBox!.height * 0.45);
    await expect.poll(() => chart.getAttribute('data-crosshair-time')).not.toBe('');
    const chartTime = await chart.getAttribute('data-crosshair-time');
    await expect(reopenedPane).toHaveAttribute('data-crosshair-time', chartTime!);

    await page.getByRole('button', { name: 'Layers', exact: true }).click();
    await expect(page.getByText('Volume', { exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');
});

test('enforces contextual drawing toolbar lifecycle: neutral after creation, visible on explicit select, dismissed on blank click or Escape, and deleted cleanly', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'Desktop drawing interaction check');

    const chart = page.getByRole('group', { name: 'Demo BTC price chart with options structure overlays' });
    const drawingRail = page.getByRole('navigation', { name: 'Chart drawing tools' });
    const chartBox = await chart.boundingBox();
    expect(chartBox).not.toBeNull();

    // 1. Arm Trend line in the left rail and complete a two-point drawing
    await drawingRail.getByRole('button', { name: 'Trend line', exact: true }).click();
    await page.mouse.click(chartBox!.x + 250, chartBox!.y + 170);
    await page.mouse.move(chartBox!.x + 430, chartBox!.y + 250);
    await page.mouse.click(chartBox!.x + 430, chartBox!.y + 250);
    await expect(chart).toHaveAttribute('data-drawing-count', '1');

    // Completing a drawing returns tool to Cursor and does NOT leave the floating toolbar visible
    await expect(drawingRail.getByRole('button', { name: 'Cursor', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('toolbar', { name: 'Drawing controls' })).toHaveCount(0);

    await page.screenshot({
        path: '.artifacts/ui-overhaul/ux15-0-drawing-deselected-1920x1080.png',
        animations: 'disabled',
    });

    // 2. Explicitly click the drawing to select it and show the contextual toolbar
    const drawing = chart.locator('[data-drawing-id]').first();
    const initialTime = await drawing.getAttribute('data-start-time');
    const drawingBox = await drawing.boundingBox();
    expect(drawingBox).not.toBeNull();

    await page.mouse.click(drawingBox!.x + drawingBox!.width / 2, drawingBox!.y + drawingBox!.height / 2);
    const toolbar = page.getByRole('toolbar', { name: 'Drawing controls' });
    await expect(toolbar).toBeVisible();

    await page.screenshot({
        path: '.artifacts/ui-overhaul/ux15-0-drawing-selected-1920x1080.png',
        animations: 'disabled',
    });

    // 3. Blank chart click deselects the drawing and hides the toolbar
    await page.mouse.click(chartBox!.x + 90, chartBox!.y + 80);
    await expect(toolbar).toHaveCount(0);

    // 4. Re-select, then press Escape to hide the toolbar without closing the workspace
    await page.mouse.click(drawingBox!.x + drawingBox!.width / 2, drawingBox!.y + drawingBox!.height / 2);
    await expect(toolbar).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(toolbar).toHaveCount(0);
    await expect(chart).toBeVisible();

    // 5. Drag the drawing and verify time/price anchoring updates
    await page.mouse.move(drawingBox!.x + drawingBox!.width / 2, drawingBox!.y + drawingBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(drawingBox!.x + drawingBox!.width / 2 + 90, drawingBox!.y + drawingBox!.height / 2, { steps: 6 });
    await page.mouse.up();
    await expect.poll(() => drawing.getAttribute('data-start-time')).not.toBe(initialTime);
    await expect(toolbar).toBeVisible();

    // 6. Lock drawing: verify Delete key does not delete a locked drawing
    await toolbar.getByRole('button', { name: 'Lock selected drawing' }).click();
    await page.keyboard.press('Delete');
    await expect(chart).toHaveAttribute('data-drawing-count', '1');
    await toolbar.getByRole('button', { name: 'Unlock selected drawing' }).click();

    // 7. Delete via toolbar button, then Undo
    await toolbar.getByRole('button', { name: 'Delete selected drawing' }).click();
    await expect(chart).toHaveAttribute('data-drawing-count', '0');
    await expect(toolbar).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(chart).toHaveAttribute('data-drawing-count', '1');
    await expect(toolbar).toHaveCount(0);

    // 8. Explicitly select again and delete via Delete key, then restore with Ctrl+Z
    const restoredBox = await drawing.boundingBox();
    expect(restoredBox).not.toBeNull();
    await page.mouse.click(restoredBox!.x + restoredBox!.width / 2, restoredBox!.y + restoredBox!.height / 2);
    await expect(toolbar).toBeVisible();
    await page.keyboard.press('Delete');
    await expect(chart).toHaveAttribute('data-drawing-count', '0');
    await expect(toolbar).toHaveCount(0);
    await page.keyboard.press('Control+z');
    await expect(chart).toHaveAttribute('data-drawing-count', '1');
});

test('renders responsive Liquidity panel without dock overlap or clipping at 1366x768, 1664x936, and 1920x1080 and preserves 10,000-candle history', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'Desktop multi-resolution Liquidity & 10,000-bar verification');

    await mountLiveMarketRoutes(page);
    await page.getByRole('button', { name: '● DEMO', exact: true }).click();
    await expect(page.getByRole('button', { name: '● LIVE', exact: true })).toBeVisible();

    await expect(page.getByText('10,000 / 10,000 bars')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('10,000 bars', { exact: true })).toBeVisible();

    // 1664x936 — CVD expanded screenshot
    await page.setViewportSize({ width: 1664, height: 936 });
    await expect(page.getByTestId('order-flow-pane')).toHaveAttribute('data-study', 'CVD');
    await page.screenshot({
        path: '.artifacts/ui-overhaul/ux15-0-cvd-expanded-1664x936.png',
        animations: 'disabled',
    });

    // Switch to Liquidity and verify at 1664x936, 1366x768, and 1920x1080
    await page.getByRole('tab', { name: 'Liquidity', exact: true }).click();
    const liquidityPanel = page.getByTestId('liquidity-panel');
    const depthList = page.getByTestId('liquidity-depth-list');
    const dock = page.getByTestId('order-flow-dock');
    await expect(liquidityPanel).toBeVisible();
    await expect(depthList).toBeVisible();
    await expect(page.getByTestId('liquidity-level-row')).toHaveCount(8);

    // Check non-color distinction on BID and ASK badges
    await expect(liquidityPanel.locator('[data-side="BID"]').first()).toContainText('▲');
    await expect(liquidityPanel.locator('[data-side="ASK"]').first()).toContainText('▼');

    for (const viewport of [
        { width: 1664, height: 936, screenshot: '.artifacts/ui-overhaul/ux15-0-liquidity-expanded-1664x936.png' },
        { width: 1366, height: 768, screenshot: '.artifacts/ui-overhaul/ux15-0-liquidity-expanded-1366x768.png' },
        { width: 1920, height: 1080, screenshot: null },
    ]) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await expect(liquidityPanel).toBeVisible();
        await expect(dock).toBeVisible();

        const paneBox = await page.getByTestId('order-flow-pane').boundingBox();
        const dockBox = await dock.boundingBox();
        expect(paneBox).not.toBeNull();
        expect(dockBox).not.toBeNull();
        expect(dockBox!.y).toBeGreaterThanOrEqual(paneBox!.y + paneBox!.height - 1);

        // Ensure no notional value is horizontally clipped and no horizontal scrollbar appears
        const layoutAudit = await page.evaluate(() => {
            const panel = document.querySelector('[data-testid="liquidity-panel"]') as HTMLElement | null;
            const dck = document.querySelector('[data-testid="order-flow-dock"]') as HTMLElement | null;
            const notionals = Array.from(document.querySelectorAll('[data-testid="liquidity-level-notional"]')) as HTMLElement[];
            if (!panel || !dck || notionals.length === 0) return { ok: false, reason: 'missing-elements' };
            const panelRect = panel.getBoundingClientRect();
            const dockRect = dck.getBoundingClientRect();
            const overlapsDock = panelRect.bottom > dockRect.top + 0.5;
            const clippedNotional = notionals.some((el) => el.scrollWidth > el.clientWidth + 1);
            const docOverflowX = document.documentElement.scrollWidth > document.documentElement.clientWidth;
            return {
                ok: !overlapsDock && !clippedNotional && !docOverflowX,
                overlapsDock,
                clippedNotional,
                docOverflowX,
            };
        });
        expect(layoutAudit).toEqual({
            ok: true,
            overlapsDock: false,
            clippedNotional: false,
            docOverflowX: false,
        });

        if (viewport.screenshot) {
            await page.screenshot({
                path: viewport.screenshot,
                animations: 'disabled',
            });
        }
    }

    // 1366x768 — lower pane collapsed with dock visible screenshot
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.getByTestId('study-pane-collapse-button').click();
    await expect(page.getByTestId('order-flow-pane')).toHaveCount(0);
    await expect(dock).toBeVisible();
    await page.screenshot({
        path: '.artifacts/ui-overhaul/ux15-0-pane-collapsed-1366x768.png',
        animations: 'disabled',
    });
});

test('creates, configures, and manipulates Fibonacci retracement with levels popover and undo', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'Desktop Fibonacci interaction check');

    const chart = page.getByRole('group', { name: 'Demo BTC price chart with options structure overlays' });
    const drawingRail = page.getByRole('navigation', { name: 'Chart drawing tools' });
    const chartBox = await chart.boundingBox();
    expect(chartBox).not.toBeNull();

    // 1. Arm Fibonacci tool in the left rail and complete a two-point drawing
    await drawingRail.getByRole('button', { name: 'Fibonacci retracement', exact: true }).click();
    await page.mouse.click(chartBox!.x + 220, chartBox!.y + 160);
    await page.mouse.move(chartBox!.x + 420, chartBox!.y + 260);
    await page.mouse.click(chartBox!.x + 420, chartBox!.y + 260);
    await expect(chart).toHaveAttribute('data-drawing-count', '1');

    // Completing a drawing returns tool to Cursor and does NOT leave the floating toolbar visible
    await expect(drawingRail.getByRole('button', { name: 'Cursor', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('toolbar', { name: 'Drawing controls' })).toHaveCount(0);

    // 2. Explicitly click the Fibonacci drawing to select it and show contextual toolbar
    const fibDrawing = chart.locator('[data-drawing-type="fibonacci"]').first();
    await expect(fibDrawing).toBeVisible();
    const fibBox = await fibDrawing.boundingBox();
    expect(fibBox).not.toBeNull();

    await page.mouse.click(fibBox!.x + fibBox!.width / 2, fibBox!.y + fibBox!.height / 2);
    const toolbar = page.getByRole('toolbar', { name: 'Drawing controls' });
    await expect(toolbar).toBeVisible();
    await expect(toolbar).toContainText('fibonacci');

    // 3. Open Fibonacci settings popover
    await toolbar.getByRole('button', { name: 'Fibonacci settings', exact: true }).click();
    await expect(page.getByText('Fibonacci Retracement')).toBeVisible();
    await expect(page.getByText('Linear Price Space')).toBeVisible();
    await expect(page.getByText('Fibonacci levels are computed linearly in price space.')).toBeVisible();

    // Toggle Reverse setting
    const reverseCheckbox = page.getByLabel('Reverse');
    await expect(reverseCheckbox).not.toBeChecked();
    await reverseCheckbox.check();
    await expect(reverseCheckbox).toBeChecked();

    // Close popover with Escape
    await page.keyboard.press('Escape');
    await expect(page.getByText('Linear Price Space')).toHaveCount(0);

    // 4. Re-select and delete via keyboard, then restore via Ctrl+Z
    await page.mouse.click(fibBox!.x + fibBox!.width / 2, fibBox!.y + fibBox!.height / 2);
    await expect(toolbar).toBeVisible();
    await page.keyboard.press('Delete');
    await expect(chart).toHaveAttribute('data-drawing-count', '0');
    await expect(toolbar).toHaveCount(0);

    await page.keyboard.press('Control+z');
    await expect(chart).toHaveAttribute('data-drawing-count', '1');
});

test('creates Long/Short position objects with interactive risk HUD and synchronizes with Risk Terminal', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'Desktop position risk interaction check');

    const chart = page.getByRole('group', { name: 'Demo BTC price chart with options structure overlays' });
    const drawingRail = page.getByRole('navigation', { name: 'Chart drawing tools' });
    const chartBox = await chart.boundingBox();
    expect(chartBox).not.toBeNull();

    // 1. Arm Long position tool from left rail and place with 1 click
    await drawingRail.getByRole('button', { name: 'Long position', exact: true }).click();
    await page.mouse.click(chartBox!.x + 280, chartBox!.y + 190);
    await expect(chart).toHaveAttribute('data-drawing-count', '1');
    await expect(drawingRail.getByRole('button', { name: 'Cursor', exact: true })).toHaveAttribute('aria-pressed', 'true');

    // 2. Select the Long position object
    const longDrawing = chart.locator('[data-drawing-type="long-position"]').first();
    await expect(longDrawing).toBeVisible();
    await expect(longDrawing).toHaveAttribute('data-position-status', 'ready');

    const longBox = await longDrawing.boundingBox();
    expect(longBox).not.toBeNull();
    await page.mouse.click(longBox!.x + longBox!.width / 2, longBox!.y + longBox!.height / 2);

    const toolbar = page.getByRole('toolbar', { name: 'Drawing controls' });
    await expect(toolbar).toBeVisible();
    await expect(toolbar).toContainText('long position');
    await expect(toolbar).toContainText('READY');

    // Verify Chart HUD Badge
    await expect(page.getByTestId('position-hud-status').first()).toContainText('LONG');
    await expect(page.getByTestId('position-hud-status').first()).toContainText('READY');

    // 3. Open Inspector RISK Tab and verify two-way synchronization
    await page.getByRole('tab', { name: 'RISK', exact: true }).click();
    await expect(page.getByTestId('risk-metrics-card')).toBeVisible();

    const entryInput = page.getByTestId('risk-input-entry');
    const stopInput = page.getByTestId('risk-input-stop');
    const targetInput = page.getByTestId('risk-input-target');

    await expect(entryInput).toBeVisible();
    await expect(stopInput).toBeVisible();
    await expect(targetInput).toBeVisible();

    const entryPrice = Number(await entryInput.inputValue());
    const stopPrice = Number(await stopInput.inputValue());
    const targetPrice = Number(await targetInput.inputValue());

    expect(entryPrice).toBeGreaterThan(stopPrice);
    expect(targetPrice).toBeGreaterThan(entryPrice);

    // Verify Sizing outputs
    await expect(page.getByTestId('risk-metric-quantity')).toBeVisible();
    await expect(page.getByTestId('risk-metric-rrr')).toBeVisible();
    await expect(page.getByTestId('risk-metric-loss')).toBeVisible();
    await expect(page.getByTestId('risk-metric-profit')).toBeVisible();

    // 4. Invert geometry by setting Stop above Entry -> assert INVALID status and error banner
    await stopInput.fill(String(entryPrice + 500));
    await expect(longDrawing).toHaveAttribute('data-position-status', 'invalid');
    await expect(page.getByTestId('risk-error-INVALID_LONG_GEOMETRY')).toBeVisible();
    await expect(page.getByTestId('position-hud-status').first()).toContainText('INVALID');

    // Restore valid geometry
    await stopInput.fill(String(stopPrice));
    await expect(longDrawing).toHaveAttribute('data-position-status', 'ready');
    await expect(page.getByTestId('risk-error-INVALID_LONG_GEOMETRY')).toHaveCount(0);

    // 5. Create Short position object and verify Short geometry constraints
    await drawingRail.getByRole('button', { name: 'Short position', exact: true }).click();
    await page.mouse.click(chartBox!.x + 480, chartBox!.y + 190);
    await expect(chart).toHaveAttribute('data-drawing-count', '2');

    const shortDrawing = chart.locator('[data-drawing-type="short-position"]').first();
    await expect(shortDrawing).toBeVisible();
    await expect(shortDrawing).toHaveAttribute('data-position-status', 'ready');

    const shortBox = await shortDrawing.boundingBox();
    expect(shortBox).not.toBeNull();
    await page.mouse.click(shortBox!.x + shortBox!.width / 2, shortBox!.y + shortBox!.height / 2);

    await expect(page.getByTestId('position-hud-status').nth(1)).toContainText('SHORT');
    await expect(page.getByTestId('position-hud-status').nth(1)).toContainText('READY');
    const shortEntry = Number(await entryInput.inputValue());
    const shortStop = Number(await stopInput.inputValue());
    const shortTarget = Number(await targetInput.inputValue());

    expect(shortStop).toBeGreaterThan(shortEntry);
    expect(shortEntry).toBeGreaterThan(shortTarget);

    // 6. Automated accessibility check on the active Risk Terminal & chart
    const results = await new AxeBuilder({ page }).disableRules(['color-contrast']).analyze();
    const severe = results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact || ''));
    expect(severe).toEqual([]);
});

test('UX15.1/UX15.2 verifies independent position line and extent dragging, locked immutability, and live risk synchronization', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'Desktop position risk interaction check');
    test.setTimeout(240_000);

    const chart = page.locator('[role="group"][aria-label*="BTC price chart"]');
    await expect(chart).toBeVisible();
    const chartBox = await chart.boundingBox();
    expect(chartBox).not.toBeNull();

    const drawingRail = page.getByTestId('drawing-tools-rail');
    await drawingRail.getByRole('button', { name: 'Long position', exact: true }).click();
    await page.mouse.click(chartBox!.x + 360, chartBox!.y + 180);
    await expect(chart).toHaveAttribute('data-drawing-count', '1');

    const longDrawing = chart.locator('[data-drawing-type="long-position"]').first();
    await expect(longDrawing).toBeVisible();

    // Select drawing
    const longBox = await longDrawing.boundingBox();
    expect(longBox).not.toBeNull();
    await page.mouse.click(longBox!.x + longBox!.width / 2, longBox!.y + longBox!.height / 2);

    // Open RISK tab
    await page.getByRole('tab', { name: 'RISK', exact: true }).click();
    const metricsCard = page.getByTestId('risk-metrics-card');
    await expect(metricsCard).toBeVisible();

    // Verify initial attribute synchronization between chart position root and Risk Terminal
    const initialChartQty = await longDrawing.getAttribute('data-position-quantity');
    const initialTermQty = await metricsCard.getAttribute('data-terminal-quantity');
    expect(initialChartQty).toBeTruthy();
    expect(initialChartQty).toBe(initialTermQty);

    // 1. Drag Stop line independently
    const stopHit = longDrawing.locator('[data-testid="position-hit-stop"]');
    await expect(stopHit).toBeAttached();
    const stopBox = await stopHit.boundingBox();
    expect(stopBox).not.toBeNull();

    const stopInput = page.getByTestId('risk-input-stop');
    const entryInput = page.getByTestId('risk-input-entry');
    const targetInput = page.getByTestId('risk-input-target');

    const origStopPrice = Number(await stopInput.inputValue());
    const origEntryPrice = Number(await entryInput.inputValue());
    const origTargetPrice = Number(await targetInput.inputValue());

    // Drag stop downwards by 20px
    await page.mouse.move(stopBox!.x + stopBox!.width / 2, stopBox!.y + stopBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(stopBox!.x + stopBox!.width / 2, stopBox!.y + stopBox!.height / 2 + 20);
    await page.mouse.up();

    const draggedStopPrice = Number(await stopInput.inputValue());
    const draggedEntryPrice = Number(await entryInput.inputValue());
    const draggedTargetPrice = Number(await targetInput.inputValue());

    // Stop moved (lower price -> higher pixel Y), entry and target remain identical
    expect(draggedStopPrice).toBeLessThan(origStopPrice);
    expect(draggedEntryPrice).toBe(origEntryPrice);
    expect(draggedTargetPrice).toBe(origTargetPrice);

    // 2. Drag Target line independently
    const targetHit = longDrawing.locator('[data-testid="position-hit-target"]');
    await expect(targetHit).toBeAttached();
    const targetBox = await targetHit.boundingBox();
    expect(targetBox).not.toBeNull();

    // Drag target upwards by 20px (higher price -> lower pixel Y)
    await page.mouse.move(targetBox!.x + targetBox!.width / 2, targetBox!.y + targetBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(targetBox!.x + targetBox!.width / 2, targetBox!.y + targetBox!.height / 2 - 20);
    await page.mouse.up();

    const afterTargetPrice = Number(await targetInput.inputValue());
    const afterEntryPrice = Number(await entryInput.inputValue());
    const afterStopPrice = Number(await stopInput.inputValue());

    expect(afterTargetPrice).toBeGreaterThan(draggedTargetPrice);
    expect(afterEntryPrice).toBe(draggedEntryPrice);
    expect(afterStopPrice).toBe(draggedStopPrice);

    // 3. Drag Entry independently; Stop and Target must remain unchanged.
    const entryHit = longDrawing.locator('[data-testid="position-hit-entry"]');
    await expect(entryHit).toBeAttached();
    const entryBox = await entryHit.boundingBox();
    expect(entryBox).not.toBeNull();
    await page.mouse.move(entryBox!.x + entryBox!.width / 2, entryBox!.y + entryBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(entryBox!.x + entryBox!.width / 2, entryBox!.y + entryBox!.height / 2 + 8);
    await page.mouse.up();

    const afterEntryDragPrice = Number(await entryInput.inputValue());
    expect(afterEntryDragPrice).toBeLessThan(afterEntryPrice);
    expect(Number(await stopInput.inputValue())).toBe(afterStopPrice);
    expect(Number(await targetInput.inputValue())).toBe(afterTargetPrice);

    // 4. Test Left and Right extent drag handles independently.
    const leftHandle = longDrawing.locator('[data-testid="position-handle-left"]');
    const rightHandle = longDrawing.locator('[data-testid="position-handle-right"]');
    await expect(leftHandle).toBeVisible();
    await expect(rightHandle).toBeVisible();

    const beforeLeftStart = Number(await longDrawing.getAttribute('data-start-time'));
    const beforeLeftEnd = Number(await longDrawing.getAttribute('data-end-time'));
    const leftHandleBox = await leftHandle.boundingBox();
    expect(leftHandleBox).not.toBeNull();
    await page.mouse.move(leftHandleBox!.x + leftHandleBox!.width / 2, leftHandleBox!.y + leftHandleBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(leftHandleBox!.x + leftHandleBox!.width / 2 - 30, leftHandleBox!.y + leftHandleBox!.height / 2);
    await page.mouse.up();

    expect(Number(await longDrawing.getAttribute('data-start-time'))).not.toBe(beforeLeftStart);
    expect(Number(await longDrawing.getAttribute('data-end-time'))).toBe(beforeLeftEnd);
    expect(Number(await entryInput.inputValue())).toBe(afterEntryDragPrice);
    expect(Number(await stopInput.inputValue())).toBe(afterStopPrice);
    expect(Number(await targetInput.inputValue())).toBe(afterTargetPrice);

    const rightHandleBox = await rightHandle.boundingBox();
    expect(rightHandleBox).not.toBeNull();
    const beforeRightStart = Number(await longDrawing.getAttribute('data-start-time'));
    const beforeRightEnd = Number(await longDrawing.getAttribute('data-end-time'));

    // Move inward so the chart's right-edge time clamp cannot absorb the drag.
    await page.mouse.move(rightHandleBox!.x + rightHandleBox!.width / 2, rightHandleBox!.y + rightHandleBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(rightHandleBox!.x + rightHandleBox!.width / 2 - 40, rightHandleBox!.y + rightHandleBox!.height / 2);
    await page.mouse.up();

    // All prices must be strictly preserved after extent drag
    expect(Number(await longDrawing.getAttribute('data-start-time'))).toBe(beforeRightStart);
    expect(Number(await longDrawing.getAttribute('data-end-time'))).not.toBe(beforeRightEnd);
    expect(Number(await entryInput.inputValue())).toBe(afterEntryDragPrice);
    expect(Number(await stopInput.inputValue())).toBe(afterStopPrice);
    expect(Number(await targetInput.inputValue())).toBe(afterTargetPrice);

    // 5. Drag the body while preserving stop/target distances and horizontal duration.
    const bodyHit = longDrawing.locator('[data-testid="position-hit-body"]');
    const bodyBox = await bodyHit.boundingBox();
    const currentEntryBox = await entryHit.boundingBox();
    const currentTargetBox = await targetHit.boundingBox();
    expect(bodyBox).not.toBeNull();
    expect(currentEntryBox).not.toBeNull();
    expect(currentTargetBox).not.toBeNull();
    const safeBodyY = ((currentEntryBox!.y + currentEntryBox!.height / 2) + (currentTargetBox!.y + currentTargetBox!.height / 2)) / 2;
    const safeBodyX = bodyBox!.x + bodyBox!.width * 0.35;
    const beforeBodyEntry = Number(await entryInput.inputValue());
    const beforeBodyStop = Number(await stopInput.inputValue());
    const beforeBodyTarget = Number(await targetInput.inputValue());
    const beforeBodyStart = Number(await longDrawing.getAttribute('data-start-time'));
    const beforeBodyEnd = Number(await longDrawing.getAttribute('data-end-time'));
    await page.mouse.move(safeBodyX, safeBodyY);
    await page.mouse.down();
    await page.mouse.move(safeBodyX + 24, safeBodyY + 12);
    await page.mouse.up();

    const afterBodyEntry = Number(await entryInput.inputValue());
    const afterBodyStop = Number(await stopInput.inputValue());
    const afterBodyTarget = Number(await targetInput.inputValue());
    const afterBodyStart = Number(await longDrawing.getAttribute('data-start-time'));
    const afterBodyEnd = Number(await longDrawing.getAttribute('data-end-time'));
    expect(afterBodyEntry).not.toBe(beforeBodyEntry);
    expect(afterBodyEntry - afterBodyStop).toBeCloseTo(beforeBodyEntry - beforeBodyStop, 5);
    expect(afterBodyTarget - afterBodyEntry).toBeCloseTo(beforeBodyTarget - beforeBodyEntry, 5);
    expect(afterBodyEnd - afterBodyStart).toBe(beforeBodyEnd - beforeBodyStart);

    // 6. Use an actual Stop-line pointer drag to create and report invalid Long geometry.
    const currentStopBox = await stopHit.boundingBox();
    const movedEntryBox = await entryHit.boundingBox();
    expect(currentStopBox).not.toBeNull();
    expect(movedEntryBox).not.toBeNull();
    await page.mouse.move(currentStopBox!.x + currentStopBox!.width / 2, currentStopBox!.y + currentStopBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(currentStopBox!.x + currentStopBox!.width / 2, movedEntryBox!.y - 24);
    await page.mouse.up();
    await expect(longDrawing).toHaveAttribute('data-position-status', 'invalid');
    await expect(page.getByTestId('risk-error-INVALID_LONG_GEOMETRY')).toBeVisible();

    const currentEntry = Number(await entryInput.inputValue());
    await stopInput.fill(String(currentEntry - 500));
    await expect(longDrawing).toHaveAttribute('data-position-status', 'ready');

    // 7. Change risk settings in Risk Terminal and assert live updates on both terminal and chart HUD
    const beforeSettingsChartQty = await longDrawing.getAttribute('data-position-quantity');
    const equityInput = page.getByTestId('risk-input-equity');
    await equityInput.fill('200000');

    await expect(async () => {
        const updatedChartQty = await longDrawing.getAttribute('data-position-quantity');
        const updatedTermQty = await metricsCard.getAttribute('data-terminal-quantity');
        expect(updatedChartQty).toBe(updatedTermQty);
        expect(Number(updatedChartQty)).toBeGreaterThan(Number(beforeSettingsChartQty));
    }).toPass();

    // Reset defaults button resets equity and syncs back
    const resetBtn = page.getByTitle('Reset risk parameters to defaults');
    await resetBtn.click();
    await expect(async () => {
        const resetChartQty = await longDrawing.getAttribute('data-position-quantity');
        const resetTermQty = await metricsCard.getAttribute('data-terminal-quantity');
        expect(resetChartQty).toBe(resetTermQty);
        expect(resetChartQty).toBe(beforeSettingsChartQty);
    }).toPass();

    // 8. Locking removes controls and a pointer drag at the former Stop location cannot mutate the object.
    const lockedEntry = Number(await longDrawing.getAttribute('data-position-entry'));
    const lockedStop = Number(await longDrawing.getAttribute('data-position-stop'));
    const lockedTarget = Number(await longDrawing.getAttribute('data-position-target'));
    const formerStopBox = await stopHit.boundingBox();
    expect(formerStopBox).not.toBeNull();
    const toolbar = page.getByRole('toolbar', { name: 'Drawing controls' });
    const lockBtn = toolbar.getByRole('button', { name: 'Lock selected drawing' });
    await lockBtn.click();
    await expect(longDrawing).toHaveAttribute('data-locked', 'true');
    // When locked, the draggable hit area elements are unmounted to prevent interaction
    await expect(longDrawing.locator('[data-testid="position-hit-stop"]')).toHaveCount(0);
    await page.mouse.move(formerStopBox!.x + formerStopBox!.width / 2, formerStopBox!.y + formerStopBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(formerStopBox!.x + formerStopBox!.width / 2, formerStopBox!.y - 40);
    await page.mouse.up();
    expect(Number(await longDrawing.getAttribute('data-position-entry'))).toBe(lockedEntry);
    expect(Number(await longDrawing.getAttribute('data-position-stop'))).toBe(lockedStop);
    expect(Number(await longDrawing.getAttribute('data-position-target'))).toBe(lockedTarget);
});

test('renders sequence-validated liquidity frames as a toggleable chart heatmap', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'Desktop heatmap layer check');
    test.setTimeout(180_000);
    await mountLiveMarketRoutes(page);
    await page.addInitScript(() => {
        localStorage.setItem(
            'btc-terminal-ui-v1',
            JSON.stringify({ state: { dataMode: 'LIVE', activeWorkspace: 'MARKET STRUCTURE' }, version: 1 }),
        );

        class FakeLiquidityWorker {
            onmessage: ((event: MessageEvent) => void) | null = null;
            onerror: ((event: ErrorEvent) => void) | null = null;

            postMessage(message: { type?: string }) {
                if (message.type !== 'START') return;
                window.setTimeout(() => {
                    const coverage = {
                        startedAt: 1_740_000_000_000,
                        endedAt: 1_740_000_000_500,
                        frameCount: 2,
                        frameCapacity: 1_800,
                        warmupPercent: 2 / 18,
                    };
                    this.onmessage?.(new MessageEvent('message', {
                        data: {
                            type: 'STATUS',
                            connected: true,
                            paused: false,
                            reconnectAttempt: 0,
                            resyncRequired: false,
                            sequence: {
                                state: 'LIVE',
                                lastUpdateId: 90_123_458,
                                lastEventTime: 1_740_000_000_500,
                                bufferedEventCount: 0,
                                gapCount: 0,
                                successfulBootstrapCount: 1,
                            },
                            coverage,
                        },
                    }));
                    for (const [index, capturedAt] of [1_740_000_000_000, 1_740_000_000_500].entries()) {
                        this.onmessage?.(new MessageEvent('message', {
                            data: {
                                type: 'FRAME',
                                coverage,
                                frame: {
                                    schemaVersion: 1,
                                    source: 'BINANCE_SPOT',
                                    symbol: 'BTCUSDT',
                                    venue: 'BINANCE_SPOT',
                                    capturedAt,
                                    eventTime: capturedAt - 10,
                                    lastUpdateId: 90_123_457 + index,
                                    bestBid: 68_410,
                                    bestAsk: 68_430,
                                    midPrice: 68_420,
                                    levels: [
                                        { side: 'BID', price: 68_380, quantity: 8 + index, notionalUsd: 547_040 + index * 68_380 },
                                        { side: 'ASK', price: 68_460, quantity: 7 + index, notionalUsd: 479_220 + index * 68_460 },
                                    ],
                                },
                            },
                        }));
                    }
                }, 0);
            }

            terminate() {}
        }

        Object.defineProperty(window, 'Worker', { configurable: true, value: FakeLiquidityWorker });
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByLabel('Live BTC price chart with options structure overlays')).toBeVisible({ timeout: 30_000 });

    const heatmap = page.getByTestId('liquidity-heatmap');
    await expect(heatmap).toBeVisible({ timeout: 20_000 });
    await expect(heatmap).toHaveAttribute('data-state', 'LIVE');
    await expect(heatmap).toHaveAttribute('data-frame-count', '2');
    await expect.poll(async () => Number(await heatmap.getAttribute('data-cell-count'))).toBeGreaterThan(0);

    await page.getByRole('button', { name: 'Layers', exact: true }).click();
    const heatmapSwitch = page.getByRole('switch', { name: 'Liquidity heatmap' });
    await expect(heatmapSwitch).toHaveAttribute('data-state', 'checked');
    await heatmapSwitch.click();
    await expect(heatmap).toHaveCount(0);
    await heatmapSwitch.click();
    await expect(page.getByTestId('liquidity-heatmap')).toBeVisible();
});
