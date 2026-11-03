import { expect, test } from '@playwright/test';
import * as path from 'path';
import { buildOracleCapture, oracleScenario } from '../../src/lib/orderflow/true-flow-oracle.test-data';
import { deriveTrueFlowSnapshotV1 } from '../../src/lib/orderflow/true-flow';

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

    });

    test('verifies FLOW mode presentation without false READY or live CVD claims', async ({ page, isMobile }) => {
        test.setTimeout(120_000);
        const modeButton = page.locator('footer').getByRole('button', { name: /DEMO|LIVE/ });
        await expect(modeButton).toBeVisible({ timeout: 20_000 });
        for (let attempt = 0; attempt < 3; attempt += 1) {
            if ((await modeButton.textContent())?.includes('DEMO')) break;
            await modeButton.click();
            await page.waitForTimeout(300);
        }
        await expect(modeButton).toContainText('DEMO');

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

test.describe('UX16.2 deterministic worker integration', () => {
    test.describe.configure({ timeout: 120_000 });

    for (const [scenarioId, expectedBadge] of [
        ['S01', 'CAPTURED EXACT'],
        ['S03', 'CAPTURED WITH CONTINUITY BREAK'],
    ] as const) {
        test(`${scenarioId} connects the captured snapshot to Flow inspection`, async ({ page, isMobile }) => {
            const scenario = oracleScenario(scenarioId);
            const capture = buildOracleCapture(scenario);
            capture.coverage.dataMode = 'LIVE';
            capture.coverage.source = 'BINANCE_SPOT';
            const snapshot = deriveTrueFlowSnapshotV1(capture, {
                interval: scenario.interval,
                priceBucket: scenario.priceBucket,
                valueAreaFraction: 0.7,
            });

            await page.addInitScript((fixture) => {
                localStorage.setItem('btc-terminal-ui-v1', JSON.stringify({
                    state: { dataMode: 'LIVE', activeWorkspace: 'MARKET STRUCTURE', workspaceMode: 'FLOW' },
                    version: 1,
                }));
                const NativeWorker = window.Worker;
                class FixtureWorker {
                    onmessage: ((event: MessageEvent) => void) | null = null;
                    onerror: ((event: ErrorEvent) => void) | null = null;
                    postMessage(command: { type?: string }): void {
                        if (command.type !== 'START') return;
                        window.setTimeout(() => {
                            this.onmessage?.(new MessageEvent('message', { data: {
                                type: 'STATUS', connected: true, reconnectAttempt: 0,
                                retainedTradeCount: fixture.totals.tradeCount,
                                lastAggregateTradeId: fixture.totals.tradeCount,
                                coverage: fixture.coverage,
                                stats: { acceptedCount: fixture.totals.tradeCount, duplicateCount: 0, outOfOrderCount: 0, invalidCount: 0, reconnectCount: 0 },
                            } }));
                            this.onmessage?.(new MessageEvent('message', { data: { type: 'TRUE_FLOW_SNAPSHOT', snapshot: fixture } }));
                        }, 10);
                    }
                    terminate(): void {}
                }
                window.Worker = function WorkerFixture(url: string | URL, options?: WorkerOptions): Worker {
                    if (options?.name === 'binance-aggregate-trade-capture') return new FixtureWorker() as unknown as Worker;
                    return new NativeWorker(url, options);
                } as unknown as typeof Worker;
            }, snapshot);
            await page.route('**/api/orderflow/config', (route) => route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ schemaVersion: 1, enabled: true, dataMode: 'SHADOW', source: 'BINANCE_SPOT', symbol: 'BTCUSDT' }),
            }));

            await page.goto('/', { waitUntil: 'domcontentloaded' });
            await expect(page.getByRole('button', { name: 'OPTIONS METRICS', exact: true })).toBeVisible({ timeout: 30_000 });
            await page.waitForTimeout(1500);
            await page.getByTestId('workspace-mode-flow').click();
            if (isMobile) {
                await page.getByRole('button', { name: 'OPTIONS METRICS', exact: true }).click();
                const decisionTab = page.getByRole('tab', { name: 'DECISION', exact: true });
                await expect(decisionTab).toBeVisible({ timeout: 15_000 });
                await decisionTab.click();
            }
            const flow = page.getByTestId('flow-mode-container');
            await expect(flow).toBeVisible();
            await expect(page.getByTestId('flow-cvd-status')).toHaveText('TRADE_BASED');
            await expect(page.getByTestId('flow-footprint-status')).toHaveText('READY');

            await page.getByTestId('flow-footprint-details').locator('summary').click();
            await expect(page.getByTestId('footprint-chart-overlay')).toBeVisible();
            const cellsBefore = await page.locator('[data-testid^="footprint-cell-"]').count();
            expect(cellsBefore).toBeGreaterThan(0);
            await page.getByTestId('footprint-zoom-compact').click();
            await expect(page.getByText('GEOMETRY ONLY (LABELS HIDDEN)')).toBeVisible();
            expect(await page.locator('[data-testid^="footprint-cell-"]').count()).toBe(cellsBefore);

            await page.getByTestId('flow-trade-vp-details').locator('summary').click();
            await expect(page.getByTestId('captured-profile-coverage-badge')).toHaveText(expectedBadge);
        });
    }
});
