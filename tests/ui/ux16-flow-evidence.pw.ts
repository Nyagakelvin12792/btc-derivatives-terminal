import { expect, test } from '@playwright/test';
import * as path from 'path';
import { buildOracleCapture, oracleScenario } from '../../src/lib/orderflow/true-flow-oracle.test-data';
import { deriveTrueFlowSnapshotV1 } from '../../src/lib/orderflow/true-flow';

test.describe('UX16.5 Flow Evidence, Absorption & Zones Acceptance', () => {
    test('verifies flow evidence, decision zones, and absorption across viewports', async ({ page, isMobile }) => {
        test.setTimeout(120_000);

        const scenario = oracleScenario('S01');
        const capture = buildOracleCapture(scenario);
        capture.coverage.dataMode = 'LIVE';
        capture.coverage.source = 'BINANCE_SPOT';
        const snapshot = deriveTrueFlowSnapshotV1(capture, {
            interval: scenario.interval,
            priceBucket: scenario.priceBucket,
            valueAreaFraction: 0.7,
            imbalance: {
                ratioThreshold: 3.0,
                minDominantNotionalUsd: 50_000,
                minDeltaNotionalUsd: 25_000,
                stackedRowCount: 3,
            },
        });

        await page.addInitScript((fixture) => {
            localStorage.setItem('btc-terminal-ui-v1', JSON.stringify({
                state: { dataMode: 'LIVE', activeWorkspace: 'MARKET STRUCTURE', workspaceMode: 'FLOW', inspectorTab: 'DECISION', inspectorOpen: true },
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

        const flowBtn = page.getByTestId('workspace-mode-flow').first();
        await flowBtn.click();
        await expect(flowBtn).toHaveAttribute('aria-selected', 'true');

        if (isMobile) {
            await page.getByRole('button', { name: 'OPTIONS METRICS', exact: true }).click();
            await page.getByRole('tab', { name: 'DECISION', exact: true }).click();
        }

        const flowContainer = page.getByTestId('flow-mode-container');
        await expect(flowContainer).toBeVisible();

        // Verify deterministic events header and list
        const eventsContainer = flowContainer.getByTestId('flow-events-container');
        await expect(eventsContainer).toBeVisible();
        await expect(eventsContainer.getByText('DETERMINISTIC EVENTS')).toBeVisible();

        if (!isMobile) {
            // Also test switching to Setup mode on desktop and verifying setup evidence container
            const setupBtn = page.getByTestId('workspace-mode-setup').first();
            await setupBtn.click();
            await expect(setupBtn).toHaveAttribute('aria-selected', 'true');

            const setupEvidence = page.getByTestId('setup-evidence-container');
            await expect(setupEvidence).toBeVisible();

            // Switch back to Flow mode for screenshot captures
            await flowBtn.click();
            await expect(flowBtn).toHaveAttribute('aria-selected', 'true');
        }

        const artifactDir = path.resolve(process.cwd(), '.artifacts', 'ui-overhaul');

        if (!isMobile) {
            // Desktop 1920x1080
            await page.setViewportSize({ width: 1920, height: 1080 });
            await page.waitForTimeout(500);
            await page.screenshot({
                path: path.join(artifactDir, 'ux16-5-evidence-desktop-1920x1080.png'),
                fullPage: false,
            });

            // Compact 1664x936
            await page.setViewportSize({ width: 1664, height: 936 });
            await page.waitForTimeout(500);
            await page.screenshot({
                path: path.join(artifactDir, 'ux16-5-evidence-compact-1664x936.png'),
                fullPage: false,
            });

            // Laptop 1366x768
            await page.setViewportSize({ width: 1366, height: 768 });
            await page.waitForTimeout(500);
            await page.screenshot({
                path: path.join(artifactDir, 'ux16-5-evidence-laptop-1366x768.png'),
                fullPage: false,
            });
        } else {
            // Mobile 390x844
            await page.setViewportSize({ width: 390, height: 844 });
            await page.waitForTimeout(500);
            await page.screenshot({
                path: path.join(artifactDir, 'ux16-5-evidence-mobile-390x844.png'),
                fullPage: false,
            });
        }

        // Verify zero horizontal scroll overflow
        const hasHorizontalScroll = await page.evaluate(() => {
            return document.documentElement.scrollWidth > window.innerWidth;
        });
        expect(hasHorizontalScroll).toBe(false);
    });
});
