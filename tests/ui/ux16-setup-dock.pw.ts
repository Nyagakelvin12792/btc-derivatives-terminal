import { expect, test } from '@playwright/test';
import * as path from 'path';
import { buildOracleCapture, oracleScenario } from '../../src/lib/orderflow/true-flow-oracle.test-data';
import { deriveTrueFlowSnapshotV1 } from '../../src/lib/orderflow/true-flow';

test.describe('UX16.6 Setup State Machine & Decision Dock Acceptance', () => {
    test('verifies Setup Mode answers what, where, trigger, and invalidation across viewports', async ({ page, isMobile }) => {
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
                state: {
                    dataMode: 'LIVE',
                    activeWorkspace: 'MARKET STRUCTURE',
                    workspaceMode: 'SETUP',
                    inspectorTab: 'DECISION',
                    inspectorOpen: true,
                },
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
                            type: 'STATUS',
                            connected: true,
                            reconnectAttempt: 0,
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
        await page.waitForTimeout(2000);

        // Ensure SETUP mode is active
        const setupBtn = page.getByTestId('workspace-mode-setup').first();
        await setupBtn.click();
        await expect(setupBtn).toHaveAttribute('aria-selected', 'true');
        if (isMobile) {
            await page.getByRole('button', { name: 'OPTIONS METRICS', exact: true }).click();
            const decisionTab = page.getByRole('tab', { name: 'DECISION', exact: true });
            await expect(decisionTab).toBeVisible({ timeout: 15_000 });
            await decisionTab.click();
        }

        const setupContainer = page.getByTestId('setup-mode-container');
        await expect(setupContainer).toBeVisible({ timeout: 15_000 });

        // 1. WHAT: Setup State Machine (State and Grade)
        const stateContainer = setupContainer.getByTestId('setup-state-container');
        await expect(stateContainer).toBeVisible();
        await expect(stateContainer.getByTestId('setup-state-value')).toBeVisible();
        await expect(stateContainer.getByTestId('setup-grade-value')).toBeVisible();

        // 2. WHERE: Decision Zone
        const zoneContainer = setupContainer.getByTestId('setup-zone-container');
        await expect(zoneContainer).toBeVisible();

        // 3. CONFIRMATION: Confirmation Trigger
        const triggerContainer = setupContainer.getByTestId('setup-trigger-container');
        await expect(triggerContainer).toBeVisible();

        // 4. INVALIDATION: Structural Invalidation
        const invalidationContainer = setupContainer.getByTestId('setup-invalidation-container');
        await expect(invalidationContainer).toBeVisible();

        // 5. MANDATORY GATES
        const gradeContainer = setupContainer.getByTestId('setup-grade-container');
        await expect(gradeContainer).toBeVisible();
        await expect(gradeContainer.getByText('MANDATORY GATES')).toBeVisible();

        // 6. ENHANCERS MATRIX
        const enhancersContainer = setupContainer.getByTestId('setup-enhancers-container');
        await expect(enhancersContainer).toBeVisible();
        await expect(enhancersContainer.getByText('ENHANCERS MATRIX')).toBeVisible();

        // 7. JEV SHADOW EXPLANATION (Collapsible)
        const jevContainer = setupContainer.getByTestId('setup-jev-shadow-container');
        await expect(jevContainer).toBeVisible();
        await expect(jevContainer.getByText('JEV SHADOW EXPLANATION')).toBeVisible();
        await expect(jevContainer.getByText('SHADOW ADAPTER')).toBeVisible();

        const artifactDir = path.resolve(process.cwd(), '.artifacts', 'ui-overhaul');

        if (!isMobile) {
            // Desktop 1920x1080
            await page.setViewportSize({ width: 1920, height: 1080 });
            await page.waitForTimeout(500);
            const desktopNoOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
            expect(desktopNoOverflow).toBe(true);
            await page.screenshot({ path: path.join(artifactDir, 'ux16-6-setup-desktop-1920x1080.png'), fullPage: false });

            // Compact 1664x936
            await page.setViewportSize({ width: 1664, height: 936 });
            await page.waitForTimeout(500);
            const compactNoOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
            expect(compactNoOverflow).toBe(true);
            await page.screenshot({ path: path.join(artifactDir, 'ux16-6-setup-compact-1664x936.png'), fullPage: false });

            // Laptop 1366x768
            await page.setViewportSize({ width: 1366, height: 768 });
            await page.waitForTimeout(500);
            const laptopNoOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
            expect(laptopNoOverflow).toBe(true);
            await page.screenshot({ path: path.join(artifactDir, 'ux16-6-setup-laptop-1366x768.png'), fullPage: false });
        } else {
            // Mobile 390x844
            await page.setViewportSize({ width: 390, height: 844 });
            await page.waitForTimeout(500);
            await page.screenshot({ path: path.join(artifactDir, 'ux16-6-setup-mobile-390x844.png'), fullPage: false });
        }
    });
});
