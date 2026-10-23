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
    for (const label of ['Cursor', 'Trend line', 'Horizontal line', 'Vertical line', 'Rectangle', 'Long position', 'Short position', 'Text note']) {
        await expect(drawingRail.getByRole('button', { name: label, exact: true })).toBeVisible();
    }
    for (const duplicateLabel of ['Cursor', 'Draw', 'Horizontal', 'Vertical', 'Long', 'Short']) {
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
